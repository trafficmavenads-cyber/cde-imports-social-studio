'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const path=require('node:path');
const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
const mocked=path.resolve(__dirname,'instagram-publish-fetch-mock.js');
test('Login Meta, consentimento e publicação Instagram via servidor, sem rede real',async()=>{
 const pwd='SenhaDeTesteSomenteInstagram2026!';
 const port=18970;
 const child=spawn(process.execPath,[path.resolve(__dirname,'../demo-server.js')],{
  env:{...process.env,PORT:String(port),NODE_OPTIONS:'--require '+mocked,
   ADMIN_PASSWORD:pwd,INSTAGRAM_CLIENT_ID:'app-test-only',INSTAGRAM_CLIENT_SECRET:'secret-test-only',
   INSTAGRAM_SCOPES:'instagram_business_basic',GEMINI_API_KEY:'',OPENAI_API_KEY:'',
   TIKTOK_CLIENT_ID:'',TIKTOK_CLIENT_SECRET:''},stdio:'ignore'});
 const base='http://127.0.0.1:'+port;
 const req=async(route,opts={})=>{
  const r=await fetch(base+route,{redirect:'manual',...opts});
  const t=await r.text();return {code:r.status,data:t?JSON.parse(t):{},location:r.headers.get('location')};
 };
 try{
  let up=false;
  for(let i=0;i<60;i++){
   try{const r=await fetch(base+'/api/health');if(r.ok){up=true;break;}}catch{}
   await sleep(90);
  }
  assert.equal(up,true);
  const health=await req('/api/health');
  assert.equal(health.data.providerConfigured.instagram,true);
  assert.match(health.data.instagramScopes,/instagram_business_content_publish/);
  assert.equal(JSON.stringify(health.data).includes('secret-test-only'),false);
  const login=await req('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:pwd})});
  assert.equal(login.code,200);
  const headers={Authorization:'Bearer '+login.data.session,'Content-Type':'application/json'};
  const unauthorized=await req('/api/instagram/publish/prepare',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
  assert.equal(unauthorized.code,401);
  const beforeConnection=await req('/api/instagram/publish/prepare',{method:'POST',headers,body:JSON.stringify({kind:'IMAGE',mediaUrl:'https://cdn.exemplo.com/p.jpg',caption:'Antes'})});
  assert.equal(beforeConnection.code,409);
  const oauth=await req('/api/oauth/start/instagram',{method:'POST',headers});
  assert.equal(oauth.code,200);
  const authorize=new URL(oauth.data.authorizationUrl);
  assert.match(authorize.searchParams.get('scope'),/instagram_business_content_publish/);
  const callback='/api/oauth/callback/instagram?state='+authorize.searchParams.get('state')+'&code=test-valid';
  const oauthResult=await fetch(base+callback,{redirect:'manual'});
  assert.equal(oauthResult.status,302);
  assert.equal(new URL(oauthResult.headers.get('location')).searchParams.get('oauth_result'),'linked');
  const accounts=await req('/api/accounts',{headers});
  assert.equal(accounts.data.accounts.find(x=>x.id==='instagram').connected,true);
  assert.equal(accounts.data.accounts.find(x=>x.id==='instagram').scopes,'instagram_business_basic,instagram_business_content_publish');
  const draft=await req('/api/instagram/publish/prepare',{method:'POST',headers,
   body:JSON.stringify({kind:'IMAGE',mediaUrl:'https://cdn.exemplo.com/p.jpg',caption:'Post com autorização confirmada'})});
  assert.equal(draft.code,200);
  assert.ok(draft.data.jobId);
  const check=await req('/api/instagram/publish/status',{method:'POST',headers,body:JSON.stringify({jobId:draft.data.jobId})});
  assert.equal(check.code,200);
  assert.equal(check.data.ready,true);
  const noConfirm=await req('/api/instagram/publish/confirm',{method:'POST',headers,body:JSON.stringify({jobId:draft.data.jobId})});
  assert.equal(noConfirm.code,400);
  const published=await req('/api/instagram/publish/confirm',{method:'POST',headers,
   body:JSON.stringify({jobId:draft.data.jobId,confirm:true})});
  assert.equal(published.code,200);
  assert.equal(published.data.mediaId,'18100000000000555');
  const duplicate=await req('/api/instagram/publish/confirm',{method:'POST',headers,
   body:JSON.stringify({jobId:draft.data.jobId,confirm:true})});
  assert.equal(duplicate.code,200);
  assert.equal(duplicate.data.mediaId,'18100000000000555');
 }finally{
  if(child.exitCode===null){child.kill('SIGTERM');await new Promise(ok=>child.once('exit',ok));}
 }
});
