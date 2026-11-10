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
function switchMode(on){frame.hidden=!on;canvas.hidden=on;imageDownload.hidden=on;imageShare.hidden=on;exportBtn.hidden=!on;hint.textContent=on?"Vídeo com identidade visual CDE Imports. A gravação WebM é experimental; confirme o áudio e o resultado antes de publicar.":"O site insere o logo e domínio no topo e uma marca d’água discreta no rodapé.";sync();}
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
  status(`🎬 ${f.name} · ${prettySize(f.size)} · ${Math.ceil(video.duration||0)}s · ${recovered?"recuperado da campanha":"pronto para criar campanha"}`);
  message("Vídeo carregado. Confira a prévia e agende sua campanha.");
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
function download(blob,filename){const a=document.createElement("a"),uri=URL.createObjectURL(blob);a.href=uri;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(uri),30000);}
async function exportVideo(){
 if(!selected||!loaded)return status("Selecione primeiro um vídeo válido.",true);
 if(exporting)return;
 if(typeof MediaRecorder==="undefined"||!HTMLCanvasElement.prototype.captureStream)return status("Para exportar WebM, abra no Chrome ou Edge atualizado.",true);
 if(!Number.isFinite(video.duration)||video.duration>240||video.duration<=0)return status("Exportação: vídeo de até quatro minutos. O upload e o agendamento permitem vídeos mais longos.",true);
 const mime=["video/webm;codecs=vp8,opus","video/webm;codecs=vp8","video/webm"].find(x=>MediaRecorder.isTypeSupported(x));
 if(!mime)return status("Este navegador não oferece codificação WebM.",true);
 exporting=true;exportBtn.disabled=true;exportBtn.textContent="Gerando vídeo...";
 const fmt=byId("format").value,[w,h]=fmt==="square"?[720,720]:fmt==="pin"?[720,1080]:[720,1280];
 const stage=document.createElement("canvas");stage.width=w;stage.height=h;const ctx=stage.getContext("2d");
 let raf=0,recorder=null;
 const frameDraw=()=>{ctx.fillStyle="#071941";ctx.fillRect(0,0,w,h);const top=Math.round(h*.14),bottom=Math.round(h*.11);drawCover(ctx,0,top,w,h-top-bottom);drawBrand(ctx,w,h);raf=requestAnimationFrame(frameDraw);};
 try{
  video.pause();video.currentTime=0;
  await new Promise(resolve=>{if(video.readyState>=2)resolve();else video.addEventListener("canplay",resolve,{once:true});});
  frameDraw();
  const output=stage.captureStream(24);
  await video.play();
  try{const audioStream=video.captureStream?.();for(const track of audioStream?.getAudioTracks()||[])output.addTrack(track);}catch{}
  const chunks=[];recorder=new MediaRecorder(output,{mimeType:mime,videoBitsPerSecond:3500000});
  const finished=new Promise((ok,fail)=>{recorder.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data);};recorder.onerror=e=>fail(e.error||Error("Falha ao gravar."));recorder.onstop=()=>ok(new Blob(chunks,{type:"video/webm"}));});
  const ended=new Promise((ok,fail)=>{const timeout=setTimeout(()=>fail(Error("A exportação ultrapassou o tempo limite.")),video.duration*1000+18000);video.addEventListener("ended",()=>{clearTimeout(timeout);ok();},{once:true});video.addEventListener("error",()=>{clearTimeout(timeout);fail(Error("Erro na reprodução."));},{once:true});});
  recorder.start(1000);await ended;
  if(recorder.state!=="inactive")recorder.stop();
  const blob=await finished;if(!blob.size)throw Error("O arquivo WebM ficou vazio.");
  download(blob,`CDE-Imports-${fmt}-video.webm`);
  message("Arquivo WebM exportado. Confira imagem e áudio antes de publicar; MP4 exige conversão adicional.");
 }catch(e){message(`Falha ao exportar vídeo: ${e.message}`,true);if(recorder&&recorder.state!=="inactive")recorder.stop();}
 finally{cancelAnimationFrame(raf);video.pause();try{video.currentTime=0;}catch{}exporting=false;exportBtn.disabled=false;exportBtn.textContent="Exportar vídeo com marca (WebM)";}
}
exportBtn.addEventListener("click",exportVideo);
window.CDEVideo={metadata,onCampaignSaved,openSaved};
switchMode(false);
})();
