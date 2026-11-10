'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {spawn}=require('node:child_process');
const sleep=n=>new Promise(r=>setTimeout(r,n));
const mock=path.resolve(__dirname,'instagram-unified-mock.js');
async function setup(port,multiple=false){
 const child=spawn(process.execPath,[path.resolve(__dirname,'../demo-server.js')],{
  env:{...process.env,PORT:String(port),ADMIN_PASSWORD:'TesteMetaUnifiedPassword2026!',
  INSTAGRAM_CLIENT_ID:'1838295347373815',INSTAGRAM_CLIENT_SECRET:'unified-secret-test-only',
  INSTAGRAM_CONFIG_ID:'2221851682014705',GEMINI_API_KEY:'',TIKTOK_CLIENT_ID:'',TIKTOK_CLIENT_SECRET:'',
  NODE_OPTIONS:'--require '+mock,MOCK_MULTIPLE_INSTAGRAM:multiple?'true':'false'},stdio:'ignore'
 });
 const base='http://127.0.0.1:'+port;
 for(let i=0;i<60;i++){try{const r=await fetch(base+'/api/health');if(r.ok)return {child,base};}catch{}await sleep(90);}
 child.kill();throw Error('Servidor mock não iniciou');
}
async function done(child){if(child.exitCode===null){child.kill('SIGTERM');await new Promise(r=>child.once('exit',r));}}
async function api(base,endpoint,opts={}){
 const r=await fetch(base+endpoint,{redirect:'manual',...opts});const body=await r.text();return {status:r.status,body:body?JSON.parse(body):{},location:r.headers.get('location')};
}
async function authenticate(base){
 const r=await api(base,'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:'TesteMetaUnifiedPassword2026!'})});
 assert.equal(r.status,200);
 return {Authorization:'Bearer '+r.body.session};
}
test('Unified Login uses facebook config_id and discovers authorized Instagram before publish',async()=>{
 const {child,base}=await setup(18975);
 try{
  const h=await api(base,'/api/health');
  assert.equal(h.body.instagramLoginMode,'unified');
  assert.equal(h.body.providerConfigured.instagram,true);
  const auth=await authenticate(base);
  const start=await api(base,'/api/oauth/start/instagram',{method:'POST',headers:auth});
  assert.equal(start.status,200);
  const url=new URL(start.body.authorizationUrl);
  assert.equal(url.origin,'https://www.facebook.com');
  assert.equal(url.searchParams.get('client_id'),'1838295347373815');
  assert.equal(url.searchParams.get('config_id'),'2221851682014705');
  assert.equal(url.searchParams.get('redirect_uri'),h.body.instagramCallbackUrl);
  assert.equal(url.searchParams.has('scope'),false);
  assert.equal(url.searchParams.get('response_type'),'code');
  assert.ok(url.searchParams.get('state'));
  const callback=await fetch(base+'/api/oauth/callback/instagram?state='+url.searchParams.get('state')+'&code=code-unified-test-only',{redirect:'manual'});
  assert.equal(callback.status,302);
  assert.equal(new URL(callback.headers.get('location')).searchParams.get('oauth_result'),'linked');
  const acct=await api(base,'/api/accounts',{headers:auth});
  const ig=acct.body.accounts.find(x=>x.id==='instagram');
  assert.equal(ig.connected,true);assert.equal(ig.loginMode,'unified');
  assert.equal(ig.accountId,'17841400000000123');assert.equal(ig.label,'@cdeimports');
  assert.equal(ig.grantSource,'verified');
  assert.ok(ig.scopes.includes('instagram_content_publish'));
  assert.ok(!JSON.stringify(acct.body).includes('unified-test-only-token'));
  const prepare=await api(base,'/api/instagram/publish/prepare',{
   method:'POST',headers:{...auth,'Content-Type':'application/json'},
   body:JSON.stringify({kind:'IMAGE',mediaUrl:'https://cdn.exemplo.com/photo.jpg',caption:'CDE Imports teste'})
  });
  assert.equal(prepare.status,200);
  const status=await api(base,'/api/instagram/publish/status',{
   method:'POST',headers:{...auth,'Content-Type':'application/json'},body:JSON.stringify({jobId:prepare.body.jobId})
  });
  assert.equal(status.status,200);assert.equal(status.body.ready,true);
  const published=await api(base,'/api/instagram/publish/confirm',{
   method:'POST',headers:{...auth,'Content-Type':'application/json'},body:JSON.stringify({jobId:prepare.body.jobId,confirm:true})
  });
  assert.equal(published.status,200);assert.equal(published.body.state,'published');assert.equal(published.body.mediaId,'18100000000000555');
 }finally{await done(child);}
});
test('Multiple assigned Instagram accounts are not selected automatically',async()=>{
 const {child,base}=await setup(18976,true);
 try{
  const auth=await authenticate(base);
  const start=await api(base,'/api/oauth/start/instagram',{method:'POST',headers:auth});
  const state=new URL(start.body.authorizationUrl).searchParams.get('state');
  const r=await fetch(base+'/api/oauth/callback/instagram?state='+state+'&code=code-unified-test-only',{redirect:'manual'});
  assert.equal(new URL(r.headers.get('location')).searchParams.get('oauth_result'),'multiple_accounts');
  const accounts=await api(base,'/api/accounts',{headers:auth});
  assert.equal(accounts.body.accounts.find(x=>x.id==='instagram').connected,false);
 }finally{await done(child);}
});
