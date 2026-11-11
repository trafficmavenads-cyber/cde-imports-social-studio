'use strict';
// Temporary, streaming media staging for Instagram's public-URL ingestion.
// Render Free has ephemeral filesystem. No access tokens or user credentials are stored.
// JPEG published to Instagram must still meet Meta's 8 MB file limit.
// Larger originals are reduced to JPEG in the browser before they arrive here.
const crypto=require('node:crypto');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

const MB=1024*1024;
const MAX_JPEG_BYTES=8*MB;
const MAX_MP4_BYTES=300*MB;
const MAX_TOTAL=650*MB;
const MAX_COUNT=60;
const MAX_ACTIVE=2;
const TTL_MS=90*60*1000;
const BASE=path.join(os.tmpdir(),'cde-instagram-media');

function createMediaStore({apiBase}){
 const files=new Map();
 let active=0,reserved=0;
 fs.mkdirSync(BASE,{recursive:true,mode:0o700});
 const occupied=()=>[...files.values()].reduce((sum,f)=>sum+f.size,0);
 async function clean(){
  const now=Date.now();
  const removals=[];
  for(const [key,file] of files){
   if(file.expires<=now){
    files.delete(key);
    removals.push(fs.promises.unlink(file.path).catch(()=>{}));
   }
  }
  await Promise.all(removals);
 }
 async function stage(req,session){
  await clean();
  const contentType=String(req.headers['content-type']||'').split(';')[0].trim().toLowerCase();
  if(!['image/jpeg','video/mp4'].includes(contentType))
   return {code:415,body:{error:'Envie JPEG ou MP4. Fotos PNG/WEBP são convertidas pelo editor.'}};
  const video=contentType==='video/mp4';
  const maxBytes=video?MAX_MP4_BYTES:MAX_JPEG_BYTES;
  const declared=Number(req.headers['content-length']||0);
  if(!Number.isFinite(declared)||declared<0||declared>maxBytes)
   return {code:413,body:{error:'Limite do upload: JPEG até 8 MB, vídeo MP4 até 300 MB.'}};
  const expected=declared>0?declared:maxBytes;
  if(active>=MAX_ACTIVE||files.size+active>=MAX_COUNT||occupied()+reserved+expected>MAX_TOTAL)
   return {code:429,body:{error:'Espaço temporário do Render ocupado. Termine os envios pendentes ou use URL HTTPS pública para vídeos grandes.'}};
  active++;reserved+=expected;
  const id=crypto.randomBytes(24).toString('hex');
  const extension=video?'.mp4':'.jpg',filePath=path.join(BASE,id+extension);
  let fh=null,size=0,signature=Buffer.alloc(12),read=0,lastBytes=Buffer.alloc(2);
  try{
   fh=await fs.promises.open(filePath,'wx',0o600);
   for await(const chunk of req){
    size+=chunk.length;
    if(size>maxBytes){
     const err=new Error('too-large');err.code='UPLOAD_TOO_LARGE';throw err;
    }
    const left=12-read;
    if(left>0){const len=Math.min(left,chunk.length);chunk.copy(signature,read,0,len);read+=len;}
    if(chunk.length>=2)lastBytes=Buffer.from(chunk.subarray(chunk.length-2));
    else if(chunk.length===1)lastBytes=Buffer.from([lastBytes[1],chunk[0]]);
    let offset=0;
    while(offset<chunk.length){
     const result=await fh.write(chunk,offset,chunk.length-offset,null);
     if(!result.bytesWritten)throw Error('Falha de escrita temporária.');
     offset+=result.bytesWritten;
    }
   }
   await fh.close();fh=null;
   if(size<12||read<12||
      (video?signature.toString('ascii',4,8)!=='ftyp':
       !(signature[0]===0xff&&signature[1]===0xd8&&lastBytes[0]===0xff&&lastBytes[1]===0xd9)))
    throw Error('invalid-signature');
   if(occupied()+size>MAX_TOTAL)throw Error('storage-full');
   const expires=Date.now()+TTL_MS;
   files.set(id,{path:filePath,size,isVideo:video,expires,owner:session});
   return {code:201,body:{
    mediaUrl:apiBase+'/api/instagram/media/'+id+extension,
    expiresAt:new Date(expires).toISOString(),
    temporary:true,bytes:size,
    note:'Arquivo temporário em disco do Render. Publicação imediata; desaparece se a instância reiniciar.'
   }};
  }catch(err){
   if(fh)await fh.close().catch(()=>{});
   await fs.promises.unlink(filePath).catch(()=>{});
   if(err.code==='UPLOAD_TOO_LARGE')
    return {code:413,body:{error:'Limite do upload: JPEG até 8 MB, vídeo MP4 até 300 MB.'}};
   if(err.message==='invalid-signature')
    return {code:400,body:{error:'Arquivo inválido: envie uma imagem JPEG ou vídeo MP4 real.'}};
   if(err.message==='storage-full'||err.code==='ENOSPC')
    return {code:507,body:{error:'Espaço temporário insuficiente. Use uma URL pública para este arquivo.'}};
   return {code:500,body:{error:'Falha temporária ao receber o arquivo. Tente novamente.'}};
  }finally{
   active--;reserved-=expected;
  }
 }
 async function release(session,urls){
  if(!Array.isArray(urls)||urls.length>60)return {code:400,body:{error:'Lista de mídias inválida.'}};
  let released=0,bytes=0;
  for(const url of urls){
   if(typeof url!=='string'||url.length>500)continue;
   let pathname='';
   try{const parsed=new URL(url);if(parsed.origin===new URL(apiBase).origin)pathname=parsed.pathname;}catch{}
   const match=/^\/api\/instagram\/media\/([a-f0-9]{48})\.(jpg|mp4)$/.exec(pathname);
   if(!match)continue;
   const file=files.get(match[1]);
   if(!file||file.owner!==session||file.isVideo!==(match[2]==='mp4'))continue;
   files.delete(match[1]);released++;bytes+=file.size;
   await fs.promises.unlink(file.path).catch(()=>{});
  }
  return {code:200,body:{released,bytes}};
 }
 function serve(req,res,pathname){
  const match=/^\/api\/instagram\/media\/([a-f0-9]{48})\.(jpg|mp4)$/.exec(pathname);
  if(!match)return false;
  if(req.method!=='GET'&&req.method!=='HEAD'){
   res.writeHead(405,{'Allow':'GET, HEAD','Cache-Control':'no-store'});res.end();return true;
  }
  const f=files.get(match[1]);
  if(!f||f.expires<=Date.now()||f.isVideo!==(match[2]==='mp4')||!fs.existsSync(f.path)){
   res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});
   res.end('Arquivo temporário ausente ou expirado.');return true;
  }
  const headers={
   'Content-Type':f.isVideo?'video/mp4':'image/jpeg',
   'Content-Disposition':'inline',
   'X-Content-Type-Options':'nosniff',
   'X-Robots-Tag':'noindex',
   'Accept-Ranges':'bytes',
   'Cache-Control':'public, max-age=60'
  };
  let start=0,end=f.size-1,status=200;
  if(req.headers.range){
   const matchRange=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
   if(!matchRange||(!matchRange[1]&&!matchRange[2])){
    res.writeHead(416,{'Content-Range':'bytes */'+f.size});res.end();return true;
   }
   if(!matchRange[1]){
    const suffix=Number(matchRange[2]);
    if(!suffix){res.writeHead(416,{'Content-Range':'bytes */'+f.size});res.end();return true;}
    start=Math.max(0,f.size-suffix);
   }else{
    start=Number(matchRange[1]);
    end=matchRange[2]?Math.min(f.size-1,Number(matchRange[2])):end;
   }
   if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=f.size){
    res.writeHead(416,{'Content-Range':'bytes */'+f.size});res.end();return true;
   }
   status=206;headers['Content-Range']='bytes '+start+'-'+end+'/'+f.size;
  }
  headers['Content-Length']=end-start+1;
  res.writeHead(status,headers);
  if(req.method==='HEAD'){res.end();return true;}
  const stream=fs.createReadStream(f.path,{start,end});
  stream.on('error',()=>res.destroy());
  stream.pipe(res);
  return true;
 }
 return {stage,serve,release};
}
module.exports={createMediaStore,MAX_JPEG_BYTES,MAX_MP4_BYTES};
