'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const path=require('node:path');
const location=path.resolve(__dirname,'..','demo-server.js');
const sleep=t=>new Promise(r=>setTimeout(r,t));
async function start(env){
 const port=String(env.PORT);
 const child=spawn(process.execPath,[location],{env:{...process.env,...env},stdio:['ignore','pipe','pipe']});
 child.stdout.resume();child.stderr.resume();
 const url='http://127.0.0.1:'+port;
 let ready=false;
 for(let i=0;i<60;i++){
  if(child.exitCode!==null)break;
  try{const r=await fetch(url+'/api/health');if(r.ok){ready=true;break;}}catch{}
  await sleep(100);
 }
 if(!ready){child.kill();throw Error('Servidor não iniciou em '+port);}
 return {child,url};
}
async function stop(child){if(child.exitCode===null){child.kill('SIGTERM');await new Promise(r=>child.once('exit',r));}}
const json=(url,opts)=>fetch(url,opts).then(async r=>({code:r.status,body:await r.json()}));
test('Modo demo é GET-only sem senhas, contas e OAuth',async()=>{
 const env={PORT:'18961',ADMIN_PASSWORD:'',TIKTOK_CLIENT_ID:'',TIKTOK_CLIENT_SECRET:''};
 const {child,url}=await start(env);
 try{
  const health=await json(url+'/api/health');assert.equal(health.code,200);assert.equal(health.body.demoMode,true);
  assert.equal(health.body.providerConfigured.tiktok,false);
  const login=await json(url+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"password":"x"}'});
  assert.equal(login.code,405);
  const origin=await json(url+'/api/health',{headers:{Origin:'https://malicious.example'}});
  assert.equal(origin.code,403);
 }finally{await stop(child);}
});
test('Modo TikTok inicia OAuth seguro e exige senha administrativa',async()=>{
 const env={PORT:'18962',ADMIN_PASSWORD:'SenhaDeTesteSomenteCI2026_NaoReal',TIKTOK_CLIENT_ID:'clientkey-test-ci',TIKTOK_CLIENT_SECRET:'clientsecret-test-ci'};
 const {child,url}=await start(env);
 try{
  const health=await json(url+'/api/health');
  assert.equal(health.body.demoMode,false);assert.equal(health.body.providerConfigured.tiktok,true);
  assert.equal(health.body.callbackUrl,'https://cde-imports-social-demo.onrender.com/api/oauth/callback/tiktok');
  assert.equal(JSON.stringify(health.body).includes('clientsecret-test-ci'),false);
  const unauth=await json(url+'/api/accounts');assert.equal(unauth.code,401);
  const wrong=await json(url+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:'invalid'})});
  assert.equal(wrong.code,401);
  const login=await json(url+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:env.ADMIN_PASSWORD})});
  assert.equal(login.code,200);
  const auth={Authorization:'Bearer '+login.body.session};
  const accounts=await json(url+'/api/accounts',{headers:auth});assert.equal(accounts.code,200);
  assert.equal(accounts.body.accounts.find(a=>a.id==='tiktok').connected,false);
  const startFlow=await json(url+'/api/oauth/start/tiktok',{method:'POST',headers:auth});
  assert.equal(startFlow.code,200);
  const address=new URL(startFlow.body.authorizationUrl);
  assert.equal(address.origin,'https://www.tiktok.com');
  assert.equal(address.searchParams.get('client_key'),env.TIKTOK_CLIENT_ID);
  assert.equal(address.searchParams.get('scope'),'user.info.basic');
  assert.equal(address.searchParams.get('redirect_uri'),health.body.callbackUrl);
  const wrongState=await fetch(url+'/api/oauth/callback/tiktok?state=wrong&code=malicious',{redirect:'manual'});
  assert.equal(wrongState.status,302);
  assert.equal(new URL(wrongState.headers.get('location')).searchParams.get('oauth_result'),'invalid_state');
  const denied=await fetch(url+'/api/oauth/callback/tiktok?state='+address.searchParams.get('state')+'&error=access_denied',{redirect:'manual'});
  assert.equal(denied.status,302);
  assert.equal(new URL(denied.headers.get('location')).searchParams.get('oauth_result'),'denied');
  const disconnected=await json(url+'/api/accounts/tiktok',{method:'DELETE',headers:auth});
  assert.equal(disconnected.code,200);
  const logout=await json(url+'/api/logout',{method:'POST',headers:auth});assert.equal(logout.code,200);
  const after=await json(url+'/api/accounts',{headers:auth});assert.equal(after.code,401);
 }finally{await stop(child);}
});
