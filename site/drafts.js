(() => {
'use strict';
const STORAGE='cde-imports-network-drafts-v1';
const CHANNELS={
 'instagram-feed':'Instagram Feed',
 'instagram-stories':'Instagram Stories',
 'instagram-reels':'Instagram Reels',
 'tiktok':'TikTok',
 'pinterest':'Pinterest',
 'youtube-shorts':'YouTube Shorts',
 'whatsapp-group':'WhatsApp Grupo',
 'whatsapp-status':'WhatsApp Status'
};
const $=id=>document.getElementById(id);
const esc=s=>String(s||'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const newId=()=>typeof crypto.randomUUID==='function'?crypto.randomUUID():Date.now()+'-'+Math.random().toString(36).slice(2);
let records=[];
let activeGroup=null;
const instagramPending=new Set();
try{
 const value=JSON.parse(localStorage.getItem(STORAGE)||'[]');
 if(Array.isArray(value))records=value.filter(x=>x&&x.id&&x.groupId&&CHANNELS[x.channel]&&
  typeof x.caption==='string'&&typeof x.title==='string').slice(-100)
  .map(x=>({...x,caption:x.caption.slice(0,4000),title:x.title.slice(0,110)}));
}catch{}
function persist(){
 try{localStorage.setItem(STORAGE,JSON.stringify(records));return true;}
 catch{return false;}
}
function instagramEditor(x){
 if(!['instagram-feed','instagram-reels'].includes(x.channel))return '';
 const posted=x.igStatus==='published';
 const label=x.channel==='instagram-feed'?'Imagem JPEG pública (.jpg / .jpeg)':'Vídeo MP4 público para Reels';
 const igStatus=x.igStatus==='published'?'Publicado e confirmado pela Meta':
  x.igStatus==='ready'?'Mídia pronta para publicar':
  x.igStatus==='processing'?'Mídia em processamento na Meta':
  x.igJobId?'Mídia preparada, aguardando verificação':'Aguardando mídia e conexão oficial';
 return '<div class="ig-publish-box">'+
  '<strong>Publicar no Instagram · '+(x.channel==='instagram-feed'?'Foto':'Reels')+'</strong>'+
  '<label>'+esc(label)+'<input type="url" data-ig-media-url placeholder="https://cdn.exemplo.com/arquivo.'+(x.channel==='instagram-feed'?'jpg':'mp4')+
  '" maxlength="1800" value="'+esc(x.igMediaUrl||'')+'" '+(posted?'disabled':'')+'></label>'+
  (x.channel==='instagram-feed'&&!posted?'<button type="button" class="secondary" data-draft-action="ig-upload-art">Usar arte do editor (grátis)</button>':'')+
  '<small class="ig-publish-state" aria-live="polite">'+esc(igStatus)+(posted&&x.igMediaId?' · ID: '+esc(x.igMediaId):'')+'</small>'+
  '<div class="network-draft-buttons">'+
  '<button type="button" class="secondary" data-draft-action="ig-prepare" '+(posted?'disabled':'')+'>Preparar na Meta</button>'+
  '<button type="button" class="secondary" data-draft-action="ig-status" '+(!x.igJobId||posted?'disabled':'')+'>Verificar mídia</button>'+
  '<button type="button" class="primary" data-draft-action="ig-publish" '+(x.igStatus!=='ready'?'disabled':'')+'>Publicar agora</button>'+
  '</div><small class="ai-tip">Você pode usar a arte pronta do editor sem serviço extra de imagens. O arquivo fica temporariamente no Render Free e pode desaparecer em reinicializações. Somente “Publicar agora” publica no Instagram.</small></div>';
}
function render(){
 const area=$('network-drafts');if(!area)return;
 if(!records.length){
  area.innerHTML='<p class="empty">Gere suas legendas com Gemini para criar automaticamente um rascunho em cada rede selecionada.</p>';return;
 }
 const order=Object.keys(CHANNELS).filter(channel=>records.some(x=>x.channel===channel));
 area.innerHTML=order.map(channel=>{
  const matches=records.filter(x=>x.channel===channel).reverse().slice(0,12);
  return '<section class="network-draft-folder" data-channel="'+esc(channel)+'">'+
   '<div class="network-draft-title"><h3>'+esc(CHANNELS[channel])+'</h3><span>'+matches.length+' post(s)</span></div>'+
   matches.map(x=>'<article class="network-draft-post" data-draft-id="'+esc(x.id)+'">'+
    '<div class="network-draft-post-head"><strong>'+esc(x.title)+'</strong>'+
    '<small class="'+(x.scheduled?'draft-is-scheduled':'draft-is-local')+'">'+
    (x.scheduled?'No calendário interno':'Rascunho criado pela IA')+'</small></div>'+
    '<label>Legenda deste post<textarea rows="5" maxlength="4000" data-draft-text>'+
    esc(x.caption)+'</textarea></label>'+instagramEditor(x)+
    '<div class="network-draft-buttons">'+
    '<button type="button" class="secondary" data-draft-action="save">Salvar texto</button>'+
    '<button type="button" class="secondary" data-draft-action="copy">Copiar</button>'+
    '<button type="button" class="primary" data-draft-action="calendar"'+(x.scheduled?' disabled':'')+'>'+
    (x.scheduled?'Já agendado':'Agendar este post')+'</button>'+
    '<button type="button" class="secondary" data-draft-action="remove">Excluir</button>'+
    '</div><p class="ai-tip">Conteúdo local, não enviado para '+esc(CHANNELS[channel])+
    '. Publicação automática externa depende da API e das permissões da plataforma.</p>'+
    '</article>').join('')+'</section>';
 }).join('');
}
function sync({groupId,title,captions,checkout,mediaUrl}){
 if(typeof title!=='string'||!title.trim()||!captions||typeof captions!=='object')return null;
 const input=Object.entries(captions)
  .filter(([network,text])=>CHANNELS[network]&&typeof text==='string'&&text.trim())
  .map(([channel,caption])=>({channel,caption:caption.trim().slice(0,4000)}));
 if(!input.length)return null;
 const existing=records.filter(x=>x.groupId===groupId);
 const reusable=groupId&&existing.length&&!existing.some(x=>x.scheduled||x.igStatus==='published');
 const id=reusable?groupId:newId();
 const allowed=new Set(input.map(x=>x.channel));
 records=records.filter(x=>!(x.groupId===id&&!allowed.has(x.channel)));
 const currentDate=new Date().toISOString();
 for(const row of input){
  const record=records.find(x=>x.groupId===id&&x.channel===row.channel);
  const defaultImageUrl=row.channel==='instagram-feed'&&typeof mediaUrl==='string'&&/^https:\/\//i.test(mediaUrl)?mediaUrl.slice(0,1800):'';
  if(record&&!record.scheduled){record.caption=row.caption;record.title=title.trim();record.checkout=checkout||'';if(!record.igMediaUrl&&defaultImageUrl)record.igMediaUrl=defaultImageUrl;record.updated=currentDate;}
  else records.push({id:newId(),groupId:id,title:title.trim().slice(0,110),channel:row.channel,
   caption:row.caption,checkout:checkout||'',igMediaUrl:defaultImageUrl,scheduled:false,created:currentDate,updated:currentDate});
 }
 records=records.slice(-100);activeGroup=id;persist();render();return id;
}
function patch(groupId,channel,caption){
 const item=records.find(x=>x.groupId===groupId&&x.channel===channel&&!x.scheduled);
 if(!item||typeof caption!=='string'||!caption.trim())return false;
 item.caption=caption.trim().slice(0,4000);item.updated=new Date().toISOString();
 persist();render();return true;
}
function captionForChannel(channel){
 const item=records.find(x=>x.groupId===activeGroup&&x.channel===channel&&!x.scheduled);
 if(!item||item.title!==($('title')?.value||'').trim())return null;
 return item.caption;
}
function show(message,error=false){
 const el=$('message');
 if(el){el.textContent=message;el.style.color=error?'#bd1e42':'#175b98';}
}
function markScheduled(detail){
 if(!detail||!Array.isArray(detail.channels))return;
 for(const item of records){
  if(item.groupId===activeGroup&&item.title===detail.title&&detail.channels.includes(item.channel)){
   item.scheduled=true;item.scheduledAt=new Date().toISOString();
  }
 }
 persist();render();
}
$('network-drafts')?.addEventListener('click',async event=>{
 const button=event.target.closest('button[data-draft-action]');
 if(!button)return;
 const card=button.closest('[data-draft-id]');
 const row=records.find(x=>x.id===card?.dataset.draftId);
 if(!row)return;
 const value=card.querySelector('[data-draft-text]')?.value?.trim()||'';
 const action=button.dataset.draftAction;
 if(action==='remove'){
  records=records.filter(x=>x.id!==row.id);persist();render();show('Post removido dos rascunhos locais.');return;
 }
 if(!value){show('Escreva uma legenda antes de salvar este post.',true);return;}
 if(action.startsWith('ig-')){
  if(!['instagram-feed','instagram-reels'].includes(row.channel))return;
  if(instagramPending.has(row.id)){show('Esta publicação já está sendo processada.',true);return;}
  const publisher=window.CDEInstagramPublisher;
  const readiness=publisher?.status?.();
  if(!readiness?.ready){
   show('O Instagram ainda não está conectado com a permissão de publicação. Vá a Conexões, configure o app Meta e reconecte o perfil.',true);
   return;
  }
  if(action==='ig-upload-art'){
   if(row.channel!=='instagram-feed')return;
   const canvas=$('art');
   if(!window.CDESocialData?.hasImage?.()){show('Adicione primeiro a imagem do produto no editor da campanha.',true);return;}
   if(!canvas||canvas.width!==canvas.height){show('Escolha formato quadrado 1080 × 1080 no editor antes de preparar a foto para Instagram.',true);return;}
   instagramPending.add(row.id);
   for(const control of card.querySelectorAll('button'))control.disabled=true;
   show('Convertendo a arte para JPEG e preparando URL temporária para a Meta...');
   try{
    const blob=await new Promise((resolve,reject)=>{
     try{canvas.toBlob(value=>value?resolve(value):reject(Error('Não foi possível exportar a arte JPEG.')),'image/jpeg',0.9);}
     catch(err){reject(err);}
    });
    const result=await publisher.uploadImage(blob);
    if(!result.mediaUrl)throw Error('O servidor não retornou URL da imagem.');
    row.igMediaUrl=result.mediaUrl;
    row.igMediaExpires=result.expiresAt;
    row.igJobId=null;row.igStatus='draft';
    row.igPreparedUrl=null;row.igPreparedCaption=null;
    row.updated=new Date().toISOString();persist();render();
    show('A arte está pronta no Render gratuito. Agora clique em “Preparar na Meta” e publique antes que a imagem expire.');
   }catch(err){
    show('Falha no preparo da arte: '+String(err.message||err).slice(0,160),true);render();
   }finally{instagramPending.delete(row.id);}
   return;
  }
  const mediaUrl=card.querySelector('[data-ig-media-url]')?.value?.trim()||'';
  if(!mediaUrl){show('Informe uma URL HTTPS pública da foto/vídeo ou use o botão “Usar arte do editor”.',true);return;}
  if(action==='ig-prepare'&&row.igMediaExpires&&mediaUrl===row.igMediaUrl&&new Date(row.igMediaExpires).getTime()<=Date.now()){
   show('A imagem temporária expirou. Clique novamente em “Usar arte do editor”.',true);return;
  }
  if(row.igStatus==='published'){show('Este post já foi publicado. Gere outro rascunho para uma nova publicação.',true);return;}
  if(action!=='ig-prepare'&&(!row.igJobId||row.igPreparedCaption!==value||row.igPreparedUrl!==mediaUrl)){
   show('O texto ou link da mídia mudou. Clique em “Preparar na Meta” novamente antes de publicar.',true);return;
  }
  if(action==='ig-publish'&&row.igStatus!=='ready'){show('Verifique a mídia e confirme que está pronta para publicar.',true);return;}
  if(action==='ig-publish'&&!window.confirm('Publicar este '+(row.channel==='instagram-reels'?'Reels':'post com foto')+' no Instagram conectado AGORA? A publicação ficará visível no perfil.'))return;
  instagramPending.add(row.id);
  for(const control of card.querySelectorAll('button'))control.disabled=true;
  show(action==='ig-prepare'?'Enviando a mídia para preparação na Meta...':
    action==='ig-status'?'Consultando processamento no Instagram...':'Publicando no Instagram...');
  try{
   let result;
   if(action==='ig-prepare'){
    result=await publisher.prepare({kind:row.channel==='instagram-reels'?'REELS':'IMAGE',mediaUrl,caption:value});
    row.caption=value;row.igMediaUrl=mediaUrl;row.igPreparedCaption=value;row.igPreparedUrl=mediaUrl;
    row.igJobId=result.jobId;row.igStatus='prepared';row.igMediaId=null;
    show('A Meta recebeu a preparação. Clique em “Verificar mídia” até ficar pronta.');
   }else if(action==='ig-status'){
    result=await publisher.checkStatus(row.igJobId);
    row.igStatus=result.ready?'ready':'processing';
    show(result.ready?'A mídia está pronta. Revise e clique em “Publicar agora”.':'Instagram ainda está processando. Verifique novamente em alguns instantes.');
   }else{
    result=await publisher.confirm(row.igJobId);
    if(result.state!=='published'||!result.mediaId)throw Error('O Instagram não confirmou a publicação.');
    row.igStatus='published';row.igMediaId=result.mediaId;row.publishedAt=new Date().toISOString();
    window.CDESocialData?.markInstagramPublished?.({title:row.title,channel:row.channel,caption:value,mediaId:result.mediaId});
    show('Instagram confirmou a publicação! ID: '+result.mediaId);
   }
   row.updated=new Date().toISOString();persist();render();
  }catch(err){
   if(action==='ig-publish')row.igStatus='unknown';
   persist();render();
   show(String(err?.message||'Falha ao contatar o Instagram').slice(0,220),true);
  }finally{instagramPending.delete(row.id);}
  return;
 }
 if(action==='copy'){
  try{await navigator.clipboard.writeText(value);show('Legenda de '+CHANNELS[row.channel]+' copiada.');}
  catch{show('Não foi possível copiar automaticamente.',true);}return;
 }
 row.caption=value.slice(0,4000);row.updated=new Date().toISOString();persist();
 if(action==='save'){
  if(row.igJobId&&row.igStatus!=='published'&&row.igPreparedCaption!==value){
   row.igJobId=null;row.igStatus='draft';
  }
  persist();render();show('Legenda de '+CHANNELS[row.channel]+' salva neste navegador.');return;
 }
 if(action==='calendar'){
  if(row.scheduled){show('Este post já foi agendado.',true);return;}
  const rights=$('rights');
  if(!rights?.checked){show('Antes de agendar, marque “Tenho autorização para uso comercial da mídia” no editor da campanha.',true);return;}
  const checks=[...document.querySelectorAll('#channels input[type="checkbox"]')];
  const oldChecks=checks.map(c=>c.checked);
  const oldTitle=$('title').value,oldCheckout=$('checkout').value;
  const oldGroup=activeGroup;
  try{
   activeGroup=row.groupId;
   $('title').value=row.title;$('checkout').value=row.checkout||'';
   checks.forEach(c=>{c.checked=c.value===row.channel;});
   $('save').click(); // Existing calendar workflow enforces required fields and rights.
  }finally{
   checks.forEach((c,index)=>{c.checked=oldChecks[index];});
   $('title').value=oldTitle;$('checkout').value=oldCheckout;
   activeGroup=oldGroup;
  }
  // The campaign-saved event, not this click, marks the draft scheduled.
 }
});
window.addEventListener('cde:campaign-saved',e=>markScheduled(e.detail));
window.CDEDraftRouter={sync,patch,captionForChannel,getRecords:()=>records.map(x=>({...x}))};
render();
})();