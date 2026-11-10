'use strict';
/*
 * CDE Imports TikTok connection test server
 *
 * Default: FREE DEMO mode (GET-only health/ping, no login or tokens).
 * With TIKTOK_CLIENT_ID, TIKTOK_CLIENT_SECRET and ADMIN_PASSWORD
 * configured privately in Render: enables temporary, memory-only
 * TikTok Web Login Kit OAuth. No disk writes or unattended publishing.
 *
 * WARNING: Render Free sleeps after inactivity. Sessions and access
 * tokens vanish on sleep, restart or deploy. Not production storage.
 */
const http=require('node:http');
const crypto=require('node:crypto');
const PORT=Number(process.env.PORT||10000);
const SITE_URL='https://trafficmavenads-cyber.github.io/cde-imports-social-studio/';
const API_BASE='https://cde-imports-social-demo.onrender.com';
const FRONT_ORIGIN=new URL(SITE_URL).origin;
const CLIENT_ID=(process.env.TIKTOK_CLIENT_ID||'').trim();
const CLIENT_SECRET=(process.env.TIKTOK_CLIENT_SECRET||'').trim();
const ADMIN_PASSWORD=process.env.ADMIN_PASSWORD||'';
const SCOPES=(process.env.TIKTOK_SCOPES||'user.info.basic').trim();
const enabled=Boolean(CLIENT_ID&&CLIENT_SECRET&&ADMIN_PASSWORD.length>=16);
const SESSION_MS=6*60*60*1000;
const OAUTH_MS=10*60*1000;
const sessions=new Map();
const states=new Map();
const connections=new Map();
const attempts=new Map();
const secret=crypto.createHash('sha256').update(ADMIN_PASSWORD).digest();
const fresh=()=>crypto.randomBytes(32).toString('base64url');
const sha=x=>crypto.createHash('sha256').update(String(x)).digest('hex');
const callback=API_BASE+'/api/oauth/callback/tiktok';
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer'};
function corsFor(req){return req.headers.origin===FRONT_ORIGIN?{'Access-Control-Allow-Origin':FRONT_ORIGIN,'Vary':'Origin'}:{};}
function reply(req,res,code,body){res.writeHead(code,{...headers,...corsFor(req),'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(body));}
function redirect(res,result){
 const u=new URL(SITE_URL);
 u.searchParams.set('oauth_network','tiktok');
 u.searchParams.set('oauth_result',result);
 u.hash='conexoes';
 res.writeHead(302,{...headers,Location:u.href});res.end();
}
function clearExpired(){
 const now=Date.now();
 for(const [id,exp] of sessions)if(exp<now){sessions.delete(id);connections.delete(id);}
 for(const [key,tx] of states)if(tx.expires<now)states.delete(key);
 for(const [ip,data] of attempts)if(data.until<now)attempts.delete(ip);
}
function sessionKey(req){
 const auth=/^Bearer ([A-Za-z0-9_-]{30,})$/.exec(req.headers.authorization||'');
 const id=auth?sha(auth[1]):'';
 return id&&sessions.get(id)>Date.now()?id:null;
}
async function getBody(req){
 let n=0,buffers=[];
 for await(const chunk of req){
  n+=chunk.length;if(n>8192)throw new Error('Pedido excede o tamanho permitido.');
  buffers.push(chunk);
 }
 try{return JSON.parse(Buffer.concat(buffers).toString('utf8')||'{}');}
 catch{throw new Error('JSON inválido.');}
}
function passwordMatches(p){
 if(typeof p!=='string')return false;
 const test=crypto.createHash('sha256').update(p).digest();
 return crypto.timingSafeEqual(test,secret);
}
async function tiktokJson(url,options={}){
 const r=await fetch(url,{...options,redirect:'error',signal:AbortSignal.timeout(15000),headers:{'Accept':'application/json',...(options.headers||{})}});
 const data=await r.json().catch(()=>({}));
 if(!r.ok||data.error&&(typeof data.error==='string'||data.error.code&&data.error.code!=='ok')){
  throw new Error('O TikTok não autorizou esta solicitação.');
 }
 return data;
}
function accountRows(key){
 const acc=connections.get(key);
 return ['instagram','tiktok','pinterest','youtube'].map(id=>{
  if(id!=='tiktok')return {id,configured:false,connected:false,status:'not_connected'};
  return {id,configured:enabled,connected:Boolean(acc),status:acc?'connected':'not_connected',
   label:acc?.name||null,accountId:acc?.openId||null,connectedAt:acc?.connectedAt||null,
   expiresAt:acc?.expiresAt||null,scopes:acc?.scopes||SCOPES};
 });
}
async function handler(req,res){
 clearExpired();
 const path=new URL(req.url,'http://localhost'),url=path.pathname;
 if(req.headers.origin&&req.headers.origin!==FRONT_ORIGIN)return reply(req,res,403,{error:'Origem não autorizada.'});
 if(req.method==='OPTIONS'){
  res.writeHead(204,{...headers,...corsFor(req),'Access-Control-Allow-Methods':'GET,POST,DELETE,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization','Access-Control-Max-Age':'300'});return res.end();
 }
 if(req.method==='GET'&&url==='/api/health'){
  return reply(req,res,200,{
   ok:true,service:'CDE Imports Social Studio',version:'0.9.0',
   mode:enabled?'tiktok-temporary':'demo',demoMode:!enabled,temporaryStorage:true,
   providerConfigured:{instagram:false,tiktok:enabled,pinterest:false,youtube:false},
   callbackUrl:callback,scopes:SCOPES,
   message:enabled?'TikTok Login Kit habilitado para teste com tokens temporários.':'Render Free: configure Client Key, Client Secret e senha administrativa para testar o Login Kit.',
   serverTime:new Date().toISOString()
  });
 }
 if(req.method==='GET'&&url==='/api/demo/ping')return reply(req,res,200,{ok:true,roundTrip:'ok',demoMode:!enabled});
 if(req.method==='GET'&&url==='/')return reply(req,res,200,{ok:true,service:'CDE Imports TikTok Login Kit',mode:enabled?'tiktok-temporary':'demo',help:'/api/health'});
 if(!enabled)return reply(req,res,405,{error:'Servidor de demonstração. OAuth desativado até configurar credenciais privadas no Render.'});
 if(req.method==='POST'&&url==='/api/login'){
  const ip=req.socket.remoteAddress||'unknown';
  const prev=attempts.get(ip);
  if(prev&&prev.count>=8&&prev.until>Date.now())return reply(req,res,429,{error:'Muitas tentativas de login. Aguarde 15 minutos.'});
  const body=await getBody(req);
  if(!passwordMatches(body.password)){
   attempts.set(ip,{count:(prev?.until>Date.now()?prev.count:0)+1,until:Date.now()+15*60*1000});
   return reply(req,res,401,{error:'Senha administrativa inválida.'});
  }
  attempts.delete(ip);
  const credential=fresh(),key=sha(credential);
  sessions.set(key,Date.now()+SESSION_MS);
  return reply(req,res,200,{session:credential,expiresInSeconds:SESSION_MS/1000});
 }
 const codePath='/api/oauth/callback/tiktok';
 if(req.method==='GET'&&url===codePath){
  const state=path.searchParams.get('state')||'';
  const tx=states.get(state);states.delete(state);
  if(!tx||tx.expires<=Date.now()||!sessions.has(tx.session))return redirect(res,'invalid_state');
  if(path.searchParams.get('error')||!path.searchParams.get('code'))return redirect(res,'denied');
  try{
   const data=await tiktokJson('https://open.tiktokapis.com/v2/oauth/token/',{
    method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({client_key:CLIENT_ID,client_secret:CLIENT_SECRET,code:path.searchParams.get('code'),grant_type:'authorization_code',redirect_uri:callback})
   });
   if(!data.access_token||!data.open_id)throw new Error('Resposta de autorização incompleta.');
   const info=await tiktokJson('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url',{headers:{Authorization:'Bearer '+data.access_token}});
   const user=info.data?.user||{};
   if(!user.open_id||user.open_id!==data.open_id)throw new Error('Conta TikTok não confirmada.');
   connections.set(tx.session,{
    openId:user.open_id,name:user.display_name||'Conta TikTok',
    connectedAt:new Date().toISOString(),expiresAt:Date.now()+(Number(data.expires_in)||86400)*1000,
    scopes:data.scope||SCOPES,accessToken:data.access_token,refreshToken:data.refresh_token||null
   });
   return redirect(res,'linked');
  }catch(err){
   // Never log tokens, codes, cookies or secrets.
   console.error('Falha na autorização TikTok:',err.name);
   return redirect(res,'failed');
  }
 }
 const session=sessionKey(req);
 if(!session)return reply(req,res,401,{error:'Sessão administrativa expirada. Entre novamente.'});
 if(req.method==='GET'&&url==='/api/accounts')return reply(req,res,200,{accounts:accountRows(session),temporaryStorage:true});
 if(req.method==='POST'&&url==='/api/oauth/start/tiktok'){
  if(states.size>100)return reply(req,res,429,{error:'Muitas autorizações pendentes.'});
  const state=fresh();states.set(state,{session,expires:Date.now()+OAUTH_MS});
  const u=new URL('https://www.tiktok.com/v2/auth/authorize/');
  for(const [k,v] of Object.entries({client_key:CLIENT_ID,response_type:'code',scope:SCOPES,redirect_uri:callback,state}))u.searchParams.set(k,v);
  return reply(req,res,200,{authorizationUrl:u.href});
 }
 if(req.method==='DELETE'&&url==='/api/accounts/tiktok'){
  connections.delete(session);
  return reply(req,res,200,{ok:true,notice:'A autorização foi encerrada no ambiente de testes. Revogue também o aplicativo nas configurações do TikTok.'});
 }
 if(req.method==='POST'&&url==='/api/logout'){
  sessions.delete(session);connections.delete(session);
  for(const [key,tx] of states)if(tx.session===session)states.delete(key);
  return reply(req,res,200,{ok:true});
 }
 return reply(req,res,404,{error:'Rota indisponível.'});
}
http.createServer((req,res)=>{
 Promise.resolve(handler(req,res)).catch(err=>{
  // Return a generic message. Avoid revealing any provider credentials.
  console.error('Erro na API:',err.name);
  if(!res.headersSent)reply(req,res,500,{error:'Não foi possível concluir a solicitação.'});
  else res.end();
 });
}).listen(PORT,'0.0.0.0',()=>console.log('CDE TikTok '+(enabled?'OAuth temporário':'demo')+' na porta '+PORT));
