'use strict';
// OAuth tokens remain server-side and are lost on Render Free restart.
// Upload only files owned by the logged-in session; never fetch arbitrary URLs.
const fs=require('node:fs');
const YT='https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status';
const TOKEN='https://oauth2.googleapis.com/token';
const MB=1024*1024;
async function readJson(response){
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw Error('YouTube recusou a operação (HTTP '+response.status+'). '+String(data.error?.message||'').slice(0,110));
 return data;
}
function createYoutubePublisher({clientId,clientSecret,getAccount,getOwnedMedia}){
 async function publish(session,{mediaUrl,title,description,privacyStatus='public',madeForKids=false}={}){
  const account=getAccount(session);
  if(!account)return {code:409,body:{error:'Conecte seu canal YouTube na área Conexões.'}};
  if(!['public','private','unlisted'].includes(privacyStatus)||typeof title!=='string'||!title.trim()||
     title.length>100||typeof description!=='string'||description.length>4900||typeof madeForKids!=='boolean')
   return {code:400,body:{error:'Preencha um título (até 100 caracteres) e uma descrição válida.'}};
  const media=getOwnedMedia(session,mediaUrl);
  if(!media||!media.isVideo||media.size>300*MB)
   return {code:400,body:{error:'Selecione um MP4 carregado nesta sessão (até 300 MB).'}};
  if(!account.scopes?.includes('https://www.googleapis.com/auth/youtube.upload'))
   return {code:403,body:{error:'A conta Google não concedeu permissão youtube.upload.'}};
  try{
   let token=account.accessToken;
   if(Date.now()>account.expiresAt-60000){
    if(!account.refreshToken)return {code:401,body:{error:'Autorização do YouTube expirada. Reconecte seu canal.'}};
    const fresh=await readJson(await fetch(TOKEN,{
     method:'POST',signal:AbortSignal.timeout(15000),
     headers:{'Content-Type':'application/x-www-form-urlencoded'},
     body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,refresh_token:account.refreshToken,grant_type:'refresh_token'})
    }));
    token=fresh.access_token;account.accessToken=token;
    account.expiresAt=Date.now()+(Number(fresh.expires_in)||3600)*1000;
   }
   const init=await fetch(YT,{method:'POST',redirect:'error',signal:AbortSignal.timeout(25000),
    headers:{Authorization:'Bearer '+token,'Content-Type':'application/json; charset=UTF-8',
     'X-Upload-Content-Type':'video/mp4','X-Upload-Content-Length':String(media.size)},
    body:JSON.stringify({snippet:{title:title.trim(),description:description.trim(),categoryId:'22'},
     status:{privacyStatus,selfDeclaredMadeForKids:madeForKids}})});
   if(!init.ok)await readJson(init);
   const location=init.headers.get('location');
   if(!location||!location.startsWith('https://www.googleapis.com/upload/'))
    throw Error('O YouTube não retornou uma sessão segura de upload.');
   const stream=fs.createReadStream(media.path);
   const sent=await fetch(location,{method:'PUT',redirect:'error',signal:AbortSignal.timeout(8*60*1000),
    headers:{Authorization:'Bearer '+token,'Content-Type':'video/mp4','Content-Length':String(media.size)},
    body:stream,duplex:'half'}).finally(()=>stream.destroy());
   const data=await readJson(sent);
   if(!/^[a-zA-Z0-9_-]{11}$/.test(String(data.id||'')))throw Error('YouTube não confirmou o identificador do vídeo.');
   return {code:200,body:{published:true,videoId:data.id,url:'https://www.youtube.com/watch?v='+data.id,
    privacyStatus:data.status?.privacyStatus||privacyStatus}};
  }catch(error){
   console.error('Falha no upload YouTube:',error.name);
   return {code:502,body:{error:String(error.message||'YouTube indisponível').slice(0,180)}};
  }
 }
 return {publish};
}
module.exports={createYoutubePublisher};
