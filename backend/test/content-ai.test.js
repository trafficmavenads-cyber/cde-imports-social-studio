'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const path=require('node:path');
const server=path.resolve(__dirname,'..','demo-server.js');
const sleep=n=>new Promise(r=>setTimeout(r,n));
async function start(port,env){
 const child=spawn(process.execPath,[server],{env:{...process.env,
  PORT:String(port),ADMIN_PASSWORD:'',OPENAI_API_KEY:'',TIKTOK_CLIENT_ID:'',
  TIKTOK_CLIENT_SECRET:'',INSTAGRAM_CLIENT_ID:'',INSTAGRAM_CLIENT_SECRET:'',...env},stdio:'ignore'});
 const base='http://127.0.0.1:'+port;
 for(let i=0;i<70;i++){
  if(child.exitCode!==null)break;
  try{const r=await fetch(base+'/api/health');if(r.ok)return {child,base};}catch{}
  await sleep(100);
 }
 child.kill();throw Error('Servidor não inicializou');
}
async function stop(child){if(child.exitCode===null){child.kill('SIGTERM');await new Promise(done=>child.once('exit',done));}}
async function call(base,route,opts={}){
 const r=await fetch(base+route,opts);return {status:r.status,data:await r.json()};
}
test('sem chave de IA mantém modo gratuito sem expor endpoint público',async()=>{
 const {child,base}=await start(18965,{});
 try{
  const health=await call(base,'/api/health');
  assert.equal(health.data.aiConfigured,false);
  assert.equal(health.data.demoMode,true);
  assert.equal(health.data.aiEndpoint,'/api/ai/captions');
  const r=await call(base,'/api/ai/captions',{method:'POST'});
  assert.equal(r.status,405);
 }finally{await stop(child);}
});
test('IA configurada exige senha e valida textos antes de fazer chamada externa',async()=>{
 const password='SenhaTesteLocalArtificial2026!';
 const key='sk-test-falso-nao-enviar-para-api';
 const {child,base}=await start(18966,{ADMIN_PASSWORD:password,OPENAI_API_KEY:key});
 try{
  const health=await call(base,'/api/health');
  assert.equal(health.status,200);
  assert.equal(health.data.aiConfigured,true);
  assert.equal(health.data.demoMode,false);
  assert.equal(health.data.providerConfigured.instagram,false);
  assert.equal(health.data.providerConfigured.tiktok,false);
  assert.equal(JSON.stringify(health.data).includes(key),false);
  const denied=await call(base,'/api/ai/captions',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
  assert.equal(denied.status,401);
  const wrong=await call(base,'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:'wrong'})});
  assert.equal(wrong.status,401);
  const login=await call(base,'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})});
  assert.equal(login.status,200);
  const headers={Authorization:'Bearer '+login.data.session,'Content-Type':'application/json'};
  const invalid=await call(base,'/api/ai/captions',{method:'POST',headers,body:JSON.stringify({title:'x',brief:'',tone:'premium',goal:'vender',channels:['tiktok']})});
  assert.equal(invalid.status,400);
  const dup=await call(base,'/api/ai/captions',{method:'POST',headers,body:JSON.stringify({title:'Perfume',brief:'',tone:'premium',goal:'vender',channels:['tiktok','tiktok']})});
  assert.equal(dup.status,400);
  const forbidden=await call(base,'/api/ai/captions',{method:'POST',headers:{...headers,Origin:'https://evil.example'},body:'{}'});
  assert.equal(forbidden.status,403);
 }finally{await stop(child);}
});
