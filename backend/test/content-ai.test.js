'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const path=require('node:path');
const server=path.resolve(__dirname,'..','demo-server.js');
const sleep=n=>new Promise(r=>setTimeout(r,n));
async function start(port,env){
 const child=spawn(process.execPath,[server],{env:{...process.env,
  PORT:String(port),ADMIN_PASSWORD:'',OPENAI_API_KEY:'',GEMINI_API_KEY:'',AI_PROVIDER:'',TIKTOK_CLIENT_ID:'',
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
 const {child,base}=await start(18966,{ADMIN_PASSWORD:password,OPENAI_API_KEY:key,AI_PROVIDER:'openai'});
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


const mock=path.resolve(__dirname,'gemini-fetch-mock.js');
test('Gemini gratuito é a opção padrão e responde JSON com legendas para cada rede',async()=>{
 const password='SenhaGeminiTesteApenasNoCI2026!';
 const {child,base}=await start(18967,{
  ADMIN_PASSWORD:password,GEMINI_API_KEY:'key-for-ci-only',
  NODE_OPTIONS:'--require '+mock,MOCK_GEMINI_MODE:'success'
 });
 try{
  const health=await call(base,'/api/health');
  assert.equal(health.data.aiConfigured,true);
  assert.equal(health.data.aiProvider,'gemini');
  assert.equal(health.data.aiModel,'gemini-3.5-flash-lite');
  assert.equal(health.data.demoMode,false);
  assert.equal(health.data.providerConfigured.instagram,false);
  assert.equal(JSON.stringify(health.data).includes('key-for-ci-only'),false);
  const unauthorized=await call(base,'/api/ai/captions',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
  assert.equal(unauthorized.status,401);
  const login=await call(base,'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})});
  assert.equal(login.status,200);
  const reqHeaders={'Content-Type':'application/json',Authorization:'Bearer '+login.data.session};
  const caption=await call(base,'/api/ai/captions',{method:'POST',headers:reqHeaders,
   body:JSON.stringify({title:'Perfume Árabe Oud',brief:'Notas amadeiradas.',tone:'premium',goal:'vender',channels:['tiktok','instagram-feed']})});
  assert.equal(caption.status,200);
  assert.equal(caption.data.provider,'gemini');
  assert.equal(caption.data.suggestions.length,2);
  assert.equal(caption.data.suggestions[0].channel,'tiktok');
  assert.equal(caption.data.suggestions[1].variants.length,2);
  assert.deepEqual(caption.data.hashtags,['#CDEImports','#Perfumaria']);
  assert.equal(caption.data.ideas.length,2);
 }finally{await stop(child);}
});
test('cota Gemini excedida apresenta mensagem e mantém o gerador local como alternativa',async()=>{
 const password='SenhaGeminiTesteSemCota2026!';
 const {child,base}=await start(18968,{
  ADMIN_PASSWORD:password,GEMINI_API_KEY:'key-for-ci-only',
  NODE_OPTIONS:'--require '+mock,MOCK_GEMINI_MODE:'quota'
 });
 try{
  const login=await call(base,'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})});
  const r=await call(base,'/api/ai/captions',{method:'POST',
   headers:{'Content-Type':'application/json',Authorization:'Bearer '+login.data.session},
   body:JSON.stringify({title:'Perfume para presente',brief:'',tone:'direto',goal:'apresentar',channels:['instagram-feed']})});
  assert.equal(r.status,429);
  assert.match(r.data.error,/cota gratuita do Gemini/i);
 }finally{await stop(child);}
});
test('chave OpenAI isolada não autoriza serviço pago sem opt-in explícito',async()=>{
 const {child,base}=await start(18969,{
  ADMIN_PASSWORD:'SenhaTesteEvitarCobranças2026!',OPENAI_API_KEY:'chave-antiga-ficticia'
 });
 try{
  const health=await call(base,'/api/health');
  assert.equal(health.data.aiConfigured,false);
  assert.equal(health.data.demoMode,true);
  assert.equal(health.data.aiProvider,null);
 }finally{await stop(child);}
});
