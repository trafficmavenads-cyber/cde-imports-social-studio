'use strict';
/**
 * CDE Imports Social Studio – OAuth connection gateway
 * Node.js 20+. Single-admin initial release. No social tokens in GitHub Pages.
 * HTTPS server, persistent DATA_DIR and provider OAuth credentials required.
 */
const http=require('node:http');
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const {URL,URLSearchParams}=require('node:url');
const {timingSafeEqual,randomBytes,createHash,createCipheriv,createDecipheriv}=crypto;

const PORT=Number(process.env.PORT||8080);
const SITE_URL=(process.env.SITE_URL||'https://trafficmavenads-cyber.github.io/cde-imports-social-studio/').trim();
const BACKEND_URL=(process.env.BACKEND_URL||'').trim().replace(/\/+$/,'');
const ADMIN_PASSWORD=process.env.ADMIN_PASSWORD||'';
const ENCRYPTION_KEY=/^[\da-f]{64}$/i.test(process.env.TOKEN_ENCRYPTION_KEY||'')?Buffer.from(process.env.TOKEN_ENCRYPTION_KEY,'hex'):null;
const DATA_DIR=process.env.DATA_DIR||'';
const DATA_FILE=DATA_DIR?path.join(DATA_DIR,'social-accounts.enc'):null;
const FRONT_ORIGIN=new URL(SITE_URL).origin;
const PROVIDERS=['instagram','tiktok','pinterest','youtube'];
const configured={};
const makeId=()=>randomBytes(32).toString('base64url');
const digest=x=>createHash('sha256').update(String(x)).digest('hex');
function mustConfigure(){
 if(!BACKEND_URL || !/^https:\/\//.test(BACKEND_URL) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BACKEND_URL))throw Error('BACKEND_URL deve ser HTTPS, ou localhost para teste.');
 if(!ADMIN_PASSWORD||ADMIN_PASSWORD.length<16)throw Error('ADMIN_PASSWORD deve ter 16 ou mais caracteres.');
 if(!ENCRYPTION_KEY)throw Error('TOKEN_ENCRYPTION_KEY deve ser hexadecimal com 64 caracteres (32 bytes).');
 if(!DATA_DIR)throw Error('DATA_DIR é obrigatório (disco persistente, fora da pasta pública).');
 if(!/^https:\/\//.test(SITE_URL)&&!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(SITE_URL))throw Error('SITE_URL inválido.');
}
function providerInfo(id){
 const prefix=id==='youtube'?'GOOGLE':id.toUpperCase();
 return {clientId:process.env[prefix+'_CLIENT_ID']||'',clientSecret:process.env[prefix+'_CLIENT_SECRET']||''};
}
for(const id of PROVIDERS){const p=providerInfo(id);configured[id]=Boolean(p.clientId&&p.clientSecret);}
function saveVault(vault){
 fs.mkdirSync(DATA_DIR,{recursive:true,mode:0o700});
 const iv=randomBytes(12);const cipher=createCipheriv('aes-256-gcm',ENCRYPTION_KEY,iv);
 const encrypted=Buffer.concat([cipher.update(JSON.stringify(vault)),cipher.final()]);
 const payload=JSON.stringify({version:1,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:encrypted.toString('base64')});
 const temp=DATA_FILE+'.tmp';
 fs.writeFileSync(temp,payload,{mode:0o600});fs.renameSync(temp,DATA_FILE);
}
function loadVault(){
 if(!fs.existsSync(DATA_FILE))return {};
 const s=JSON.parse(fs.readFileSync(DATA_FILE,'utf8'));
 const decipher=createDecipheriv('aes-256-gcm',ENCRYPTION_KEY,Buffer.from(s.iv,'base64'));
 decipher.setAuthTag(Buffer.from(s.tag,'base64'));
 return JSON.parse(Buffer.concat([decipher.update(Buffer.from(s.data,'base64')),decipher.final()]).toString('utf8'));
}
const sessions=new Map(),oauthStates=new Map(),failedLogins=new Map();
const SESSION_MS=6*60*60*1000,OAUTH_MS=10*60*1000;
function cleanup(){
 const now=Date.now();
 for(const [k,v] of sessions)if(v<now)sessions.delete(k);
 for(const [k,v] of oauthStates)if(v.expiresAt<now)oauthStates.delete(k);
 for(const [k,v] of failedLogins)if(v.until<now)failedLogins.delete(k);
}
function authenticate(req){
 const m=/^Bearer ([A-Za-z0-9_-]{20,})$/.exec(req.headers.authorization||'');
 if(!m)return false;
 const key=digest(m[1]),expires=sessions.get(key);
 return Boolean(expires&&expires>Date.now());
}
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY'};
function send(res,status,obj,req){
 res.writeHead(status,{...headers,'Content-Type':'application/json; charset=utf-8',...(req?.headers.origin===FRONT_ORIGIN?{'Access-Control-Allow-Origin':FRONT_ORIGIN,'Vary':'Origin'}:{})});
 res.end(JSON.stringify(obj));
}
function redirect(res,url){res.writeHead(302,{...headers,Location:url});res.end();}
function callbackToSite(provider,outcome){const u=new URL(SITE_URL);u.searchParams.set('oauth_network',provider);u.searchParams.set('oauth_result',outcome);u.hash='conexoes';return u.toString();}
async function jsonBody(req){
 let size=0,chunks=[];for await(const c of req){size+=c.length;if(size>12000)throw Error('Pedido muito grande');chunks.push(c);}
 return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');
}
async function parseRemote(url,opts={}){
 const response=await fetch(url,{...opts,signal:AbortSignal.timeout(15000),redirect:'error',headers:{'Accept':'application/json',...(opts.headers||{})}});
 const data=await response.json().catch(()=>({}));
 if(!response.ok||data.error&&typeof data.error==='string'||data.error?.code){
  const type=typeof data.error==='string'?data.error:data.error?.type||data.error?.message||'erro da plataforma';
  throw Error('Autorização rejeitada por '+new URL(url).hostname+': '+String(type).slice(0,80));
 }
 return data;
}
function providerCallback(id){return BACKEND_URL+'/api/oauth/callback/'+id;}
function getScopes(id){
 const defaults={
  instagram:'instagram_business_basic,instagram_business_content_publish',
  tiktok:'user.info.basic',
  pinterest:'user_accounts:read,boards:read,pins:read,pins:write',
  youtube:'https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/youtube.upload'
 };
 return process.env[id.toUpperCase()+'_SCOPES']||defaults[id];
}
function authorizeUrl(id,state){
 const {clientId}=providerInfo(id);
 let url,params={response_type:'code',state,redirect_uri:providerCallback(id)};
 if(id==='instagram'){url='https://www.instagram.com/oauth/authorize';params={...params,client_id:clientId,scope:getScopes(id),force_reauth:'true'};}
 if(id==='tiktok'){url='https://www.tiktok.com/v2/auth/authorize/';params={...params,client_key:clientId,scope:getScopes(id)};}
 if(id==='pinterest'){url='https://www.pinterest.com/oauth/';params={...params,client_id:clientId,scope:getScopes(id)};}
 if(id==='youtube'){url='https://accounts.google.com/o/oauth2/v2/auth';params={...params,client_id:clientId,scope:getScopes(id),access_type:'offline',prompt:'consent',include_granted_scopes:'true'};}
 const u=new URL(url);for(const [k,v] of Object.entries(params))u.searchParams.set(k,v);return u.toString();
}
async function redeemCode(id,code){
 const {clientId,clientSecret}=providerInfo(id),redirect_uri=providerCallback(id);
 let url,body,headers={'Content-Type':'application/x-www-form-urlencoded'};
 if(id==='instagram'){url='https://api.instagram.com/oauth/access_token';body={client_id:clientId,client_secret:clientSecret,grant_type:'authorization_code',code,redirect_uri};}
 if(id==='tiktok'){url='https://open.tiktokapis.com/v2/oauth/token/';body={client_key:clientId,client_secret:clientSecret,grant_type:'authorization_code',code,redirect_uri};}
 if(id==='pinterest'){url='https://api.pinterest.com/v5/oauth/token';body={grant_type:'authorization_code',code,redirect_uri,continuous_refresh:'true'};headers.Authorization='Basic '+Buffer.from(clientId+':'+clientSecret).toString('base64');}
 if(id==='youtube'){url='https://oauth2.googleapis.com/token';body={client_id:clientId,client_secret:clientSecret,grant_type:'authorization_code',code,redirect_uri};}
 let token=await parseRemote(url,{method:'POST',headers,body:new URLSearchParams(body)});
 if(!token.access_token)throw Error('A plataforma não devolveu um token de acesso.');
 if(id==='instagram'){
  // Exchange the short-lived token for a renewable long-lived token.
  const u=new URL('https://graph.instagram.com/access_token');
  u.searchParams.set('grant_type','ig_exchange_token');
  u.searchParams.set('client_secret',clientSecret);
  u.searchParams.set('access_token',token.access_token);
  const longer=await parseRemote(u.toString());if(longer.access_token)token={...token,...longer};
 }
 return token;
}
async function profileFor(id,token){
 const bearer={Authorization:'Bearer '+token.access_token};
 if(id==='instagram'){
  const u=new URL('https://graph.instagram.com/me');
  u.searchParams.set('fields','id,username,account_type');
  const p=await parseRemote(u.toString(),{headers:bearer});
  return {id:String(p.id||token.user_id||''),label:p.username?'@'+p.username:'Conta Instagram'};
 }
 if(id==='tiktok'){
  const p=await parseRemote('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,username',{headers:bearer});
  const u=p?.data?.user||{};return {id:String(u.open_id||token.open_id||''),label:u.display_name||u.username||'Conta TikTok'};
 }
 if(id==='pinterest'){
  const p=await parseRemote('https://api.pinterest.com/v5/user_account',{headers:bearer});
  return {id:String(p.id||''),label:p.username||'Conta Pinterest'};
 }
 const p=await parseRemote('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',{headers:bearer});
 const channel=p.items?.[0];
 if(!channel)throw Error('Não foi encontrado um canal do YouTube para esta conta Google.');
 return {id:String(channel.id),label:channel.snippet?.title||'Canal YouTube'};
}
async function refreshIfNecessary(id,account){
 const now=Date.now();
 if(!account.expiresAt||account.expiresAt>now+4*60*1000)return account;
 if(!account.token?.refresh_token&&id!=='instagram')return account;
 if(account.retryAfter&&account.retryAfter>now)return account;
 const {clientId,clientSecret}=providerInfo(id);
 let token;
 try{
  if(id==='instagram'){
   const u=new URL('https://graph.instagram.com/refresh_access_token');
   u.searchParams.set('grant_type','ig_refresh_token');
   u.searchParams.set('access_token',account.token.access_token);
   token=await parseRemote(u.toString());
  }else if(id==='youtube'){
   token=await parseRemote('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,refresh_token:account.token.refresh_token,grant_type:'refresh_token'})});
  }else if(id==='pinterest'){
   token=await parseRemote('https://api.pinterest.com/v5/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Authorization:'Basic '+Buffer.from(clientId+':'+clientSecret).toString('base64')},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:account.token.refresh_token})});
  }else{
   token=await parseRemote('https://open.tiktokapis.com/v2/oauth/token/',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',client_key:clientId,client_secret:clientSecret,refresh_token:account.token.refresh_token})});
  }
  if(!token.access_token)throw Error('Novo token ausente');
  account.token={...account.token,...token};
  account.expiresAt=token.expires_in?Date.now()+Math.max(0,Number(token.expires_in)-60)*1000:null;
  delete account.retryAfter;
 }catch{
  account.retryAfter=Date.now()+5*60*1000;
 }
 return account;
}
function safeAccounts(vault){
 return PROVIDERS.map(id=>{
  const a=vault[id];
  return {id,configured:configured[id],connected:Boolean(a?.token?.access_token),
   label:a?.profile?.label||null,accountId:a?.profile?.id||null,connectedAt:a?.connectedAt||null,
   expiresAt:a?.expiresAt||null,status:a?.token?.access_token?(a.expiresAt&&Date.now()>a.expiresAt?'reconnect_required':'connected'):'not_connected',
   scopes:a?.token?.scope||getScopes(id)};
 });
}
function validCredentials(){
 const real=Buffer.from(digest(ADMIN_PASSWORD),'hex');
 return candidate=>{const check=Buffer.from(digest(candidate),'hex');return timingSafeEqual(real,check);};
}
async function handler(req,res){
 cleanup();
 const origin=req.headers.origin;
 if(origin&&origin!==FRONT_ORIGIN){return send(res,403,{error:'Origem não autorizada'},req);}
 if(req.method==='OPTIONS'){
  res.writeHead(204,{...headers,'Access-Control-Allow-Origin':FRONT_ORIGIN,'Access-Control-Allow-Methods':'GET,POST,DELETE,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization','Access-Control-Max-Age':'300','Vary':'Origin'});return res.end();
 }
 const u=new URL(req.url,'http://localhost');const pn=u.pathname;
 if(req.method==='GET'&&pn==='/api/health')return send(res,200,{ok:true,version:'0.8.0',providerConfigured:configured,serverTime:new Date().toISOString()},req);
 if(req.method==='POST'&&pn==='/api/login'){
  const ip=req.socket.remoteAddress||'unknown',entry=failedLogins.get(ip)||{count:0,until:0};
  if(entry.count>=8&&entry.until>Date.now())return send(res,429,{error:'Muitas tentativas. Tente mais tarde.'},req);
  const data=await jsonBody(req);
  if(typeof data.password!=='string'||!validCredentials()(data.password)){
   const n=entry.count+1;failedLogins.set(ip,{count:n,until:Date.now()+15*60*1000});
   return send(res,401,{error:'Senha administrativa inválida.'},req);
  }
  failedLogins.delete(ip);
  const session=makeId();sessions.set(digest(session),Date.now()+SESSION_MS);
  return send(res,200,{session,expiresInSeconds:SESSION_MS/1000},req);
 }
 if(req.method==='GET'&&pn.startsWith('/api/oauth/callback/')){
  const id=pn.split('/').pop(),state=u.searchParams.get('state'),tx=oauthStates.get(state);
  if(!PROVIDERS.includes(id)||!state||!tx||tx.provider!==id||tx.expiresAt<Date.now())return redirect(res,callbackToSite(id,'invalid_state'));
  oauthStates.delete(state);
  if(u.searchParams.has('error')||!u.searchParams.get('code'))return redirect(res,callbackToSite(id,'denied'));
  try{
   const token=await redeemCode(id,u.searchParams.get('code'));
   const profile=await profileFor(id,token);
   if(!profile.id)throw Error('Identificação de conta indisponível.');
   const vault=loadVault();
   vault[id]={token,profile,connectedAt:new Date().toISOString(),expiresAt:token.expires_in?Date.now()+Math.max(0,Number(token.expires_in)-60)*1000:null};
   saveVault(vault);
   return redirect(res,callbackToSite(id,'linked'));
  }catch(e){return redirect(res,callbackToSite(id,'failed'));}
 }
 if(!authenticate(req))return send(res,401,{error:'Sessão expirada. Entre novamente no servidor.'},req);
 if(req.method==='POST'&&pn==='/api/logout'){
  const m=/^Bearer (.+)$/.exec(req.headers.authorization||'');if(m)sessions.delete(digest(m[1]));
  return send(res,200,{ok:true},req);
 }
 if(req.method==='GET'&&pn==='/api/accounts'){
  const vault=loadVault();
  for(const id of PROVIDERS)if(vault[id])vault[id]=await refreshIfNecessary(id,vault[id]);
  if(Object.keys(vault).length)saveVault(vault);
  return send(res,200,{accounts:safeAccounts(vault)},req);
 }
 const start=/^\/api\/oauth\/start\/(instagram|tiktok|pinterest|youtube)$/.exec(pn);
 if(req.method==='POST'&&start){
  const id=start[1];if(!configured[id])return send(res,409,{error:'Configure primeiro o aplicativo '+id+' no servidor.'},req);
  const state=makeId();oauthStates.set(state,{provider:id,expiresAt:Date.now()+OAUTH_MS});
  return send(res,200,{authorizationUrl:authorizeUrl(id,state)},req);
 }
 const disc=/^\/api\/accounts\/(instagram|tiktok|pinterest|youtube)$/.exec(pn);
 if(req.method==='DELETE'&&disc){
  const vault=loadVault(),id=disc[1];delete vault[id];saveVault(vault);
  return send(res,200,{ok:true,notice:'Token removido do servidor. Também é possível revogar o app nas configurações da rede social.'},req);
 }
 return send(res,404,{error:'Rota não encontrada'},req);
}
mustConfigure();
fs.mkdirSync(DATA_DIR,{recursive:true,mode:0o700});
loadVault(); // refuse startup with a wrong encryption key or corrupt vault
const server=http.createServer((req,res)=>Promise.resolve(handler(req,res)).catch(error=>{
 const code=/Pedido muito grande/.test(error.message)?413:500;
 console.error('Erro de servidor (sem dados sensíveis):',code,error.name);
 if(!res.headersSent)send(res,code,{error:'Não foi possível concluir a operação. Verifique a configuração do servidor.'},req);
 else res.end();
}));
server.listen(PORT,'0.0.0.0',()=>console.log('CDE Social Studio OAuth backend ativo na porta '+PORT));