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
const INSTAGRAM_CLIENT_ID=(process.env.INSTAGRAM_CLIENT_ID||'').trim();
const INSTAGRAM_CLIENT_SECRET=(process.env.INSTAGRAM_CLIENT_SECRET||'').trim();
const INSTAGRAM_SCOPES=(process.env.INSTAGRAM_SCOPES||'instagram_business_basic').trim();
const enabled=Boolean(CLIENT_ID&&CLIENT_SECRET&&ADMIN_PASSWORD.length>=16);
const instagramEnabled=Boolean(INSTAGRAM_CLIENT_ID&&INSTAGRAM_CLIENT_SECRET&&ADMIN_PASSWORD.length>=16);
const authEnabled=enabled||instagramEnabled;
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
const instagramCallback=API_BASE+'/api/oauth/callback/instagram';
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer'};
function corsFor(req){return req.headers.origin===FRONT_ORIGIN?{'Access-Control-Allow-Origin':FRONT_ORIGIN,'Vary':'Origin'}:{};}
function reply(req,res,code,body){res.writeHead(code,{...headers,...corsFor(req),'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(body));}
function redirect(res,result,network='tiktok'){
 const u=new URL(SITE_URL);
 u.searchParams.set('oauth_network',network);
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
function connectionFor(session,provider){
 return connections.get(session)?.[provider]||null;
}
function updateConnection(session,provider,data){
 const previous=connections.get(session)||{};
 if(data===null)delete previous[provider];else previous[provider]=data;
 if(Object.keys(previous).length)connections.set(session,previous);
 else connections.delete(session);
}
async function instagramJson(url,options={}){
 const r=await fetch(url,{...options,redirect:'error',signal:AbortSignal.timeout(15000),headers:{'Accept':'application/json',...(options.headers||{})}});
 const data=await r.json().catch(()=>({}));
 if(!r.ok||data.error)throw Error('A Meta recusou a autorização do Instagram.');
 return data;
}
function accountRows(key){
 return ['instagram','tiktok','pinterest','youtube'].map(id=>{
  if(id!=='tiktok'&&id!=='instagram')return {id,configured:false,connected:false,status:'not_connected'};
  const acc=connectionFor(key,id);
  return {id,configured:id==='tiktok'?enabled:instagramEnabled,connected:Boolean(acc),status:acc?(acc.expiresAt<Date.now()?'reconnect_required':'connected'):'not_connected',
   label:acc?.name||null,accountId:acc?.openId||null,connectedAt:acc?.connectedAt||null,
   expiresAt:acc?.expiresAt||null,scopes:acc?.scopes||(id==='tiktok'?SCOPES:INSTAGRAM_SCOPES)};
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
   ok:true,service:'CDE Imports Social Studio',version:'0.10.0',
   mode:authEnabled?'oauth-temporary':'demo',demoMode:!authEnabled,temporaryStorage:true,
   providerConfigured:{instagram:instagramEnabled,tiktok:enabled,pinterest:false,youtube:false},
   callbackUrl:callback,instagramCallbackUrl:instagramCallback,
   scopes:SCOPES,instagramScopes:INSTAGRAM_SCOPES,
   message:authEnabled?'Autorização temporária habilitada para as redes configuradas. Tokens são mantidos apenas na memória do Render Free.':'Render Free: configure credenciais de aplicativo e senha administrativa para habilitar o teste OAuth.',
   serverTime:new Date().toISOString()
  });
 }
 if(req.method==='GET'&&url==='/api/demo/ping')return reply(req,res,200,{ok:true,roundTrip:'ok',demoMode:!authEnabled});
 if(req.method==='GET'&&url==='/')return reply(req,res,200,{ok:true,service:'CDE Imports Social Studio OAuth',mode:authEnabled?'oauth-temporary':'demo',help:'/api/health'});
 if(!authEnabled)return reply(req,res,405,{error:'Servidor de demonstração. OAuth desativado até configurar credenciais privadas no Render.'});
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
  if(!tx||tx.provider!=='tiktok'||tx.expires<=Date.now()||!sessions.has(tx.session))return redirect(res,'invalid_state');
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
   updateConnection(tx.session,'tiktok',{
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
 const igPath='/api/oauth/callback/instagram';
 if(req.method==='GET'&&url===igPath){
  const state=path.searchParams.get('state')||'';
  const tx=states.get(state);states.delete(state);
  if(!tx||tx.provider!=='instagram'||tx.expires<=Date.now()||!sessions.has(tx.session))return redirect(res,'invalid_state','instagram');
  if(path.searchParams.has('error')||!path.searchParams.get('code'))return redirect(res,'denied','instagram');
  try{
   const short=await instagramJson('https://api.instagram.com/oauth/access_token',{
    method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({client_id:INSTAGRAM_CLIENT_ID,client_secret:INSTAGRAM_CLIENT_SECRET,grant_type:'authorization_code',redirect_uri:instagramCallback,code:path.searchParams.get('code')})
   });
   if(!short.access_token)throw Error('Token do Instagram ausente');
   const u=new URL('https://graph.instagram.com/me');
   u.searchParams.set('fields','id,username,account_type');
   const profile=await instagramJson(u.toString(),{headers:{Authorization:'Bearer '+short.access_token}});
   const id=String(profile.id||short.user_id||'');
   if(!id)throw Error('Identificação do Instagram ausente');
   updateConnection(tx.session,'instagram',{
    openId:id,name:profile.username?'@'+profile.username:'Conta Instagram',
    connectedAt:new Date().toISOString(),expiresAt:Date.now()+Math.max(1,Number(short.expires_in)||3600)*1000,
    scopes:INSTAGRAM_SCOPES,accessToken:short.access_token
   });
   return redirect(res,'linked','instagram');
  }catch(err){
   console.error('Falha na autorização Instagram:',err.name);
   return redirect(res,'failed','instagram');
  }
 }
 const session=sessionKey(req);
 if(!session)return reply(req,res,401,{error:'Sessão administrativa expirada. Entre novamente.'});
 if(req.method==='GET'&&url==='/api/accounts')return reply(req,res,200,{accounts:accountRows(session),temporaryStorage:true});
 if(req.method==='POST'&&url==='/api/oauth/start/tiktok'){
  if(!enabled)return reply(req,res,409,{error:'Configure TIKTOK_CLIENT_ID e TIKTOK_CLIENT_SECRET no servidor.'});
  if(states.size>100)return reply(req,res,429,{error:'Muitas autorizações pendentes.'});
  const state=fresh();states.set(state,{provider:'tiktok',session,expires:Date.now()+OAUTH_MS});
  const u=new URL('https://www.tiktok.com/v2/auth/authorize/');
  for(const [k,v] of Object.entries({client_key:CLIENT_ID,response_type:'code',scope:SCOPES,redirect_uri:callback,state}))u.searchParams.set(k,v);
  return reply(req,res,200,{authorizationUrl:u.href});
 }
 if(req.method==='POST'&&url==='/api/oauth/start/instagram'){
  if(!instagramEnabled)return reply(req,res,409,{error:'Configure INSTAGRAM_CLIENT_ID e INSTAGRAM_CLIENT_SECRET no servidor.'});
  if(states.size>100)return reply(req,res,429,{error:'Muitas autorizações pendentes.'});
  const state=fresh();states.set(state,{provider:'instagram',session,expires:Date.now()+OAUTH_MS});
  const u=new URL('https://www.instagram.com/oauth/authorize');
  for(const [k,v] of Object.entries({client_id:INSTAGRAM_CLIENT_ID,redirect_uri:instagramCallback,scope:INSTAGRAM_SCOPES,response_type:'code',state,force_reauth:'true'}))u.searchParams.set(k,v);
  return reply(req,res,200,{authorizationUrl:u.href});
 }
 if(req.method==='DELETE'&&url==='/api/accounts/instagram'){
  updateConnection(session,'instagram',null);
  return reply(req,res,200,{ok:true,notice:'Autorização do Instagram removida da memória do servidor de testes.'});
 }
 if(req.method==='DELETE'&&url==='/api/accounts/tiktok'){
  updateConnection(session,'tiktok',null);
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
}).listen(PORT,'0.0.0.0',()=>console.log('CDE Social OAuth '+(authEnabled?'temporário':'demo')+' na porta '+PORT));
