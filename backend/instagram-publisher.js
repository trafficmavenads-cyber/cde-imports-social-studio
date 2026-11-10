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
 const graph='https://graph.instagram.com/'+(/^\x76\d{1,2}\.\d$/.test(API_VERSION)?API_VERSION:'v26.0');
 function cleanup(){
  for(const [key,job] of jobs)if(job.created+MAX_JOB_MS<Date.now())jobs.delete(key);
 }
 function requireAccount(session){
  const acc=getAccount(session);
  if(!acc||!acc.accessToken||!acc.openId)return {error:'Conecte sua conta Instagram profissional na seção Conexões.'};
  if(!acc.expiresAt||acc.expiresAt<=Date.now())return {error:'A autorização do Instagram expirou. Reconecte sua conta.'};
  if(!String(acc.scopes||'').split(/[,\s]+/).includes(PUBLISH_SCOPE))
   return {error:'Reconecte a conta concedendo instagram_business_content_publish no aplicativo Meta.'};
  return {account:acc};
 }
 function getJob(session,input){
  const id=input?.jobId;
  if(typeof id!=='string'||!/^[a-f0-9]{48}$/.test(id))return null;
  const job=jobs.get(id);
  return job?.session===session?job:null;
 }
 async function prepare(session,input){
  cleanup();
  const {account,error}=requireAccount(session);
  if(error)return {code:409,body:{error}};
  if(jobs.size>=100)return {code:429,body:{error:'Muitas publicações em preparação. Tente novamente mais tarde.'}};
  if(!input||!['IMAGE','REELS'].includes(input.kind))return {code:400,body:{error:'Selecione foto de Feed ou vídeo para Reels.'}};
  const url=publicMediaUrl(input.mediaUrl);
  if(!url)return {code:400,body:{error:'Informe um link HTTPS público direto para o arquivo de mídia.'}};
  const caption=typeof input.caption==='string'?input.caption.trim():'';
  if(!caption||caption.length>2200)return {code:400,body:{error:'A legenda deve conter entre 1 e 2.200 caracteres.'}};
  if(input.kind==='IMAGE'&& !/\.jpe?g(?:$|\?)/i.test(new URL(url).pathname+'?'))
   return {code:400,body:{error:'Para fotos do Instagram, utilize um link direto de imagem JPEG (.jpg ou .jpeg).'}};
  const args={caption};
  if(input.kind==='IMAGE')args.image_url=url;
  else {args.media_type='REELS';args.video_url=url;args.share_to_feed='true';}
  const id=crypto.randomBytes(24).toString('hex');
  const job={id,session,accountId:String(account.openId),kind:input.kind,created:Date.now(),state:'preparing',caption,mediaUrl:url};
  jobs.set(id,job);
  try{
   const data=await callMeta(graph+'/'+encodeURIComponent(job.accountId)+'/media',{
    method:'POST',headers:{Authorization:'Bearer '+account.accessToken,'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams(args)
   });
   if(!/^\d+$/.test(String(data.id||'')))throw new Error('A Meta não retornou o identificador da mídia.');
   job.containerId=String(data.id);job.state='prepared';
   return {code:200,body:{jobId:id,state:'prepared',kind:job.kind,message:'Mídia enviada para preparação na Meta. Verifique se está pronta antes de publicar.'}};
  }catch(e){
   jobs.delete(id);
   return {code:502,body:{error:'Não foi possível preparar a mídia no Instagram. Verifique a permissão, a URL pública e o formato.'}};
  }
 }
 async function checkStatus(session,input){
  cleanup();const job=getJob(session,input);
  if(!job)return {code:404,body:{error:'Preparação não encontrada ou expirada. Refaça o envio.'}};
  const {account,error}=requireAccount(session);
  if(error)return {code:409,body:{error}};
  if(String(account.openId)!==job.accountId)return {code:403,body:{error:'A mídia pertence a outra conta. Prepare novamente.'}};
  if(job.state==='published')return {code:200,body:{jobId:job.id,state:'published',mediaId:job.mediaId}};
  if(job.state==='unknown')return {code:409,body:{error:'Resultado do envio não confirmado. Confira o Instagram antes de tentar criar outra publicação.'}};
  if(job.state==='publishing')return {code:409,body:{error:'Publicação em andamento. Não repita o envio.'}};
  try{
   const info=await callMeta(graph+'/'+encodeURIComponent(job.containerId)+'?fields=status_code',{
    headers:{Authorization:'Bearer '+account.accessToken}
   });
   const state=String(info.status_code||'').toUpperCase();
   job.metaStatus=state;
   if(['ERROR','EXPIRED'].includes(state))return {code:409,body:{jobId:job.id,state,ready:false,error:'O Instagram não conseguiu processar essa mídia. Confira o arquivo público e prepare novamente.'}};
   return {code:200,body:{jobId:job.id,state,ready:state==='FINISHED'}};
  }catch{
   return {code:502,body:{error:'Não foi possível consultar o processamento no Instagram. Tente verificar novamente.'}};
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
   const info=await callMeta(graph+'/'+encodeURIComponent(job.containerId)+'?fields=status_code',{
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
   const data=await callMeta(graph+'/'+encodeURIComponent(job.accountId)+'/media_publish',{
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
