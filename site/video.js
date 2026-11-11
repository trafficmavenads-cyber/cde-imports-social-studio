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
async function prepareVideo(file,source,format,{mode='edited',start=0,end=source.duration,onProgress=status}={}){
 const portrait=format!=='landscape';
 const fitOriginal=portrait?source.height>=source.width:source.width>source.height;
 const uncut=start===0&&Math.abs(end-source.duration)<.06;
 const check=await window.CDEMP4.examineMP4(file);
 if(mode==='fast'&&uncut&&fitOriginal&&check.valid){
  onProgress('MP4 pronto: preparando envio sem recriar o vídeo…');
  const blob=await window.CDEMP4.convertToMP4(file,{native:true,onProgress});
  return {blob:new Blob([blob],{type:'video/mp4'}),width:source.width,height:source.height,duration:end-start};
 }
 const [width,height]=portrait?[720,1280]:[1280,720];
 let overlay=null;
 if(mode==='edited'){
  if(!logo.complete)await logo.decode();
  const brand=document.createElement('canvas');brand.width=width;brand.height=height;
  drawBrand(brand.getContext('2d'),width,height);
  overlay=await new Promise(resolve=>brand.toBlob(resolve,'image/png'));
 }
 const blob=await window.CDEMP4.renderVideo(file,{width,height,start,end,fit:byId('video-fit')?.value||'contain',overlay,onProgress});
 return {blob,width,height,duration:end-start};
}
async function exportVideo({downloadFile=true,format=null,mode='edited',onProgress=status}={}){
 if(!selected||!loaded)throw Error('Selecione primeiro um vídeo válido.');
 if(exporting)throw Error('Já existe um vídeo em preparação.');
 exporting=true;exportBtn.disabled=true;
 try{
  const result=await prepareVideo(selected,{duration:video.duration,width:video.videoWidth,height:video.videoHeight},format||byId('format').value,
   {mode,start:Number(byId('video-trim-start')?.value||0),end:Number(byId('video-trim-end')?.value||video.duration),onProgress});
  if(downloadFile)download(result.blob,'CDE-Imports-video.mp4');
  message('Vídeo pronto para envio direto.');return result;
 }catch(error){message('Não foi possível preparar o vídeo: '+String(error.message||error),true);throw error;}
 finally{exporting=false;exportBtn.disabled=false;}
}

exportBtn.addEventListener("click",()=>exportVideo());
window.CDEVideo={metadata,onCampaignSaved,openSaved,
 loadVideo,
 prepareFile:prepareVideo,
 renderForPublish:(format,options={})=>exportVideo({downloadFile:false,format,...options}),
 sourceInfo:()=>selected&&loaded?{duration:video.duration,width:video.videoWidth,height:video.videoHeight}:null
};
switchMode(false);
})();
