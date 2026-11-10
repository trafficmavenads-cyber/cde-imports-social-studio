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
    esc(x.caption)+'</textarea></label>'+
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
function sync({groupId,title,captions,checkout}){
 if(typeof title!=='string'||!title.trim()||!captions||typeof captions!=='object')return null;
 const input=Object.entries(captions)
  .filter(([network,text])=>CHANNELS[network]&&typeof text==='string'&&text.trim())
  .map(([channel,caption])=>({channel,caption:caption.trim().slice(0,4000)}));
 if(!input.length)return null;
 const existing=records.filter(x=>x.groupId===groupId);
 const reusable=groupId&&existing.length&&!existing.some(x=>x.scheduled);
 const id=reusable?groupId:newId();
 const allowed=new Set(input.map(x=>x.channel));
 records=records.filter(x=>!(x.groupId===id&&!allowed.has(x.channel)));
 const currentDate=new Date().toISOString();
 for(const row of input){
  const record=records.find(x=>x.groupId===id&&x.channel===row.channel);
  if(record&&!record.scheduled){record.caption=row.caption;record.title=title.trim();record.checkout=checkout||'';record.updated=currentDate;}
  else records.push({id:newId(),groupId:id,title:title.trim().slice(0,110),channel:row.channel,
   caption:row.caption,checkout:checkout||'',scheduled:false,created:currentDate,updated:currentDate});
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
 if(action==='copy'){
  try{await navigator.clipboard.writeText(value);show('Legenda de '+CHANNELS[row.channel]+' copiada.');}
  catch{show('Não foi possível copiar automaticamente.',true);}return;
 }
 row.caption=value.slice(0,4000);row.updated=new Date().toISOString();persist();
 if(action==='save'){render();show('Legenda de '+CHANNELS[row.channel]+' salva neste navegador.');return;}
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