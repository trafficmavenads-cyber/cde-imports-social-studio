(() => {
'use strict';
const $=id=>document.getElementById(id);
const NETWORKS={
 'instagram-feed':['Instagram Feed',7,'Conheça os detalhes na CDE Imports.'],
 'instagram-stories':['Instagram Stories',2,'Confira o produto na CDE Imports!'],
 'instagram-reels':['Instagram Reels',5,'Confira esse destaque da CDE Imports.'],
 'tiktok':['TikTok',5,'Veja mais na CDE Imports.'],
 'pinterest':['Pinterest',6,'Veja os detalhes na CDE Imports.'],
 'youtube-shorts':['YouTube Shorts',3,'Saiba mais na CDE Imports.'],
 'whatsapp-group':['WhatsApp Grupo',0,'Consulte os detalhes e faça seu pedido na CDE Imports.'],
 'whatsapp-status':['WhatsApp Status',0,'Confira na CDE Imports!']
};
const HEADS={
 premium:['✨ Conheça um destaque especial da CDE Imports','Uma escolha para quem valoriza cada detalhe ✨'],
 energetico:['🚀 Olha essa novidade da CDE Imports!','👀 Já conhece esse destaque?'],
 direto:['📣 Em destaque na CDE Imports','O produto que merece sua atenção hoje']
};
const QUESTIONS={vender:'O que você procura em um produto assim?',engajar:'Você usaria ou presentearia alguém?',apresentar:'Quer saber mais sobre esse produto?'};
const STOP=new Set('a o as os ao aos de da do das dos e em um uma uns umas para por com sem que na no nas nos seu sua seus suas esse essa este esta mais sobre produto original loja cde imports'.split(' '));
const state={variants:new Map(),chosen:new Map(),tags:[],ideas:[],mode:'local',generating:false,signature:'',draftGroupId:null};
function el(tag,cls,text){
 const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;
}
function button(title,click,cls='secondary'){
 const n=el('button',cls,title);n.type='button';n.addEventListener('click',click);return n;
}
function status(t,err=false){const n=$('ai-status');n.textContent=t;n.classList.toggle('error',err);}
function formData(){
 return {title:$('title').value.trim().slice(0,110),
  brief:$('ai-brief').value.trim().replace(/\s+/g,' ').slice(0,500),
  tone:$('ai-tone').value,goal:$('ai-goal').value,
  channels:[...document.querySelectorAll('#channels input:checked')].map(n=>n.value).filter(id=>NETWORKS[id])};
}
function signature(d){return JSON.stringify([d.title,d.brief,d.tone,d.goal,d.channels]);}
function slug(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Za-z0-9]/g,'');}
function getTags(d){
 const words=d.title.toLowerCase().split(/\s+/).map(slug).filter(s=>s.length>2&&!STOP.has(s.toLowerCase()));
 const title=slug(d.title).slice(0,42);
 const cat=/(perfume|fragrancia|aroma|essencia|oud)/i.test(d.title+' '+d.brief)?['#PerfumesImportados','#Perfumaria','#Fragrancias']:
 /(relogio|garmin|smartwatch)/i.test(d.title+' '+d.brief)?['#Relogios','#Acessorios','#Tecnologia']:
 /(fone|camera|celular|eletronico|tablet)/i.test(d.title+' '+d.brief)?['#Tecnologia','#Eletronicos','#Novidades']:
 ['#ProdutosImportados','#ComprasOnline','#DicasDeCompras'];
 return [...new Set(['#CDEImports',title.length>4?'#'+title:'',...cat,...words.slice(0,3).map(x=>'#'+x.charAt(0).toUpperCase()+x.slice(1)),'#FozDoIguacu'].filter(Boolean))].slice(0,10);
}
function offlineCaption(d,id,version,tags){
 const name=NETWORKS[id],head=(HEADS[d.tone]||HEADS.premium)[version];
 const question=QUESTIONS[d.goal]||QUESTIONS.vender,cta=name[2];
 const detail=d.brief?'Destaques informados: '+d.brief.replace(/[.!?]+$/,'')+'.':'Conheça os detalhes antes de escolher.';
 let body;
 if(id==='instagram-stories')body=(version?'👀 Você conhece? ':'✨ Em destaque: ')+d.title+'\n'+(d.brief||question)+'\n'+cta;
 else if(id==='whatsapp-status')body=(version?'👀 Vale conhecer: ':'✨ Destaque: ')+d.title+'\n'+(d.brief||'Confira as informações.')+'\n'+cta;
 else if(id==='whatsapp-group')body=(version?'✨ Confira este produto':'📣 Destaque CDE Imports')+'\n*'+d.title+'*\n'+detail+'\n'+cta;
 else if(id==='youtube-shorts')body=d.title+' | CDE Imports\n'+(d.brief||'Veja '+d.title+' de perto neste vídeo.')+'\nInscreva-se no canal e conte o que gostaria de conhecer sobre '+d.title+'.';
 else if(['tiktok','instagram-reels'].includes(id))body=(version?'✨ Você conhece? ':'👀 Olha isso! ')+d.title+'\n'+(d.brief||'Descubra os detalhes.')+'\n'+question+'\n'+cta;
 else if(id==='pinterest')body=d.title+' | CDE Imports\n'+detail+'\n'+(version?question:'Salve esta ideia para consultar depois.')+'\n'+cta;
 else body=head+'\n\n'+d.title+'\n'+detail+'\n\n'+(version?question:'Conheça uma nova opção para suas escolhas.')+'\n'+cta;
 return body+(name[1]?'\n\n'+tags.slice(0,name[1]).join(' '):'');
}
function ideaSet(d){
 const subject=d.title||'seu produto';
 return ['🎬 Grave um vídeo curto mostrando '+subject+' e apenas características verificadas.',
  '📸 Crie um carrossel com três ângulos reais de '+subject+'.',
  '💬 Pergunte ao público o que ele gostaria de saber sobre '+subject+'.',
  '🎁 Mostre uma ocasião em que '+subject+' poderia ser uma opção de presente, quando aplicável.'];
}
function localGenerate(d){
 const tags=getTags(d);
 return {suggestions:d.channels.map(channel=>({channel,variants:[0,1].map(i=>offlineCaption(d,channel,i,tags))})),
  hashtags:tags,ideas:ideaSet(d)};
}
function normalize(result,d,mode){
 const fallback=localGenerate(d),sources=Array.isArray(result?.suggestions)?result.suggestions:[];
 const suggestions=d.channels.map(channel=>{
  const from=sources.find(x=>x?.channel===channel);
  const variants=(Array.isArray(from?.variants)?from.variants:[]).filter(x=>typeof x==='string').map(x=>x.trim().slice(0,1600)).filter(Boolean).slice(0,2);
  while(variants.length<2)variants.push(fallback.suggestions.find(x=>x.channel===channel).variants[variants.length]);
  return {channel,variants};
 });
 const tags=Array.isArray(result?.hashtags)?result.hashtags.filter(x=>typeof x==='string'&&/^#[A-Za-zÀ-ÿ0-9_]{2,45}$/.test(x)).slice(0,12):[];
 const ideas=Array.isArray(result?.ideas)?result.ideas.filter(x=>typeof x==='string').map(x=>x.trim().slice(0,280)).filter(Boolean).slice(0,5):[];
 return {suggestions,hashtags:tags.length?tags:fallback.hashtags,ideas:ideas.length?ideas:fallback.ideas,mode};
}
function apply(result,d){
 state.variants.clear();state.chosen.clear();
 for(const row of result.suggestions){state.variants.set(row.channel,row.variants);state.chosen.set(row.channel,0);}
 state.tags=result.hashtags;state.ideas=result.ideas;state.mode=result.mode;state.signature=signature(d);
 const captions=Object.fromEntries([...state.variants].map(([network,versions])=>[network,versions[0]]));
 state.draftGroupId=window.CDEDraftRouter?.sync?.({groupId:state.draftGroupId,title:d.title,captions,checkout:$('checkout').value.trim(),mediaUrl:$('image-url').value.trim()})||null;
 render();
}
async function copy(text){
 try{await navigator.clipboard.writeText(text);status('Texto copiado para a área de transferência!');}
 catch{status('O navegador não permitiu copiar. Selecione o texto manualmente.',true);}
}
function renderCaptions(){
 const area=$('ai-captions');area.replaceChildren();if(!state.variants.size)return;
 const hd=el('div','ai-result-heading');
 hd.append(el('strong','', 'Legendas por rede social · '+state.variants.size+' destino(s)'));
 hd.append(el('small','',state.mode==='online'?'Gerado por IA online · revise antes de usar':'Sugestões automáticas locais · personalizáveis'));area.append(hd);
 for(const [id,variants] of state.variants){
  const group=el('article','ai-channel-card');group.append(el('h4','',NETWORKS[id][0]));
  variants.forEach((text,index)=>{
   const chosen=state.chosen.get(id)===index;
   const block=el('div','ai-variant'+(chosen?' is-selected':''));
   const heading=el('div','ai-variant-header');
   heading.append(el('strong','','Versão '+(index+1)),el('span','',chosen?'Selecionada para esta rede':'Alternativa'));
   block.append(heading,el('p','ai-copy-text',text));
   const buttons=el('div','ai-variant-actions');
   buttons.append(button(chosen?'✓ Usando nesta rede':'Usar nesta rede',()=>{
    state.chosen.set(id,index);renderCaptions();if(state.draftGroupId)window.CDEDraftRouter?.patch?.(state.draftGroupId,id,text);status('Versão '+(index+1)+' inserida automaticamente no post de '+NETWORKS[id][0]+'.');
   },chosen?'primary':'secondary'));
   buttons.append(button('Copiar',()=>copy(text)));
   buttons.append(button('Editar no texto principal',()=>{
    $('caption').value=text;$('caption').dispatchEvent(new Event('input',{bubbles:true}));
    status('Legenda enviada ao campo principal. As escolhas de cada rede continuam disponíveis.');
   }));
   block.append(buttons);group.append(block);
  });area.append(group);
 }
}
function renderTags(){
 const area=$('ai-hashtags');area.replaceChildren();if(!state.tags.length)return;
 const hd=el('div','ai-result-heading');hd.append(el('strong','','Sugestões de hashtags'),button('Copiar todas',()=>copy(state.tags.join(' '))));area.append(hd);
 const cloud=el('div','ai-tag-cloud');
 for(const tag of state.tags)cloud.append(button(tag,()=>copy(tag),'ai-tag'));
 area.append(cloud);
 area.append(el('small','ai-tip','Hashtags geradas a partir das informações fornecidas; não são tendências verificadas.'));
}
function renderIdeas(){
 const area=$('ai-ideas-result');area.replaceChildren();if(!state.ideas.length)return;
 area.append(el('strong','','Ideias para vencer o bloqueio criativo'));
 const ul=el('ul');for(const item of state.ideas)ul.append(el('li','',item));area.append(ul);
}
function render(){renderCaptions();renderTags();renderIdeas();}
function onlineStatus(){
 const info=window.CDEAIBackend?.status?.()||{available:false,configured:false};
 $('ai-online').disabled=state.generating||!info.available;
 const provider=info.provider==='gemini'?'Google Gemini':info.provider==='openai'?'OpenAI API':'IA';
 $('ai-online-note').textContent=info.available
  ?provider+' conectado ao servidor. Revise as sugestões; a cota e os preços dependem do plano do provedor.'
  :info.configured
   ?provider+' configurado no Render. Entre com a senha administrativa na seção Conexões.'
   :'IA online gratuita opcional: obtenha sua chave no Google AI Studio e configure GEMINI_API_KEY e ADMIN_PASSWORD apenas no Render. O gerador local continua funcionando.';
}
function busy(on){state.generating=on;$('ai-local').disabled=on;$('ai-unblock').disabled=on;onlineStatus();}
function valid(d){
 if(!d.title){status('Informe o nome do produto antes de gerar textos.',true);return false;}
 if(!d.channels.length){status('Selecione pelo menos um destino antes de gerar textos.',true);return false;}
 return true;
}
$('ai-local').addEventListener('click',()=>{
 const d=formData();if(!valid(d))return;
 apply(normalize(localGenerate(d),d,'local'),d);
 status('Legendas adicionadas automaticamente aos posts de cada rede. Veja em “Posts por rede” para editar ou agendar.');
});
$('ai-online').addEventListener('click',async()=>{
 const d=formData();if(!valid(d))return;
 if(!window.CDEAIBackend?.status?.().available){status('Configure a IA no Render e faça login na seção Conexões.',true);return;}
 busy(true);status('Gerando conteúdos com a IA online…');
 try{
  const r=await window.CDEAIBackend.generate(d);
  apply(normalize(r,d,'online'),d);
  status('Gemini concluiu: cada legenda já está no rascunho da rede correspondente. Abra “Posts por rede” para revisar ou agendar.');
 }catch(e){status('Não foi possível gerar com IA online: '+(e.message||'erro')+'. Use as sugestões locais.',true);}
 finally{busy(false);}
});
$('ai-unblock').addEventListener('click',()=>{
 const d=formData();if(!d.title){status('Informe o nome do produto para gerar ideias.',true);return;}
 state.ideas=ideaSet(d);renderIdeas();status('Quatro ideias prontas para usar na sua campanha.');
});
window.CDESocialAI={generateForProduct:async title=>{
 const d={title:String(title).trim().slice(0,110),brief:'',tone:'premium',goal:'apresentar',channels:['instagram-reels','youtube-shorts']};
 if(!d.title)throw Error('Informe o nome do produto.');
 const online=Boolean(window.CDEAIBackend?.status?.().available);
 const result=online?await window.CDEAIBackend.generate(d):localGenerate(d);
 const normalized=normalize(result,d,online?'online':'local');
 return {mode:normalized.mode,captions:Object.fromEntries(normalized.suggestions.map(x=>[x.channel,x.variants[0]]))};
},captionForChannel:channel=>{
 if(!state.variants.has(channel)||state.signature!==signature(formData()))return null;
 return state.variants.get(channel)?.[state.chosen.get(channel)||0]||null;
}};
const number=n=>Number(n).toLocaleString('pt-BR');
const percent=n=>(n*100).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'%';
function metric(x,key){
 const value=x?.[key];
 return value===null||value===undefined||value===''||!Number.isFinite(Number(value))?null:Math.max(0,Number(value));
}
function performance(){
 const area=$('ai-performance');area.replaceChildren();
 const rows=(window.CDESocialData?.getItems?.()||[]).map(item=>{
  const views=metric(item,'views'),likes=metric(item,'likes'),comments=metric(item,'comments'),shares=metric(item,'shares');
  return {item,views,likes,comments,shares,interactions:(likes||0)+(comments||0)+(shares||0),
   complete:views!==null&&views>0&&likes!==null&&comments!==null&&shares!==null};
 }).filter(x=>x.complete);
 const head=el('div','ai-performance-heading');
 head.append(el('strong','','✦ Insights de performance'),el('small','','Somente métricas informadas manualmente'));
 area.append(head);
 if(!rows.length){area.append(el('p','ai-empty','Preencha visualizações, curtidas, comentários e compartilhamentos de pelo menos uma publicação para receber insights.'));return;}
 let views=0,interactions=0;
 const byNetwork=new Map();
 for(const x of rows){
  views+=x.views;interactions+=x.interactions;
  const group=byNetwork.get(x.item.channel)||{name:NETWORKS[x.item.channel]?.[0]||x.item.channel,views:0,interactions:0,count:0};
  group.views+=x.views;group.interactions+=x.interactions;group.count++;byNetwork.set(x.item.channel,group);
 }
 const ranked=[...byNetwork.values()].sort((a,b)=>b.interactions/b.views-a.interactions/a.views),best=ranked[0];
 const cards=el('div','ai-stats-grid');
 for(const [label,value,note] of [
  ['Publicações avaliadas',number(rows.length),'Com os quatro indicadores informados'],
  ['Visualizações registradas',number(views),'Soma dos registros manuais'],
  ['Engajamento por visualização',percent(interactions/views),'Interações divididas por visualizações'],
  ['Maior taxa entre redes',best.name,percent(best.interactions/best.views)+' · '+best.count+' publicação(ões)']
 ]){
  const card=el('div','ai-stat-card');
  card.append(el('small','',label),el('b','',value),el('small','',note));cards.append(card);
 }
 area.append(cards);
 const rank=el('div','ai-ranking');rank.append(el('strong','','Comparação por rede'));
 for(const group of ranked)rank.append(el('div','ai-ranking-row',group.name+': '+percent(group.interactions/group.views)+' · '+number(group.views)+' visualizações · '+group.count+' publicação(ões)'));
 area.append(rank);
 area.append(el('p','ai-insight-note',ranked.length>1?'Próximo teste: crie outra versão para '+best.name+' e compare as taxas nas mesmas condições.':'Próximo teste: registre resultados de outra rede para comparar com '+best.name+'.'));
 if(rows.length<5)area.append(el('small','ai-tip','Amostra pequena. Estas observações não garantem resultados futuros nem representam dados automáticos das plataformas.'));
}
window.addEventListener('cde:metrics-updated',performance);
window.addEventListener('cde:connections-change',onlineStatus);
performance();onlineStatus();
})();