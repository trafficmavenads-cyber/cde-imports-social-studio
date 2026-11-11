(function cdeVideoModule(){
"use strict";
const byId=id=>document.getElementById(id);
const input=byId("video-file"),video=byId("video-preview"),frame=byId("video-frame"),canvas=byId("art");
const info=byId("media-info"),hint=byId("preview-hint"),exportBtn=byId("export-video");
const imageDownload=byId("download"),imageShare=byId("share"),maxBytes=300*1024*1024;
let selected=null,videoURL=null,loaded=false,exporting=false;
const logo=new Image();logo.src="assets/logo.png";
function status(message,error=false){info.textContent=message;info.style.color=error?"#b92344":"#356595";}
function message(msg,error=false){const m=byId("message");m.textContent=msg;m.style.color=error?"#b92344":"#175b98";}
const prettySize=n=>n<1048576?`${Math.round(n/1024)} KB`:`${(n/1048576).toFixed(1)} MB`;
function sync(){frame.dataset.format=byId("format").value;byId("video-footer").className="video-footer "+byId("watermark").value;}
function switchMode(on){frame.hidden=!on;canvas.hidden=on;imageDownload.hidden=on;imageShare.hidden=on;exportBtn.hidden=!on;hint.textContent=on?"Vídeo com identidade visual CDE Imports. A versão editada é enviada diretamente às redes selecionadas. Confira o áudio e a imagem antes de publicar.":"O site insere o logo e domínio no topo e uma marca d’água discreta no rodapé.";sync();}
function release(){video.pause();video.removeAttribute("src");video.load();if(videoURL)URL.revokeObjectURL(videoURL);videoURL=null;}
async function loadVideo(f,recovered=false){
 if(exporting)return status("Conclua a exportação antes de trocar de vídeo.",true);
 if(!f)return;
 const ext=(f.name.split(".").pop()||"").toLowerCase();
 if(!["mp4","webm","mov"].includes(ext)&&!["video/mp4","video/webm","video/quicktime"].includes(f.type))return status("Selecione um vídeo MP4, WebM ou MOV.",true);
 if(f.size>maxBytes)return status("O arquivo excede 300 MB. Comprima o vídeo e tente novamente.",true);
 if(!f.size)return status("O arquivo selecionado está vazio.",true);
 release();selected=f;loaded=false;videoURL=URL.createObjectURL(f);video.src=videoURL;switchMode(true);
 status(`${f.name} (${prettySize(f.size)}) — carregando prévia...`);
 try{
  await new Promise((ok,fail)=>{
   const timer=setTimeout(()=>{cleanup();fail(Error("Tempo esgotado ao carregar o vídeo."));},15000);
   const success=()=>{cleanup();ok();},error=()=>{cleanup();fail(Error("Vídeo não suportado pelo navegador. Prefira MP4 H.264 com áudio AAC."));};
   function cleanup(){clearTimeout(timer);video.removeEventListener("loadedmetadata",success);video.removeEventListener("error",error);}
   video.addEventListener("loadedmetadata",success,{once:true});video.addEventListener("error",error,{once:true});
   if(video.readyState>=1)success();
  });
  loaded=true;
  if(byId("video-trim-start"))byId("video-trim-start").value=0;
  if(byId("video-trim-end"))byId("video-trim-end").value=Number(video.duration.toFixed(2));
  window.dispatchEvent(new Event("cde:video-loaded"));
  status(`🎬 ${f.name} · ${prettySize(f.size)} · ${Math.ceil(video.duration||0)}s · ${recovered?"recuperado da campanha":"pronto para editar e publicar"}`);
  message("Vídeo carregado. Edite, selecione os destinos e publique diretamente.");
 }catch(e){status(e.message,true);release();selected=null;loaded=false;switchMode(false);}
}
input.addEventListener("change",()=>loadVideo(input.files?.[0]));
function imageMode(){if(exporting)return;if(!selected)return;release();selected=null;loaded=false;switchMode(false);status("Modo imagem ativo. Para mudar, selecione outro vídeo.");}
byId("image-file").addEventListener("change",e=>{if(e.target.files?.length)imageMode();});
byId("image-url").addEventListener("change",()=>{if(byId("image-url").value.trim())imageMode();});
for(const id of ["format","watermark"])byId(id).addEventListener("change",sync);
function openDB(){return new Promise((resolve,reject)=>{
 if(!("indexedDB" in window))return reject(Error("Armazenamento local de vídeos indisponível."));
 const r=indexedDB.open("cdeimports-social-studio-video",1);
 r.onupgradeneeded=()=>r.result.createObjectStore("clips",{keyPath:"campaignId"});
 r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error||Error("Erro ao acessar o armazenamento."));
});}
function metadata(){return selected&&loaded?{mediaType:"video",mediaName:selected.name,mediaSize:selected.size,mediaDuration:Math.round(video.duration||0),mediaMime:selected.type||"video/mp4"}:null;}
async function onCampaignSaved(campaignId){
 if(!selected||!loaded)return;
 const original=selected;
 try{
  const database=await openDB();
  await new Promise((ok,fail)=>{
   const tx=database.transaction("clips","readwrite");tx.objectStore("clips").put({campaignId,file:original,storedAt:Date.now()});
   tx.oncomplete=ok;tx.onerror=()=>fail(tx.error||Error("Sem espaço para salvar o vídeo."));tx.onabort=()=>fail(tx.error||Error("Gravação cancelada."));
  });
  database.close();status(`Vídeo ${original.name} guardado neste navegador para a campanha. Mantenha uma cópia do original.`);
 }catch(e){status(`A campanha foi salva, mas o vídeo não pôde ser guardado. Reenvie quando for publicar. ${e.message}`,true);}
}
async function openSaved(campaignId){
 try{
  const database=await openDB();
  const result=await new Promise((ok,fail)=>{
   const r=database.transaction("clips","readonly").objectStore("clips").get(campaignId);
   r.onsuccess=()=>ok(r.result);r.onerror=()=>fail(r.error);
  });
  database.close();
  if(!result?.file)return message("Vídeo indisponível neste navegador. Reenvie a mídia no dispositivo original.",true);
  await loadVideo(result.file,true);byId("studio").scrollIntoView({behavior:"smooth",block:"start"});
 }catch(e){message(`Falha ao recuperar vídeo: ${e.message}`,true);}
}
function drawCover(ctx,x,y,w,h){
 if(byId("video-fit")?.value==="contain"){const ratio=Math.min(w/video.videoWidth,h/video.videoHeight),dw=video.videoWidth*ratio,dh=video.videoHeight*ratio;ctx.drawImage(video,x+(w-dw)/2,y+(h-dh)/2,dw,dh);return;}
 const mw=video.videoWidth,mh=video.videoHeight;if(!mw||!mh)return;
 const scale=Math.max(w/mw,h/mh),sw=w/scale,sh=h/scale;
 ctx.drawImage(video,(mw-sw)/2,(mh-sh)/2,sw,sh,x,y,w,h);
}
function drawBrand(ctx,w,h){
 const top=Math.round(h*.14),bottom=Math.round(h*.11),stripe=Math.max(5,Math.round(h*.006));
 ctx.fillStyle="#071941";ctx.fillRect(0,0,w,top);ctx.fillRect(0,h-bottom,w,bottom);
 if(logo.complete&&logo.naturalWidth){
  const ww=w*.22,hh=ww*logo.naturalHeight/logo.naturalWidth;
  ctx.drawImage(logo,w*.03,(top-hh)/2,ww,hh);
  if(byId("watermark").value!=="none"){
   const sw=w*.14,sh=sw*logo.naturalHeight/logo.naturalWidth;
   const sx=byId("watermark").value==="left"?w*.045:w-sw-w*.045;
   ctx.globalAlpha=.72;ctx.drawImage(logo,sx,h-bottom+(bottom-stripe-sh)/2,sw,sh);ctx.globalAlpha=1;
  }
 }
 ctx.font=`900 ${Math.round(w*.035)}px Arial`;ctx.textAlign="right";ctx.fillStyle="#ffd347";ctx.fillText("cdeimports.site",w*.96,top*.57);ctx.textAlign="left";
 ["#007fd8","#ed2346","#ffd339"].forEach((color,i)=>{ctx.fillStyle=color;ctx.fillRect(i*w/3,h-stripe,w/3+1,stripe);});
}
function download(blob,filename){const a=document.createElement("a"),uri=URL.createObjectURL(blob);a.href=uri;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(uri),120000);}
let audioCtx=null,audioSource=null,audioTarget=null;
async function soundTrack(){
 const Constructor=window.AudioContext||window.webkitAudioContext;
 if(!Constructor)return null;
 if(!audioCtx){
  audioCtx=new Constructor();
  audioSource=audioCtx.createMediaElementSource(video);
  audioTarget=audioCtx.createMediaStreamDestination();
  audioSource.connect(audioTarget);
  audioSource.connect(audioCtx.destination);
 }
 if(audioCtx.state==='suspended')await audioCtx.resume();
 return audioTarget.stream.getAudioTracks()[0]||null;
}
async function exportVideo({downloadFile=true,format=null}={}){
 if(!selected||!loaded)return status("Selecione primeiro um vídeo válido.",true);
 if(exporting)return;
 if(!window.CDEMP4||typeof MediaRecorder==="undefined"||!HTMLCanvasElement.prototype.captureStream)
  return status("A exportação MP4 exige Chrome ou Edge atualizado e a biblioteca de conversão.",true);
 if(!Number.isFinite(video.duration)||video.duration>240||video.duration<=0)
  return status("Exportação MP4 disponível para vídeos de até 4 minutos. Para vídeos mais longos, carregue diretamente o MP4 original na Central do Instagram.",true);
 let mime=window.CDEMP4.chooseRecorderMime(MediaRecorder);
 if(!mime)return status("O navegador não oferece gravação de vídeo compatível. Atualize o Chrome ou Edge.",true);
 exporting=true;exportBtn.disabled=true;exportBtn.textContent="Preparando MP4...";
 const fmt=format||byId("format").value,[w,h]=fmt==="landscape"?[1280,720]:fmt==="square"?[720,720]:fmt==="pin"?[720,1080]:[720,1280];
 const start=Number(byId("video-trim-start")?.value||0),end=Number(byId("video-trim-end")?.value||video.duration);
 if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end>video.duration+.05){exporting=false;exportBtn.disabled=false;throw Error("Informe um corte válido dentro da duração do vídeo.");}
 const stage=document.createElement("canvas");stage.width=w;stage.height=h;
 const ctx=stage.getContext("2d");
 let raf=0,recorder=null,stream=null,recordError=null,cancelPlayback=()=>{};
 const draw=()=>{
  ctx.fillStyle="#071941";ctx.fillRect(0,0,w,h);
  const top=Math.round(h*.14),bottom=Math.round(h*.11);
  drawCover(ctx,0,top,w,h-top-bottom);drawBrand(ctx,w,h);
  raf=requestAnimationFrame(draw);
 };
 try{
  if(!ctx)throw Error("Não foi possível iniciar o editor MP4.");
  video.pause();video.currentTime=start;
  if(video.seeking)await new Promise(resolve=>video.addEventListener("seeked",resolve,{once:true}));
  await new Promise((resolve,reject)=>{
   if(video.readyState>=2){resolve();return;}
   const timeout=setTimeout(()=>reject(Error("O vídeo demorou para carregar.")),12000);
   video.addEventListener("canplay",()=>{clearTimeout(timeout);resolve();},{once:true});
  });
  const audio=await soundTrack().catch(()=>null);
  stream=stage.captureStream(24);
  if(audio)stream.addTrack(audio);
  // Exact AVC/AAC MediaRecorder when available; WebM is only a conversion intermediary.
  try{recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:3400000,audioBitsPerSecond:128000});}
  catch(err){
   mime=["video/webm;codecs=vp8,opus","video/webm;codecs=vp8","video/webm"].find(m=>MediaRecorder.isTypeSupported(m));
   if(!mime)throw Error("O navegador não conseguiu iniciar a codificação de vídeo.");
   recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:3400000,audioBitsPerSecond:128000});
  }
  const chunks=[];
  const finished=new Promise((resolve,reject)=>{
   recorder.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data);};
   recorder.onerror=e=>{recordError=e.error||Error("Falha na gravação.");reject(recordError);};
   recorder.onstop=()=>{
    if(recordError){reject(recordError);return;}
    resolve(new Blob(chunks,{type:recorder.mimeType||mime}));
   };
  });
  const ended=new Promise((resolve,reject)=>{
   const clean=()=>{clearTimeout(timeout);video.removeEventListener('timeupdate',tick);video.removeEventListener('ended',done);video.removeEventListener('error',fail);};
   cancelPlayback=clean;
   const done=()=>{clean();video.pause();resolve();};
   const fail=()=>{clean();reject(Error('Falha ao reproduzir o vídeo original.'));};
   const tick=()=>{if(video.currentTime>=end)done();};
   const timeout=setTimeout(()=>{clean();reject(Error('Tempo esgotado durante a gravação.'));},(end-start)*1000+30000);
   video.addEventListener('timeupdate',tick);video.addEventListener('ended',done);video.addEventListener('error',fail);
  });
  ended.catch(()=>{});finished.catch(()=>{});
  draw();
  exportBtn.textContent="Gravando quadros...";
  recorder.start(1000);
  await video.play();
  await ended;
  if(recorder.state!=="inactive")recorder.stop();
  const recorded=await finished;
  if(!recorded.size)throw Error("A gravação ficou vazia.");
  const native=String(recorder.mimeType||mime).toLowerCase().startsWith("video/mp4");
  const mp4=await window.CDEMP4.convertToMP4(recorded,{
   native,onProgress:progress=>{exportBtn.textContent="Convertendo MP4...";status(progress);}
  });
  if(!mp4.size)throw Error("O arquivo MP4 final ficou vazio.");
  const verified=await window.CDEMP4.examineMP4(mp4);
  if(!verified.valid||!verified.fastStart)throw Error("O MP4 não passou na verificação para publicação.");
  if(!downloadFile){
   message('Versão editada pronta para envio direto.');
   return {blob:new Blob([mp4],{type:"video/mp4"}),width:w,height:h,duration:end-start};
  }
  download(mp4,"CDE-Imports-"+fmt+"-instagram.mp4");
  status("Vídeo exportado: MP4 · "+prettySize(mp4.size)+" · pronto para importar em Reels.");
  message("MP4 com marca CDE Imports exportado! Revise o áudio e envie o arquivo na Central do Instagram → Reels.");
 }catch(err){
  message("Falha ao exportar MP4: "+err.message+". Tente um vídeo curto ou use o MP4 original na Central do Instagram.",true);
  status("Não foi gerado WebM: o editor exporta somente MP4 válido para o Instagram.",true);
  if(recorder&&recorder.state!=="inactive")try{recorder.stop();}catch{}
  if(!downloadFile)throw err;
 }finally{
  cancelPlayback();cancelAnimationFrame(raf);video.pause();
  try{video.currentTime=0;}catch{}
  for(const t of stream?.getVideoTracks()||[])t.stop();
  exporting=false;exportBtn.disabled=false;exportBtn.textContent="Exportar vídeo com marca (MP4)";
 }
}

exportBtn.addEventListener("click",()=>exportVideo());
window.CDEVideo={metadata,onCampaignSaved,openSaved,
 loadVideo,
 renderForPublish:async format=>{
  const result=await exportVideo({downloadFile:false,format});
  if(!result?.blob)throw Error('Não foi possível preparar o vídeo editado. Use vídeo de até 4 minutos no Chrome ou Edge.');
  return result;
 },
 sourceInfo:()=>selected&&loaded?{duration:video.duration,width:video.videoWidth,height:video.videoHeight}:null
};
switchMode(false);
})();
