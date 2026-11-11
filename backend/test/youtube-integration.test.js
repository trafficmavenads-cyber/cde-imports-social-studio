'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const path=require('node:path');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
test('YouTube OAuth: conexão configurada, URL Google válida e publicação protegida por sessão',async()=>{
 const port=18992,password='SenhaYoutubeIntegration2026!!';
 const child=spawn(process.execPath,[path.resolve(__dirname,'../demo-server.js')],{
  env:{...process.env,PORT:String(port),ADMIN_PASSWORD:password,
   GOOGLE_CLIENT_ID:'client-id.apps.googleusercontent.com',GOOGLE_CLIENT_SECRET:'mock-secret',
   INSTAGRAM_CLIENT_ID:'',INSTAGRAM_CLIENT_SECRET:'',TIKTOK_CLIENT_ID:'',TIKTOK_CLIENT_SECRET:'',
   GEMINI_API_KEY:'',OPENAI_API_KEY:''},stdio:'ignore'});
 const base='http://127.0.0.1:'+port;
 try{
  let ready=false;
  for(let i=0;i<80;i++){try{const response=await fetch(base+'/api/health');if(response.ok){ready=true;break;}}catch{}await sleep(80);}
  assert.equal(ready,true);
  const health=await (await fetch(base+'/api/health')).json();
  assert.equal(health.providerConfigured.youtube,true);
  assert.match(health.youtubeCallbackUrl,/\/api\/oauth\/callback\/youtube$/);
  const anon=await fetch(base+'/api/youtube/shorts/publish',{method:'POST',
   headers:{'Content-Type':'application/json'},body:'{}'});
  assert.equal(anon.status,401);
  const login=await fetch(base+'/api/login',{method:'POST',
   headers:{'Content-Type':'application/json'},body:JSON.stringify({password})});
  assert.equal(login.status,200);
  const {session}=await login.json();
  const auth={Authorization:'Bearer '+session};
  const oauth=await fetch(base+'/api/oauth/start/youtube',{method:'POST',headers:auth});
  assert.equal(oauth.status,200);
  const u=new URL((await oauth.json()).authorizationUrl);
  assert.equal(u.origin,'https://accounts.google.com');
  assert.equal(u.pathname,'/o/oauth2/v2/auth');
  assert.equal(u.searchParams.get('response_type'),'code');
  assert.equal(u.searchParams.get('redirect_uri'),health.youtubeCallbackUrl);
  assert.ok(u.searchParams.get('scope').includes('youtube.upload'));
  assert.equal(u.searchParams.get('access_type'),'offline');
  assert.ok(u.searchParams.get('state'));
  const accounts=await (await fetch(base+'/api/accounts',{headers:auth})).json();
  const yt=accounts.accounts.find(x=>x.id==='youtube');
  assert.equal(yt.configured,true);assert.equal(yt.connected,false);
  assert.equal(JSON.stringify(accounts).includes('mock-secret'),false);
  const publish=await fetch(base+'/api/youtube/shorts/publish',{method:'POST',
   headers:{...auth,'Content-Type':'application/json'},
   body:JSON.stringify({mediaUrl:'https://bad.test/v.mp4',title:'Short',description:'Descrição'})});
  assert.equal(publish.status,409);
  const invalidCallback=await fetch(base+'/api/oauth/callback/youtube?state=invalid&code=malicious',{redirect:'manual'});
  assert.equal(invalidCallback.status,302);
  assert.match(invalidCallback.headers.get('location'),/oauth_result=invalid_state/);
 }finally{
  if(child.exitCode===null){child.kill('SIGTERM');await new Promise(r=>child.once('exit',r));}
 }
});
