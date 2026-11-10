'use strict';
// Ephemeral, public-read-only media staging for Instagram's URL-based ingestion.
// JPEG bytes stay in RAM for <= 90 minutes. Never store OAuth/access credentials.
const crypto=require('node:crypto');
const MAX_JPEG_BYTES=8*1024*1024,TTL_MS=90*60*1000,MAX_COUNT=12,MAX_TOTAL=64*1024*1024;
function createMediaStore({apiBase}){
 const files=new Map();
 function clean(){
  for(const [id,x] of files)if(x.expires<=Date.now())files.delete(id);
 }
 function bytesInMemory(){
  return [...files.values()].reduce((sum,x)=>sum+x.bytes.length,0);
 }
 async function stage(req,session){
  clean();
  const contentType=String(req.headers['content-type']||'').split(';')[0].trim().toLowerCase();
  if(contentType!=='image/jpeg')return {code:415,body:{error:'Envie uma imagem JPEG válida (image/jpeg).'}};
  const claimed=Number(req.headers['content-length']||0);
  if(claimed>MAX_JPEG_BYTES)return {code:413,body:{error:'A foto JPEG pode ter no máximo 8 MB.'}};
  const chunks=[];let size=0;
  for await(const chunk of req){
   size+=chunk.length;
   if(size>MAX_JPEG_BYTES)return {code:413,body:{error:'A foto JPEG pode ter no máximo 8 MB.'}};
   chunks.push(chunk);
  }
  if(size<8)return {code:400,body:{error:'A imagem está vazia ou não é um JPEG válido.'}};
  const bytes=Buffer.concat(chunks,size);
  if(!(bytes[0]===0xff&&bytes[1]===0xd8&&bytes[size-2]===0xff&&bytes[size-1]===0xd9))
   return {code:400,body:{error:'Arquivo JPEG inválido. Gere novamente a imagem pelo editor.'}};
  if(files.size>=MAX_COUNT||size+bytesInMemory()>MAX_TOTAL)
   return {code:429,body:{error:'O servidor gratuito atingiu o limite temporário de fotos. Use uma URL pública existente ou tente novamente mais tarde.'}};
  const id=crypto.randomBytes(24).toString('hex');
  const expires=Date.now()+TTL_MS;
  files.set(id,{bytes,expires,session});
  return {code:201,body:{
   mediaUrl:apiBase+'/api/instagram/media/'+id+'.jpg',
   expiresAt:new Date(expires).toISOString(),temporary:true,
   note:'Foto temporária para publicação imediata; pode desaparecer se o Render gratuito reiniciar.'
  }};
 }
 function serve(req,res,pathname){
  clean();
  const match=/^\/api\/instagram\/media\/([a-f0-9]{48})\.jpg$/.exec(pathname);
  if(!match)return false;
  if(req.method!=='GET'&&req.method!=='HEAD'){
   res.writeHead(405,{'Allow':'GET, HEAD','Cache-Control':'no-store'});res.end();return true;
  }
  const f=files.get(match[1]);
  if(!f){
   res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});res.end('Arquivo temporário não encontrado ou expirado.');return true;
  }
  res.writeHead(200,{
   'Content-Type':'image/jpeg','Content-Length':f.bytes.length,
   'Content-Disposition':'inline','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex',
   'Cache-Control':'private, max-age=60'
  });
  res.end(req.method==='HEAD'?undefined:f.bytes);
  return true;
 }
 return {stage,serve};
}
module.exports={createMediaStore};
