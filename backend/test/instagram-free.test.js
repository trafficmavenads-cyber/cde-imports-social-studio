'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const path=require('node:path');
const server=path.resolve(__dirname,'..','demo-server.js');
const wait=t=>new Promise(resolve=>setTimeout(resolve,t));
async function launch(options){
 const port=String(options.PORT);
 const env={...process.env,ADMIN_PASSWORD:'',TIKTOK_CLIENT_ID:'',TIKTOK_CLIENT_SECRET:'',INSTAGRAM_CLIENT_ID:'',INSTAGRAM_CLIENT_SECRET:'',...options};
 const child=spawn(process.execPath,[server],{env,stdio:'ignore'});
 const base='http://127.0.0.1:'+port;
 for(let i=0;i<60;i++){
  if(child.exitCode!==null)break;
  try{const r=await fetch(base+'/api/health');if(r.ok)return {child,base};}catch{}
  await wait(100);
 }
 child.kill();
 throw new Error('Servidor de teste não iniciou');
}
async function halt(child){
 if(child.exitCode===null){child.kill('SIGTERM');await new Promise(ok=>child.once('exit',ok));}
}
async function req(base,path,opts={}){
 const r=await fetch(base+path,{redirect:'manual',...opts});
 const body=await r.text();
 return {status:r.status,data:body?JSON.parse(body):{},location:r.headers.get('location')};
}
test('OAuth Instagram isolado: permissões básicas, callback e estado seguro',async()=>{
 const pwd='SenhaFalsaParaTesteMeta2026!';
 const {base,child}=await launch({PORT:'18963',ADMIN_PASSWORD:pwd,INSTAGRAM_CLIENT_ID:'instagram_id_de_teste',INSTAGRAM_CLIENT_SECRET:'instagram_secret_de_teste'});
 try{
  const h=await req(base,'/api/health');
  assert.equal(h.data.ok,true);
  assert.equal(h.data.demoMode,false);
  assert.equal(h.data.providerConfigured.instagram,true);
  assert.equal(h.data.providerConfigured.tiktok,false);
  assert.equal(h.data.instagramCallbackUrl,'https://cde-imports-social-demo.onrender.com/api/oauth/callback/instagram');
  assert.equal(h.data.instagramScopes,'instagram_business_basic');
  assert.equal(JSON.stringify(h.data).includes('instagram_secret_de_teste'),false);
  assert.equal((await req(base,'/api/accounts')).status,401);
  const wrong=await req(base,'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:'errada'})});
  assert.equal(wrong.status,401);
  const login=await req(base,'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:pwd})});
  assert.equal(login.status,200);
  const auth={Authorization:'Bearer '+login.data.session};
  let accounts=await req(base,'/api/accounts',{headers:auth});
  assert.equal(accounts.status,200);
  assert.equal(accounts.data.accounts.find(a=>a.id==='instagram').connected,false);
  const start=await req(base,'/api/oauth/start/instagram',{method:'POST',headers:auth});
  assert.equal(start.status,200);
  const link=new URL(start.data.authorizationUrl);
  assert.equal(link.origin,'https://www.instagram.com');
  assert.equal(link.searchParams.get('client_id'),'instagram_id_de_teste');
  assert.equal(link.searchParams.get('redirect_uri'),h.data.instagramCallbackUrl);
  assert.equal(link.searchParams.get('scope'),'instagram_business_basic');
  assert.equal(link.searchParams.get('response_type'),'code');
  assert.equal(link.searchParams.has('state'),true);
  const noState=await fetch(base+'/api/oauth/callback/instagram?state=unknown&code=fake',{redirect:'manual'});
  assert.equal(noState.status,302);
  assert.equal(new URL(noState.headers.get('location')).searchParams.get('oauth_result'),'invalid_state');
  const denied=await fetch(base+'/api/oauth/callback/instagram?state='+link.searchParams.get('state')+'&error=access_denied',{redirect:'manual'});
  assert.equal(denied.status,302);
  assert.equal(new URL(denied.headers.get('location')).searchParams.get('oauth_result'),'denied');
  assert.equal(new URL(denied.headers.get('location')).searchParams.get('oauth_network'),'instagram');
  const expired=await req(base,'/api/accounts',{headers:auth});
  assert.equal(expired.data.accounts.find(a=>a.id==='instagram').connected,false);
  const disconnected=await req(base,'/api/accounts/instagram',{method:'DELETE',headers:auth});
  assert.equal(disconnected.status,200);
  assert.equal((await req(base,'/api/oauth/start/tiktok',{method:'POST',headers:auth})).status,404);
 }finally{await halt(child);}
});
test('OAuth Instagram e TikTok têm estados distintos e coexistem',async()=>{
 const pwd='SenhaFalsaParaTesteAmbasRedes2026!';
 const {base,child}=await launch({PORT:'18964',ADMIN_PASSWORD:pwd,INSTAGRAM_CLIENT_ID:'ig_id_teste',INSTAGRAM_CLIENT_SECRET:'ig_secret_teste',TIKTOK_CLIENT_ID:'tt_id_teste',TIKTOK_CLIENT_SECRET:'tt_secret_teste'});
 try{
  const h=await req(base,'/api/health');
  assert.equal(h.data.providerConfigured.instagram,true);
  assert.equal(h.data.providerConfigured.tiktok,true);
  const login=await req(base,'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:pwd})});
  const auth={Authorization:'Bearer '+login.data.session};
  const [i,t]=await Promise.all([
   req(base,'/api/oauth/start/instagram',{method:'POST',headers:auth}),
   req(base,'/api/oauth/start/tiktok',{method:'POST',headers:auth})
  ]);
  assert.equal(i.status,200);assert.equal(t.status,200);
  const iState=new URL(i.data.authorizationUrl).searchParams.get('state');
  const tState=new URL(t.data.authorizationUrl).searchParams.get('state');
  assert.notEqual(iState,tState);
  const switched=await fetch(base+'/api/oauth/callback/instagram?state='+tState+'&code=invalid',{redirect:'manual'});
  assert.equal(new URL(switched.headers.get('location')).searchParams.get('oauth_result'),'invalid_state');
  const denied=await fetch(base+'/api/oauth/callback/tiktok?state='+iState+'&error=denied',{redirect:'manual'});
  assert.equal(new URL(denied.headers.get('location')).searchParams.get('oauth_result'),'invalid_state');
 }finally{await halt(child);}
});
