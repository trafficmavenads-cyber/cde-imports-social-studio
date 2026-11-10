(() => {
'use strict';
const $=id=>document.getElementById(id);
const KEY='cde-instagram-bulk-v1',DB='cde-instagram-media-v1';
const MAX_ITEMS=60,MAX_FILE_SIZE=24*1024*1024;
const states={draft:'Rascunho',scheduled:'Agendado no navegador',running:'Enviando para Meta',
 published:'Publicado (confirmado pela Meta)',attention:'Verificar — não confirmado'};
let queue=[],selected=[],previews=[],busy=new Set(),dbPromise=null;
try{const saved=JSON.parse(localStorage.getItem(KEY)||'[]');if(Array.isArray(saved))queue=saved.filter(x=>x&&typeof x.id==='string'&&Array.isArray(x.items)&&x.items.length).slice(-MAX_ITEMS);}catch{}
function db(){
 if(dbPromise)return dbPromise;
 dbPromise=new Promise((resolve,reject)=>{
  if(!window.indexedDB){reject(Error('Este navegador não permite armazenamento local de arquivos.'));return;}
  const req=indexedDB.open(DB,1);
  req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('media'))req.result.createObjectStore('media');};
  req.onerror=()=>reject(req.error||Error('Erro ao abrir armazenamento local.'));
  req.onsuccess=()=>resolve(req.result);
 });
 return dbPromise;
}
async function putFile(key,file){
 const conn=await db();
 return new Promise((resolve,reject)=>{
  const transaction=conn.transaction('media','readwrite');
  transaction.objectStore('media').put(file,key);
  transaction.oncomplete=resolve;transaction.onerror=()=>reject(transaction.error);
 });
}
async function getFile(key){
 const conn=await db();
 return new Promise((resolve,reject)=>{
  const tx=conn.transaction('media','readonly'),req=tx.objectStore('media').get(key);
  req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error);
 });
}
async function delFile(key){
 const conn=await db();return new Promise((resolve,reject)=>{
  const tx=conn.transaction('media','readwrite');
  tx.objectStore('media').delete(key);
  tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
 });
}
function save(){
 try{localStorage.setItem(KEY,JSON.stringify(queue));return true;}
 catch{notice('O navegador não conseguiu guardar a fila. Exporte ou libere espaço.',true);return false;}
}
const clean=s=>String(s||'').replace(/[\u0000-\u001f<>]/g,'').slice(0,300);
const esc=s=>String(s||'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const id=()=>typeof crypto.randomUUID==='function'?crypto.randomUUID():String(Date.now())+Math.random().toString(36).slice(2);
function notice(text,error=false){const box=$('ig-bulk-message');if(box){box.textContent=text;box.classList.toggle('error',error);}}
function timeValue(t){if(!t)return 'Sem horário';const date=new Date(t);return Number.isNaN(date.getTime())?'Horário inválido':date.toLocaleString('pt-BR');}
function kindFrom(format,file){
 if(format==='AUTO')return file.type==='video/mp4'?'REELS':'IMAGE';
 if(format==='STORIES')return file.type==='video/mp4'?'STORY_VIDEO':'STORY_IMAGE';
 return format;
}
function possible(format,files){
 if(!files.length)return 'Selecione pelo menos uma imagem ou vídeo.';
 if(files.some(x=>!['image/jpeg','image/png','image/webp','video/mp4'].includes(x.type)))
  return 'Formato não aceito. Use JPEG, PNG, WEBP ou MP4.';
 if(files.some(x=>x.size>MAX_FILE_SIZE))return 'O Render Free aceita no máximo 24 MB por vídeo; use uma URL pública para arquivos maiores.';
 if(format==='CAROUSEL'){
  if(files.length<2||files.length>10)return 'O carrossel precisa de 2 a 10 fotos/vídeos.';
 }else if(format==='REELS'&&files.some(x=>x.type!=='video/mp4'))return 'Reels exige vídeos MP4.';
 else if(format==='IMAGE'&&files.some(x=>!x.type.startsWith('image/')))return 'Feed exige imagens.';
 return null;
}
function preview(){
 const parent=$('ig-bulk-selected');parent.replaceChildren();
 for(const url of previews)URL.revokeObjectURL(url);
 previews=[];
 if(!selected.length){parent.textContent='Nenhum arquivo selecionado.';return;}
 selected.forEach((file,i)=>{
  const item=document.createElement('div');item.className='ig-file-card';
  if(file.type.startsWith('image/')){
   const url=URL.createObjectURL(file);previews.push(url);
   const img=document.createElement('img');img.src=url;img.alt='Foto selecionada '+(i+1);item.append(img);
  }else{
   const icon=document.createElement('span');icon.className='ig-file-video';icon.textContent='▶ MP4';item.append(icon);
  }
  const label=document.createElement('small');label.textContent=file.name+' · '+(file.size/1024/1024).toFixed(1)+' MB';item.append(label);parent.append(item);
 });
}
function refresh(){
 const root=$('ig-bulk-queue');root.replaceChildren();
 const line=$('ig-bulk-count');line.textContent=queue.length+' publicações na fila';
 if(!queue.length){root.textContent='A fila está vazia. Selecione fotos ou vídeos para começar.';return;}
 queue.slice().sort((a,b)=>(a.when||'9999').localeCompare(b.when||'9999')).forEach(item=>{
  const card=document.createElement('article');card.className='ig-job';card.dataset.id=item.id;
  const h=document.createElement('div');h.className='ig-job-header';
  const title=document.createElement('strong');title.textContent=item.title;
  const pill=document.createElement('span');pill.className='pill '+(item.status==='published'?'connected':item.status==='attention'?'amber':'');
  pill.textContent=states[item.status]||item.status;h.append(title,pill);card.append(h);
  const summary=document.createElement('p');summary.className='ig-job-desc';
  summary.textContent=item.kind==='CAROUSEL'?'Carrossel · '+item.items.length+' arquivos':
   item.kind.startsWith('STORY_')?'Story · '+(item.kind==='STORY_VIDEO'?'vídeo':'imagem'):
   item.kind==='REELS'?'Reels · MP4':'Feed · imagem';
  summary.textContent+=' · '+timeValue(item.when);
  if(item.auto&&item.status==='scheduled')summary.textContent+=' · Envio autorizado com aba aberta';
  card.append(summary);
  if(item.status==='attention'&&item.error){const error=document.createElement('p');error.className='ig-job-error';error.textContent=item.error;card.append(error);}
  if(item.mediaId){const ref=document.createElement('small');ref.textContent='ID confirmado pela Meta: '+item.mediaId;card.append(ref);}
  if(item.kind.startsWith('STORY_')){
   const info=document.createElement('small');info.className='ig-job-hint';
   info.textContent='Stickers de link e músicas do Instagram não são enviados pela API; adicione-os pelo app móvel.';card.append(info);
  }
  const actions=document.createElement('div');actions.className='ig-job-actions';
  function act(label,action,disabled){
   const b=document.createElement('button');b.type='button';b.textContent=label;b.dataset.action=action;b.disabled=Boolean(disabled);b.className=action==='publish'?'primary':'secondary';
   actions.append(b);
  }
  act('Publicar agora','publish',item.status==='published'||item.status==='running'||busy.has(item.id));
  act('Editar legenda','edit',item.status==='published'||item.status==='running');
  if(item.kind.startsWith('STORY_')&&item.storyLink)act('Copiar link para sticker manual','copylink',false);
  act('Excluir','delete',item.status==='running'||busy.has(item.id));
  card.append(actions);root.append(card);
 });
}
function imageToJpeg(file,kind,text,cta){
 return new Promise((resolve,reject)=>{
  const reader=new FileReader();
  reader.onerror=()=>reject(Error('Falha na leitura da imagem.'));
  reader.onload=()=>{
   const image=new Image();
   image.onload=()=>{
    const isStory=kind==='STORY_IMAGE';
    const targetW=1080,targetH=isStory?1920:kind==='CAROUSEL'?1350:1080;
    const canvas=document.createElement('canvas');canvas.width=targetW;canvas.height=targetH;
    const ctx=canvas.getContext('2d');
    if(!ctx){reject(Error('Não foi possível abrir o editor de imagem.'));return;}
    ctx.fillStyle='#101c3c';ctx.fillRect(0,0,targetW,targetH);
    const factor=Math.max(targetW/image.width,targetH/image.height);
    const dw=image.width*factor,dh=image.height*factor;
    ctx.drawImage(image,(targetW-dw)/2,(targetH-dh)/2,dw,dh);
    if(isStory&&(text||cta)){
     const grad=ctx.createLinearGradient(0,targetH*.55,0,targetH);
     grad.addColorStop(0,'rgba(0,0,0,0)');grad.addColorStop(1,'rgba(0,0,0,.88)');
     ctx.fillStyle=grad;ctx.fillRect(0,targetH*.52,targetW,targetH*.48);
     ctx.textAlign='center';ctx.fillStyle='white';ctx.font='bold 64px Arial, sans-serif';
     const splitLine=(value,y,color)=>{
      if(!value)return y;
      ctx.fillStyle=color;const words=value.replace(/\s+/g,' ').trim().split(' ');let line='',lines=[];
      for(const word of words){
       const test=line?line+' '+word:word;
       if(ctx.measureText(test).width>900&&line){lines.push(line);line=word;}else line=test;
      }
      if(line)lines.push(line);
      lines.slice(0,4).forEach(t=>{ctx.fillText(t,540,y);y+=82;});
      return y;
     };
     let y=targetH-420;
     y=splitLine(text.slice(0,130),y,'white')+28;
     ctx.font='bold 44px Arial, sans-serif';
     splitLine(cta.slice(0,85),y,'#ffdf72');
    }
    canvas.toBlob(blob=>blob?resolve(blob):reject(Error('Falha ao converter JPEG.')),'image/jpeg',0.87);
   };
   image.onerror=()=>reject(Error('Formato de imagem incompatível.'));
   image.src=reader.result;
  };
  reader.readAsDataURL(file);
 });
}
function buildItems(files,kind,caption,when,auto,text,cta,link){
 const made=[],schedule=when?new Date(when).toISOString():null;
 if(kind==='CAROUSEL'){
  made.push({id:id(),title:'Carrossel · '+files.length+' mídias',kind,caption,when:schedule,auto,
   status:schedule?'scheduled':'draft',items:files.map(f=>({key:f.key,name:f.file.name,mediaType:f.file.type})),
   created:new Date().toISOString()});
 }else for(const value of files){
  const targetKind=kindFrom(kind,value.file);
  made.push({id:id(),title:clean(value.file.name),kind:targetKind,caption,when:schedule,auto,
   storyText:text,storyCta:cta,storyLink:link,
   status:schedule?'scheduled':'draft',items:[{key:value.key,name:value.file.name,mediaType:value.file.type}],
   created:new Date().toISOString()});
 }
 return made;
}
async function addToQueue(){
 const format=$('ig-bulk-format').value,when=$('ig-bulk-time').value,auto=$('ig-bulk-auto').checked;
 const fail=possible(format,selected);if(fail)return notice(fail,true);
 if(queue.length+selected.length>MAX_ITEMS)return notice('Limite de 60 itens locais atingido. Remova publicações anteriores.',true);
 if(auto&&!when)return notice('Escolha data e hora antes de autorizar a publicação automática.',true);
 if(auto&&new Date(when).getTime()<=Date.now())return notice('O horário automático deve estar no futuro.',true);
 if(when&&Number.isNaN(new Date(when).getTime()))return notice('Informe uma data válida.',true);
 if(auto&&!window.confirm('Você autoriza o envio automático destes posts para o Instagram quando chegar o horário, SOMENTE com esta página aberta e sua sessão ativa?'))return;
 const caption=$('ig-bulk-caption').value.trim().slice(0,2200),text=$('ig-story-text').value.trim().slice(0,130);
 const cta=$('ig-story-cta').value.trim().slice(0,85),link=$('ig-story-link').value.trim().slice(0,1800);
 if(format!=='STORIES'&&!caption)return notice('Informe uma legenda. Para Stories, o texto pode ser incorporado na imagem.',true);
 if(format==='STORIES'&&selected.length&&selected.some(x=>x.type==='video/mp4')&&(text||cta))
  notice('A sobreposição de texto se aplica somente às imagens; vídeo precisa ser editado antes do upload.');
 const button=$('ig-bulk-add');button.disabled=true;
 try{
  const refs=[];
  for(const file of selected){
   const key=id();await putFile(key,file);refs.push({file,key});
  }
  const entries=buildItems(refs,format,caption,when,auto,text,cta,link);
  queue.push(...entries);save();selected=[];$('ig-bulk-files').value='';preview();refresh();
  notice(entries.length+' publicação(ões) adicionada(s). Arquivos guardados somente neste navegador.');
 }catch(e){notice('Falha ao armazenar os arquivos: '+String(e.message||e),true);}
 finally{button.disabled=false;}
}
function delay(ms){return new Promise(r=>setTimeout(r,ms));}
async function publish(item,{automatic=false}={}){
 if(busy.has(item.id)||item.status==='published')return;
 const ig=window.CDEInstagramPublisher;
 if(!ig?.status?.().ready){
  item.status='attention';item.error='Conecte e autorize o Instagram na seção Conexões. Nenhum post enviado.';save();refresh();return;
 }
 busy.add(item.id);item.status='running';item.error='';save();refresh();
 try{
  if(!item.jobId){
    let prepared=[];
    for(const meta of item.items){
     const file=await getFile(meta.key);
     if(!file)throw Error('Arquivo local não encontrado. Reimporte a mídia neste navegador.');
     const isImage=file.type.startsWith('image/');
     const blob=isImage?await imageToJpeg(file,item.kind,
       item.kind==='STORY_IMAGE'?item.storyText||'':'',item.kind==='STORY_IMAGE'?item.storyCta||'':''):file;
     const response=await ig.uploadMedia(blob);
     if(!response.mediaUrl)throw Error('O Render não retornou a URL pública.');
     prepared.push({kind:isImage?'IMAGE':'VIDEO',mediaUrl:response.mediaUrl});
    }
    const result=await ig.prepare({
     kind:item.kind,caption:item.kind.startsWith('STORY_')?'':item.caption,
     mediaUrl:prepared.length===1?prepared[0].mediaUrl:undefined,
     items:item.kind==='CAROUSEL'?prepared:undefined
    });
    if(!result.jobId)throw Error('A Meta não confirmou a criação do post.');
    item.jobId=result.jobId;save();
    }
  let ready=false;
  for(let round=0;round<24;round++){
   await delay(round<3?1300:3000);
   const checked=await ig.checkStatus(item.jobId);
   if(checked.ready){ready=true;break;}
   if(['ERROR','EXPIRED'].includes(checked.state))throw Error('A Meta rejeitou a mídia. Verifique formatos e dimensões.');
  }
  if(!ready)throw Error('A mídia ainda está em processamento. Verifique antes de tentar outro envio.');
  const resultPublished=await ig.confirm(item.jobId);
  if(resultPublished.state!=='published'||!resultPublished.mediaId)throw Error('A Meta não confirmou a publicação.');
  item.mediaId=resultPublished.mediaId;item.status='published';item.publishedAt=new Date().toISOString();item.error='';
  if(!item.kind.startsWith('STORY_')){
   window.CDESocialData?.markInstagramPublished?.({
    title:item.title,caption:item.caption,channel:item.kind==='REELS'?'instagram-reels':'instagram-feed',
    mediaId:item.mediaId
   });
  }
  notice('Publicação confirmada pela Meta: '+item.title);
 }catch(err){
  item.status='attention';item.auto=false;item.error=String(err?.message||'Falha no envio.').slice(0,240);
  notice(item.title+': '+item.error,true);
 }finally{busy.delete(item.id);save();refresh();}
}
let schedulerBusy=false;
async function scan(){
 if(schedulerBusy)return;schedulerBusy=true;
 try{
  for(const item of queue){
   if(item.status==='scheduled'&&item.auto&&item.when&&new Date(item.when).getTime()<=Date.now()){
    // Never reattempt automatically after errors; exact-once publish needs a durable server.
    await publish(item,{automatic:true});
   }
  }
 }finally{schedulerBusy=false;}
}
$('ig-bulk-files').addEventListener('change',event=>{selected=[...event.target.files].slice(0,20);preview();});
$('ig-bulk-format').addEventListener('change',()=>{
 const on=$('ig-bulk-format').value==='STORIES';
 $('ig-story-options').hidden=!on;
});
$('ig-bulk-add').addEventListener('click',addToQueue);
$('ig-bulk-import-caption').addEventListener('click',()=>{
 const channel=$('ig-bulk-format').value==='REELS'?'instagram-reels':
  $('ig-bulk-format').value==='STORIES'?'instagram-stories':'instagram-feed';
 const caption=window.CDESocialAI?.captionForChannel?.(channel);
 if(!caption)return notice('Gere primeiro uma legenda na área Inteligência Artificial para esta rede.',true);
 $('ig-bulk-caption').value=caption;notice('Legenda importada do Gemini para '+channel+'.');
});
$('ig-bulk-queue').addEventListener('click',async event=>{
 const button=event.target.closest('button[data-action]');if(!button)return;
 const parent=button.closest('[data-id]'),item=queue.find(x=>x.id===parent?.dataset.id);if(!item)return;
 if(button.dataset.action==='delete'){
  if(item.status==='published'&&!window.confirm('O post já foi publicado no Instagram. Isto remove apenas o registro local. Continuar?'))return;
  queue=queue.filter(x=>x.id!==item.id);save();refresh();
  for(const meta of item.items)if(!queue.some(x=>x.items.some(y=>y.key===meta.key)))try{await delFile(meta.key);}catch{}
  return;
 }
 if(button.dataset.action==='copylink'){
  const link=item.storyLink;
  try{await navigator.clipboard.writeText(link);notice('Link copiado. Abra o Instagram pelo celular para adicionar o sticker clicável.');}
  catch{notice('Não foi possível copiar automaticamente; copie o link do rascunho.',true);}
  return;
 }
 if(button.dataset.action==='edit'){
  const next=window.prompt('Edite a legenda local deste post (não altera post já publicado):',item.caption);
  if(next===null)return;item.caption=next.trim().slice(0,2200);save();refresh();return;
 }
 if(button.dataset.action==='publish'){
  if(!window.confirm('Publicar AGORA '+item.title+' no Instagram conectado? Isso publica a mídia, sem stickers de música ou link.'))return;
  await publish(item);return;
 }
});
window.addEventListener('focus',scan);
setInterval(scan,30000);
refresh();
})();
