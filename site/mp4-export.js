/* CDE Imports MP4 exporter: native AVC/AAC capture + browser-local FFmpeg normalization.
 * The output is REAL MP4, not a renamed WebM. No media is uploaded to third parties.
 */
(function cdeMP4Module(global){
 'use strict';
 const FFMPEG_UMD='https://cdnjs.cloudflare.com/ajax/libs/ffmpeg/0.12.15/umd';
 const FFMPEG_CORE='https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm';
 const FFMPEG_ESM='https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.15/dist/esm';
 let scriptLoad=null;
 const encodeType=(mime)=>String(mime||'').split(';')[0].trim().toLowerCase();
 function chooseRecorderMime(recorderClass=global.MediaRecorder){
  if(!recorderClass?.isTypeSupported)return null;
  // Avoid generic MP4; browsers may pick VP9/Opus, which Meta won't publish.
  const formats=[
   'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
   'video/mp4;codecs=avc1.424028,mp4a.40.2',
   'video/mp4;codecs=avc1,mp4a.40.2',
   'video/mp4;codecs=avc1.42E01E',
   'video/mp4;codecs=avc1',
   'video/webm;codecs=vp8,opus',
   'video/webm;codecs=vp8',
   'video/webm'
  ];
  return formats.find(m=>recorderClass.isTypeSupported(m))||null;
 }
 async function examineMP4(blob){
  if(!blob||!blob.size)return {valid:false,fastStart:false};
  const first=new Uint8Array(await blob.slice(0,Math.min(blob.size,2*1024*1024)).arrayBuffer());
  if(first.byteLength<12)return {valid:false,fastStart:false};
  const view=new DataView(first.buffer,first.byteOffset,first.byteLength);
  const boxName=o=>String.fromCharCode(first[o+4],first[o+5],first[o+6],first[o+7]);
  let off=0,ftyp=false,moov=false;
  while(off+8<=first.byteLength){
   let size=view.getUint32(off);
   const name=boxName(off);
   if(name==='ftyp')ftyp=true;
   if(name==='moov')moov=true;
   if(name==='mdat')return {valid:ftyp,fastStart:ftyp&&moov};
   if(size===1){
    if(off+16>first.byteLength)return {valid:ftyp,fastStart:false};
    const high=view.getUint32(off+8),low=view.getUint32(off+12);
    size=high*4294967296+low;
   }else if(size===0)break;
   if(!Number.isSafeInteger(size)||size<8||off+size>first.byteLength)break;
   off+=size;
  }
  return {valid:ftyp,fastStart:ftyp&&moov};
 }
 // Inspect actual sample descriptions: some browsers claim AAC but record Opus.
 async function inspectCodecs(blob){
  const bytes=new Uint8Array(await blob.slice(0,Math.min(blob.size,2*1024*1024)).arrayBuffer());
  const view=new DataView(bytes.buffer),found=[];
  const name=offset=>String.fromCharCode(...bytes.slice(offset,offset+4));
  function walk(start,end,depth=0){
   if(depth>8)return;
   for(let off=start;off+8<=end;){
    const size=view.getUint32(off),kind=name(off+4);
    if(size<8||off+size>end)break;
    if(['moov','trak','mdia','minf','stbl'].includes(kind))walk(off+8,off+size,depth+1);
    if(kind==='stsd'&&size>=16){
     const count=view.getUint32(off+12);let entry=off+16;
     for(let i=0;i<count&&entry+8<=off+size;i++){
      const length=view.getUint32(entry);if(length<8||entry+length>off+size)break;
      found.push(name(entry+4));entry+=length;
     }
    }
    off+=size;
   }
  }
  walk(0,bytes.length);return found;
 }
 function script(){
  if(global.FFmpegWASM?.FFmpeg)return Promise.resolve();
  if(scriptLoad)return scriptLoad;
  scriptLoad=new Promise((resolve,reject)=>{
   const node=document.createElement('script');
   node.src=FFMPEG_UMD+'/ffmpeg.min.js';
   node.crossOrigin='anonymous';
   node.onload=()=>global.FFmpegWASM?.FFmpeg?resolve():reject(Error('Biblioteca FFmpeg não inicializou.'));
   node.onerror=()=>reject(Error('Falha ao carregar o conversor MP4. Verifique sua conexão.'));
   document.head.append(node);
  }).catch(e=>{scriptLoad=null;throw e;});
  return scriptLoad;
 }
 async function blobURL(url,kind){
  const r=await fetch(url,{mode:'cors',cache:'force-cache'});
  if(!r.ok)throw Error('Não foi possível carregar componente de conversão MP4 ('+r.status+').');
  return URL.createObjectURL(new Blob([await r.arrayBuffer()],{type:kind}));
 }
 async function convertToMP4(input,{native=false,onProgress=()=>{}}={}){
  const current=native?await examineMP4(input):{valid:false,fastStart:false};
  const codecs=native?await inspectCodecs(input):[];
  const incompatible=codecs.some(codec=>!['avc1','avc3','mp4a'].includes(codec));
  if(native&&current.valid&&current.fastStart&&!incompatible)return input;
  if(input.size>180*1024*1024)
   throw Error('Para vídeos longos, faça a conversão em trechos menores. A conversão local MP4 aceita até 180 MB de gravação.');
  onProgress('Carregando conversor MP4 gratuito no navegador (aproximadamente 32 MB)...');
  await script();
  const ffmpeg=new global.FFmpegWASM.FFmpeg();
  const temporary=[];
  const inputName=native?'cde-source.mp4':'cde-source.webm';
  try{
   // FFmpeg 0.12 creates a module worker when classWorkerURL is supplied.
   // Use the official ESM worker; UMD importScripts fails inside module workers.
   const worker=URL.createObjectURL(new Blob(['import "'+FFMPEG_ESM+'/worker.js";'],{type:'text/javascript'}));
   temporary.push(worker);
   const core=await blobURL(FFMPEG_CORE+'/ffmpeg-core.js','text/javascript');
   temporary.push(core);
   const wasm=await blobURL(FFMPEG_CORE+'/ffmpeg-core.wasm','application/wasm');
   temporary.push(wasm);
   await ffmpeg.load({classWorkerURL:worker,coreURL:core,wasmURL:wasm});
   onProgress(native?'Finalizando o MP4 para Instagram...':'Convertendo vídeo para H.264 e áudio AAC (MP4)...');
   await ffmpeg.writeFile(inputName,new Uint8Array(await input.arrayBuffer()));
   const args=native?
    ['-i',inputName,'-c:v',codecs.some(x=>['vp09','hvc1','hev1','av01'].includes(x))?'libx264':'copy','-c:a',incompatible?'aac':'copy','-movflags','+faststart','cde-result.mp4']:
    ['-i',inputName,'-c:v','libx264','-preset','ultrafast','-crf','24',
     '-pix_fmt','yuv420p','-r','24','-c:a','aac','-b:a','128k','-ar','48000',
     '-movflags','+faststart','cde-result.mp4'];
   let exitCode=await ffmpeg.exec(args);
   if(exitCode!==0&&native){
    onProgress('Ajustando codecs do MP4 para compatibilidade com o Instagram...');
    exitCode=await ffmpeg.exec(['-i',inputName,'-c:v','libx264','-preset','ultrafast',
     '-crf','24','-pix_fmt','yuv420p','-r','24','-c:a','aac','-b:a','128k',
     '-ar','48000','-movflags','+faststart','cde-result.mp4']);
   }
   if(exitCode!==0)throw Error('FFmpeg não conseguiu converter o vídeo. Tente um vídeo de menor duração.');
   const data=await ffmpeg.readFile('cde-result.mp4');
   const result=new Blob([data],{type:'video/mp4'});
   const checked=await examineMP4(result);
   if(!checked.valid||!checked.fastStart)throw Error('O MP4 resultante não possui estrutura adequada para o Instagram.');
   if((await inspectCodecs(result)).some(x=>!['avc1','avc3','mp4a'].includes(x)))throw Error('O vídeo convertido ainda não possui codecs compatíveis com o Instagram.');
   if(!result.size)throw Error('O MP4 convertido ficou vazio.');
   return result;
  }catch(error){
   throw error instanceof Error?error:new Error(String(error||'Falha no conversor MP4.'));
  }finally{
   try{ffmpeg.terminate();}catch{}
   for(const url of temporary)URL.revokeObjectURL(url);
  }
 }
 // Offline editing: process file bytes instead of replaying/recording the preview.
 let editEngine=null,editTail=Promise.resolve();
 async function engine(){
  if(editEngine)return editEngine;
  editEngine=(async()=>{
   await script();const ffmpeg=new global.FFmpegWASM.FFmpeg(),urls=[];
   try{
    const worker=URL.createObjectURL(new Blob(['import "'+FFMPEG_ESM+'/worker.js";'],{type:'text/javascript'}));urls.push(worker);
    const core=await blobURL(FFMPEG_CORE+'/ffmpeg-core.js','text/javascript');urls.push(core);
    const wasm=await blobURL(FFMPEG_CORE+'/ffmpeg-core.wasm','application/wasm');urls.push(wasm);
    await ffmpeg.load({classWorkerURL:worker,coreURL:core,wasmURL:wasm});return ffmpeg;
   }catch(e){ffmpeg.terminate();throw e;}
   finally{urls.forEach(url=>URL.revokeObjectURL(url));}
  })().catch(e=>{editEngine=null;throw e;});
  return editEngine;
 }
 async function renderVideo(input,{width,height,start=0,end,fit='contain',overlay=null,onProgress=()=>{}}){
  if(!input?.size||input.size>180*1024*1024)throw Error('A edição aceita arquivos de até 180 MB. Use o modo rápido para MP4 já pronto de até 300 MB.');
  if(![720,1280].includes(width)||![720,1280].includes(height)||!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start)throw Error('Formato ou intervalo de edição inválido.');
  const task=async()=>{
   onProgress('Preparando edição do arquivo…');const ffmpeg=await engine();
   const progress=event=>onProgress('Editando vídeo: '+Math.min(99,Math.max(0,Math.round((event.progress||0)*100)))+'%');
   ffmpeg.on?.('progress',progress);
   try{
    await ffmpeg.writeFile('edit-source',new Uint8Array(await input.arrayBuffer()));
    const top=overlay?Math.round(height*.14):0,bottom=overlay?Math.round(height*.11):0,area=height-top-bottom;
    const scale=fit==='cover'?'scale='+width+':'+area+':force_original_aspect_ratio=increase,crop='+width+':'+area:
     'scale='+width+':'+area+':force_original_aspect_ratio=decrease,pad='+width+':'+area+':(ow-iw)/2:(oh-ih)/2:color=0x071941';
    let filter=scale+',setsar=1';
    const args=['-y','-ss',String(start),'-t',String(end-start),'-i','edit-source'];
    if(overlay){
     await ffmpeg.writeFile('edit-brand.png',new Uint8Array(await overlay.arrayBuffer()));
     args.push('-i','edit-brand.png','-filter_complex','[0:v]'+filter+',pad='+width+':'+height+':0:'+top+':color=0x071941[base];[base][1:v]overlay=0:0:format=auto,format=yuv420p[out]','-map','[out]');
    }else args.push('-vf',filter,'-map','0:v:0');
    args.push('-map','0:a:0?','-c:v','libx264','-preset','ultrafast','-crf','23','-pix_fmt','yuv420p','-r','30','-c:a','aac','-b:a','128k','-movflags','+faststart','edit-result.mp4');
    if(await ffmpeg.exec(args)!==0)throw Error('Não foi possível editar este arquivo. Verifique o vídeo ou use outro formato.');
    const result=new Blob([await ffmpeg.readFile('edit-result.mp4')],{type:'video/mp4'});
    const checked=await examineMP4(result),codecs=await inspectCodecs(result);
    if(!checked.valid||!checked.fastStart||codecs.some(x=>!['avc1','avc3','mp4a'].includes(x)))throw Error('O vídeo editado não passou na validação MP4.');
    return result;
   }catch(e){throw e instanceof Error?e:new Error(String(e));}
   finally{ffmpeg.off?.('progress',progress);for(const name of ['edit-source','edit-brand.png','edit-result.mp4'])try{await ffmpeg.deleteFile(name);}catch{}}
  };
  const pending=editTail.then(task);editTail=pending.catch(()=>{});return pending;
 }
 async function releaseEditor(){await editTail;if(editEngine){try{(await editEngine).terminate();}catch{}editEngine=null;}}
 const api={chooseRecorderMime,examineMP4,inspectCodecs,convertToMP4,renderVideo,releaseEditor};
 global.CDEMP4=api;
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
