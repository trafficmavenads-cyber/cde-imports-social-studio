'use strict';
// Ephemeral, public-read-only media staging for Instagram's URL-based ingestion.
// JPEG bytes stay in RAM for <= 90 minutes. Never store OAuth/access credentials.
const crypto=require('node:crypto');
const MAX_JPEG_BYTES=8*1024*1024,MAX_MP4_BYTES=24*1024*1024,TTL_MS=90*60*1000,MAX_COUNT=20,MAX_TOTAL=96*1024*1024;
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
  if(!['image/jpeg','video/mp4'].includes(contentType))return {code:415,body:{error:'Envie JPEG ou MP4. Outros formatos devem usar URL pública.'}};
  const isVideo=contentType==='video/mp4',maxBytes=isVideo?MAX_MP4_BYTES:MAX_JPEG_BYTES;
  const claimed=Number(req.headers['content-length']||0);
  if(claimed>maxBytes)return {code:413,body:{error:'Tamanho excedido: JPEG até 8 MB, MP4 até 24 MB.'}};
  const chunks=[];let size=0;
  for await(const chunk of req){
   size+=chunk.length;
   if(size>maxBytes)return {code:413,body:{error:'Tamanho excedido: JPEG até 8 MB, MP4 até 24 MB.'}};
   chunks.push(chunk);
  }
  if(size<12)return {code:400,body:{error:'Arquivo muito pequeno ou inválido.'}};
  const bytes=Buffer.concat(chunks,size);
  const valid=isVideo?bytes.subarray(4,8).toString('ascii')==='ftyp':
   bytes[0]===0xff&&bytes[1]===0xd8&&bytes[size-2]===0xff&&bytes[size-1]===0xd9;
  if(!valid)return {code:400,body:{error:'Assinatura do arquivo inválida: envie um JPEG ou MP4 real.'}};
  if(files.size>=MAX_COUNT||size+bytesInMemory()>MAX_TOTAL)
   return {code:429,body:{error:'O servidor gratuito atingiu o limite temporário de fotos. Use uma URL pública existente ou tente novamente mais tarde.'}};
  const id=crypto.randomBytes(24).toString('hex');
  const expires=Date.now()+TTL_MS;
  files.set(id,{bytes,expires,session,isVideo});
  return {code:201,body:{
   mediaUrl:apiBase+'/api/instagram/media/'+id+(isVideo?'.mp4':'.jpg'),
   expiresAt:new Date(expires).toISOString(),temporary:true,
   note:'Foto temporária para publicação imediata; pode desaparecer se o Render gratuito reiniciar.'
  }};
 }
 function serve(req,res,pathname){
  clean();
  const match=/^\/api\/instagram\/media\/([a-f0-9]{48})\.(jpg|mp4)$/.exec(pathname);
  if(!match)return false;
  if(req.method!=='GET'&&req.method!=='HEAD'){
   res.writeHead(405,{'Allow':'GET, HEAD','Cache-Control':'no-store'});res.end();return true;
  }
  const f=files.get(match[1]);
  if(!f||Boolean(f.isVideo)!==(match[2]==='mp4')){
   res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});res.end('Arquivo temporário não encontrado ou expirado.');return true;
  }
  res.writeHead(200,{
   'Content-Type':f.isVideo?'video/mp4':'image/jpeg','Content-Length':f.bytes.length,
   'Content-Disposition':'inline','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex',
   'Cache-Control':'public, max-age=60'
  });
  res.end(req.method==='HEAD'?undefined:f.bytes);
  return true;
 }
 return {stage,serve};
}
module.exports={createMediaStore};
