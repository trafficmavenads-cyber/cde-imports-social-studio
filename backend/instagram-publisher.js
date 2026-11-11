'use strict';
/*
 * Instagram API with Instagram Login — explicit, on-demand publishing only.
 * No timers, background jobs, permanent token storage or unattended uploads.
 */
const crypto=require('node:crypto');
const net=require('node:net');
const MAX_JOB_MS=45*60*1000;
const API_VERSION=(process.env.INSTAGRAM_GRAPH_VERSION||'v26.0').trim();
const PUBLISH_SCOPE='instagram_business_content_publish';
function publicMediaUrl(input){
 if(typeof input!=='string'||input.length>1800)return null;
 try{
  const u=new URL(input.trim());
  const name=u.hostname.toLowerCase();
  if(u.protocol!=='https:'||u.username||u.password||u.hash||u.port&&u.port!=='443')return null;
  if(net.isIP(name)||!name.includes('.')||name==='localhost'||name.endsWith('.localhost')||
     name.endsWith('.local')||name.endsWith('.internal')||name.endsWith('.test')||
     name.endsWith('.example')||name.endsWith('.invalid'))return null;
  if(!/^[a-z0-9.-]+$/.test(name)||name.split('.').some(part=>!part||part.length>63))return null;
  return u.href;
 }catch{return null;}
}
function createPublisher({getAccount,callMeta}){
 const jobs=new Map();
 const version=/^v\d{1,2}\.\d$/.test(API_VERSION)?API_VERSION:'v26.0';
 const graphFor=acc=>(acc?.flow==='unified'?'https://graph.facebook.com/':'https://graph.instagram.com/')+version;
 function cleanup(){
  for(const [key,job] of jobs)if(job.created+MAX_JOB_MS<Date.now())jobs.delete(key);
 }
 function requireAccount(session){
  const acc=getAccount(session);
  if(!acc||!acc.accessToken||!acc.openId)return {error:'Conecte sua conta Instagram profissional na seção Conexões.'};
  if(!acc.expiresAt||acc.expiresAt<=Date.now())return {error:'A autorização do Instagram expirou. Reconecte sua conta.'};
  const publishScope=acc.flow==='unified'?'instagram_content_publish':PUBLISH_SCOPE;
  if((acc.flow!=='unified'||acc.grantSource==='verified')&&
      !String(acc.scopes||'').split(/[,\s]+/).includes(publishScope))
   return {error:'A conta não concedeu '+publishScope+'. Revise a configuração na Meta e reconecte o Instagram.'};
  // When Meta does not expose /me/permissions for system-user tokens,
  // attempt only the explicitly requested operation; Meta enforces the permission.
  return {account:acc};
 }
 function getJob(session,input){
  const id=input?.jobId;
  if(typeof id!=='string'||!/^[a-f0-9]{48}$/.test(id))return null;
  const job=jobs.get(id);
  return job?.session===session?job:null;
 }
 function mediaTypeAllowed(item){
  if(!item||!['IMAGE','VIDEO'].includes(item.kind))return null;
  const url=publicMediaUrl(item.mediaUrl);
  if(!url)return null;
  const pathname=new URL(url).pathname;
  if(item.kind==='IMAGE'&&!/\.jpe?g$/i.test(pathname))return null;
  if(item.kind==='VIDEO'&&!/\.(mp4|mov)$/i.test(pathname))return null;
  return {kind:item.kind,mediaUrl:url};
 }
 async function createContainer(account,parameters){
  const response=await callMeta(graphFor(account)+'/'+encodeURIComponent(String(account.openId))+'/media',{
   method:'POST',headers:{Authorization:'Bearer '+account.accessToken,'Content-Type':'application/x-www-form-urlencoded'},
   body:new URLSearchParams(parameters)
  });
  if(!/^\d+$/.test(String(response.id||'')))throw Error('Meta não retornou container válido');
  return String(response.id);
 }
 async function containerState(account,id){
  const info=await callMeta(graphFor(account)+'/'+encodeURIComponent(id)+'?fields=status_code',{
   headers:{Authorization:'Bearer '+account.accessToken}
  });
  return String(info.status_code||'').toUpperCase();
 }
 function outputStatus(job,state,ready=false){
  return {code:200,body:{jobId:job.id,kind:job.kind,state,ready,mediaCount:job.items?.length||1}};
 }
 async function prepare(session,input){
  cleanup();
  const {account,error}=requireAccount(session);
  if(error)return {code:409,body:{error}};
  if(jobs.size>=100)return {code:429,body:{error:'Muitas publicações em preparação. Tente novamente mais tarde.'}};
  const kind=input?.kind;
  if(!['IMAGE','REELS','STORY_IMAGE','STORY_VIDEO','CAROUSEL'].includes(kind))
   return {code:400,body:{error:'Formato inválido. Use Feed, Reels, Story ou Carrossel.'}};
  if(input.shareToFeed!==undefined&&typeof input.shareToFeed!=='boolean')return {code:400,body:{error:'Escolha de Feed inválida.'}};
  const isStory=kind.startsWith('STORY_');
  const caption=typeof input.caption==='string'?input.caption.trim():'';
  if(!isStory&&(!caption||caption.length>2200))
   return {code:400,body:{error:'A legenda deve conter entre 1 e 2.200 caracteres.'}};
  if(isStory&&caption.length>2200)return {code:400,body:{error:'Legenda longa demais.'}};
  let items;
  if(kind==='CAROUSEL'){
   if(!Array.isArray(input.items)||input.items.length<2||input.items.length>10)
    return {code:400,body:{error:'Carrosséis precisam de 2 a 10 fotos ou vídeos.'}};
   items=input.items.map(mediaTypeAllowed);
   if(items.some(x=>!x))return {code:400,body:{error:'Use links HTTPS diretos de arquivos JPEG ou MP4/MOV no carrossel.'}};
  }else{
   const media=mediaTypeAllowed({kind:['IMAGE','STORY_IMAGE'].includes(kind)?'IMAGE':'VIDEO',mediaUrl:input.mediaUrl});
   if(!media)return {code:400,body:{error:'Informe o link HTTPS direto para foto JPEG ou vídeo MP4/MOV.'}};
   items=[media];
  }
  const id=crypto.randomBytes(24).toString('hex');
  const job={id,session,accountId:String(account.openId),kind,created:Date.now(),
   state:'preparing',caption,items,childIds:[],containerId:null,metaStatus:''};
  jobs.set(id,job);
  try{
   if(kind==='CAROUSEL'){
    // Child containers first; they must be FINISHED before the parent is created.
    for(const item of items){
     const args={is_carousel_item:'true'};
     if(item.kind==='IMAGE')args.image_url=item.mediaUrl;
     else{args.media_type='VIDEO';args.video_url=item.mediaUrl;}
     const child=await createContainer(account,args);
     job.childIds.push(child);
    }
    job.state='children_pending';
   }else{
    const args={};
    if(isStory)args.media_type='STORIES';
    else args.caption=caption;
    if(items[0].kind==='IMAGE')args.image_url=items[0].mediaUrl;
    else{
     if(kind==='REELS'){args.media_type='REELS';args.share_to_feed=input.shareToFeed===false?'false':'true';}
     args.video_url=items[0].mediaUrl;
    }
    job.containerId=await createContainer(account,args);
    job.state='prepared';
   }
   return {code:200,body:{jobId:id,kind,mediaCount:items.length,state:job.state,
    message:kind==='CAROUSEL'?'Itens recebidos; verifique o processamento para montar o carrossel.':'Mídia recebida; verifique o processamento da Meta.'}};
  }catch{
   // If Meta created a partial child, do not retry automatically.
   job.state='unknown';
   return {code:502,body:{error:'A Meta não confirmou toda a preparação. Confira as URLs e crie um novo rascunho antes de repetir.'}};
  }
 }
 async function checkStatus(session,input){
  cleanup();const job=getJob(session,input);
  if(!job)return {code:404,body:{error:'Preparação não encontrada ou expirada. Refaça o envio.'}};
  const {account,error}=requireAccount(session);
  if(error)return {code:409,body:{error}};
  if(String(account.openId)!==job.accountId)return {code:403,body:{error:'A mídia pertence a outra conta.'}};
  if(job.state==='published')return {code:200,body:{jobId:job.id,state:'published',ready:true,mediaId:job.mediaId}};
  if(job.state==='unknown')return {code:409,body:{error:'Estado desconhecido na Meta. Não repita automaticamente o envio.'}};
  if(['preparing','publishing','checking_children'].includes(job.state))
   return {code:409,body:{error:'Mídia sendo processada; consulte novamente.'}};
  if(job.kind==='CAROUSEL'&&job.state==='children_pending'){
   job.state='checking_children';
   try{
    const statuses=[];
    for(const child of job.childIds)statuses.push(await containerState(account,child));
    if(statuses.some(x=>['ERROR','EXPIRED'].includes(x))){
     job.state='failed';
     return {code:409,body:{error:'Um item do carrossel foi rejeitado pela Meta.',state:'ERROR',ready:false}};
    }
    if(statuses.some(x=>x!=='FINISHED')){
     job.state='children_pending';
     return outputStatus(job,'IN_PROGRESS',false);
    }
    // Assemble the carousel only after every child is ready.
    job.state='creating_parent';
    job.containerId=await createContainer(account,{
     media_type:'CAROUSEL',children:job.childIds.join(','),caption:job.caption
    });
    job.state='prepared';
   }catch{
    if(job.state==='creating_parent')job.state='unknown';else job.state='children_pending';
    return {code:502,body:{error:'Não foi possível preparar o carrossel. Verifique a mídia e tente consultar novamente.'}};
   }
  }
  if(job.state==='failed')return {code:409,body:{error:'A Meta rejeitou a mídia. Crie outra publicação.'}};
  if(job.state!=='prepared')return {code:409,body:{error:'A preparação não está pronta.'}};
  try{
   const state=await containerState(account,job.containerId);
   job.metaStatus=state;
   if(['ERROR','EXPIRED'].includes(state)){
    job.state='failed';
    return {code:409,body:{jobId:job.id,state,ready:false,error:'A Meta rejeitou ou expirou a mídia.'}};
   }
   return outputStatus(job,state,state==='FINISHED');
  }catch{
   return {code:502,body:{error:'Não foi possível consultar o processamento no Instagram.'}};
  }
 }
 async function confirm(session,input){
  cleanup();
  if(input?.confirm!==true)return {code:400,body:{error:'Confirme explicitamente que deseja publicar o conteúdo no Instagram.'}};
  const job=getJob(session,input);
  if(!job)return {code:404,body:{error:'Preparação não encontrada ou expirada. Refaça o envio.'}};
  const {account,error}=requireAccount(session);
  if(error)return {code:409,body:{error}};
  if(String(account.openId)!==job.accountId)return {code:403,body:{error:'Reconecte a conta correta antes de publicar.'}};
  if(job.state==='published')return {code:200,body:{state:'published',mediaId:job.mediaId}};
  if(job.state!=='prepared')return {code:409,body:{error:'Não é possível repetir esta tentativa. Confira o Instagram antes de criar outro post.'}};
  job.state='checking';
  let state;
  try{
   const info=await callMeta(graphFor(account)+'/'+encodeURIComponent(job.containerId)+'?fields=status_code',{
    headers:{Authorization:'Bearer '+account.accessToken}
   });
   state=String(info.status_code||'').toUpperCase();
  }catch{
   job.state='prepared';
   return {code:502,body:{error:'Não foi possível confirmar a prontidão da mídia. Verifique novamente.'}};
  }
  if(state!=='FINISHED'){
   job.state='prepared';
   return {code:409,body:{error:state==='IN_PROGRESS'?'A mídia ainda está sendo processada. Verifique novamente antes de publicar.':'A mídia não está pronta para publicação. Estado: '+(state||'desconhecido')+'.',state}};
  }
  // Transition synchronously before the external call to prevent duplicate POSTs.
  job.state='publishing';
  try{
   const data=await callMeta(graphFor(account)+'/'+encodeURIComponent(job.accountId)+'/media_publish',{
    method:'POST',headers:{Authorization:'Bearer '+account.accessToken,'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({creation_id:job.containerId})
   });
   if(!/^\d+$/.test(String(data.id||'')))throw new Error('A publicação não retornou ID.');
   job.mediaId=String(data.id);job.state='published';
   return {code:200,body:{state:'published',mediaId:job.mediaId,message:'A Meta confirmou a publicação no Instagram.'}};
  }catch{
   job.state='unknown';
   return {code:502,body:{error:'O Instagram não confirmou o resultado. Confira seu perfil antes de tentar publicar novamente, para evitar duplicação.'}};
  }
 }
 return {prepare,checkStatus,confirm,publicMediaUrl};
}
module.exports={createPublisher,publicMediaUrl};
