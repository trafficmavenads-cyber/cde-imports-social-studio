'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const path=require('node:path');
const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
const JPEG=Buffer.from([0xff,0xd8,0xff,0xe0,0x00,0x10,0x4a,0x46,0x49,0x46,0x00,0xff,0xd9]);
test('O editor envia JPEG temporário com sessão; Meta pode ler por URL pública e token nunca aparece',async()=>{
 const password='SenhaTesteImagemInstagram2026!';
 const port='18972';
 const child=spawn(process.execPath,[path.resolve(__dirname,'../demo-server.js')],{
  env:{...process.env,PORT:port,ADMIN_PASSWORD:password,GEMINI_API_KEY:'key-mock-only',
   INSTAGRAM_CLIENT_ID:'',INSTAGRAM_CLIENT_SECRET:'',TIKTOK_CLIENT_ID:'',TIKTOK_CLIENT_SECRET:''},stdio:'ignore'
 });
 const base='http://127.0.0.1:'+port;
 try{
  let started=false;
  for(let i=0;i<60;i++){
   try{const r=await fetch(base+'/api/health');if(r.ok){started=true;break;}}catch{}
   await sleep(90);
  }
  assert.equal(started,true);
  const upload=(body,headers={})=>fetch(base+'/api/instagram/media/upload',{
   method:'POST',headers:{'Content-Type':'image/jpeg',...headers},body
  });
  assert.equal((await upload(JPEG)).status,401);
  const wrong=await fetch(base+'/api/login',{method:'POST',
   headers:{'Content-Type':'application/json'},body:JSON.stringify({password})});
  const login=await wrong.json();
  assert.equal(wrong.status,200);
  const secret={Authorization:'Bearer '+login.session};
  assert.equal((await upload(Buffer.from('not-a-jpeg'),secret)).status,400);
  const staged=await upload(JPEG,secret);assert.equal(staged.status,201);
  const data=await staged.json();
  assert.match(data.mediaUrl,/^https:\/\/cde-imports-social-demo\.onrender\.com\/api\/instagram\/media\/[a-f0-9]{48}\.jpg$/);
  assert.equal(data.temporary,true);
  assert.equal(JSON.stringify(data).includes(login.session),false);
  const publicPath=new URL(data.mediaUrl).pathname;
  const grabbed=await fetch(base+publicPath);
  assert.equal(grabbed.status,200);
  assert.equal(grabbed.headers.get('content-type'),'image/jpeg');
  assert.deepEqual(Buffer.from(await grabbed.arrayBuffer()),JPEG);
  const videoBytes=Buffer.from([0x00,0x00,0x00,0x1c,0x66,0x74,0x79,0x70,0x69,0x73,0x6f,0x6d,0x00,0x00,0x00,0x00]);
  const stagedVideo=await fetch(base+'/api/instagram/media/upload',{
   method:'POST',headers:{'Content-Type':'video/mp4',...secret},body:videoBytes
  });
  assert.equal(stagedVideo.status,201);
  const videoData=await stagedVideo.json();
  assert.match(videoData.mediaUrl,/\.mp4$/);
  const videoPublic=await fetch(base+new URL(videoData.mediaUrl).pathname);
  assert.equal(videoPublic.status,200);
  assert.equal(videoPublic.headers.get('content-type'),'video/mp4');
  assert.deepEqual(Buffer.from(await videoPublic.arrayBuffer()),videoBytes);
  const wrongVideo=await fetch(base+'/api/instagram/media/upload',{
   method:'POST',headers:{'Content-Type':'video/mp4',...secret},body:JPEG
  });
  assert.equal(wrongVideo.status,400);
  const head=await fetch(base+publicPath,{method:'HEAD'});
  assert.equal(head.status,200);
  assert.equal(head.headers.get('content-length'),String(JPEG.length));
  assert.equal((await fetch(base+'/api/instagram/media/'+'a'.repeat(48)+'.jpg')).status,404);
  const denied=await fetch(base+'/api/instagram/media/upload',{method:'POST',
   headers:{'Content-Type':'image/jpeg','Origin':'https://attacker.test',...secret},body:JPEG});
  assert.equal(denied.status,403);
 }finally{
  if(child.exitCode===null){child.kill('SIGTERM');await new Promise(ok=>child.once('exit',ok));}
 }
});


test('Upload MP4 acima do antigo limite 24 MB usa streaming e suporta Range/HEAD sem carregar o vídeo em RAM',async()=>{
 const password='TesteStreamingRenderInstagram2026!';
 const port=18979;
 const child=spawn(process.execPath,[path.resolve(__dirname,'../demo-server.js')],{
  env:{...process.env,PORT:String(port),ADMIN_PASSWORD:password,GEMINI_API_KEY:'mock-key',
   INSTAGRAM_CLIENT_ID:'',INSTAGRAM_CLIENT_SECRET:'',TIKTOK_CLIENT_ID:'',TIKTOK_CLIENT_SECRET:''},
  stdio:'ignore'
 });
 const base='http://127.0.0.1:'+port;
 try{
  let ready=false;
  for(let i=0;i<70;i++){
   try{const r=await fetch(base+'/api/health');if(r.ok){ready=true;break;}}catch{}
   await sleep(85);
  }
  assert.equal(ready,true);
  const login=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({password})});
  assert.equal(login.status,200);
  const session=(await login.json()).session;
  const large=Buffer.alloc(26*1024*1024);
  large.write('ftyp',4,'ascii');
  const uploaded=await fetch(base+'/api/instagram/media/upload',{
   method:'POST',headers:{'Content-Type':'video/mp4',Authorization:'Bearer '+session},body:large
  });
  const data=await uploaded.json();
  assert.equal(uploaded.status,201,JSON.stringify(data));
  assert.equal(data.bytes,large.length);
  const link=new URL(data.mediaUrl);
  assert.match(link.pathname,/\.mp4$/);
  const head=await fetch(base+link.pathname,{method:'HEAD'});
  assert.equal(head.status,200);
  assert.equal(head.headers.get('content-length'),String(large.length));
  assert.equal(head.headers.get('accept-ranges'),'bytes');
  const partial=await fetch(base+link.pathname,{headers:{Range:'bytes=4-15'}});
  assert.equal(partial.status,206);
  assert.equal(partial.headers.get('content-range'),'bytes 4-15/'+large.length);
  assert.equal(partial.headers.get('content-length'),'12');
  assert.equal(Buffer.from(await partial.arrayBuffer()).subarray(0,4).toString('ascii'),'ftyp');
  const invalid=await fetch(base+link.pathname,{headers:{Range:'bytes=999999999-'}});
  assert.equal(invalid.status,416);
 }finally{
  if(child.exitCode===null){child.kill('SIGTERM');await new Promise(resolve=>child.once('exit',resolve));}
 }
});
