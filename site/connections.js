(() => {
'use strict';
const providers=[
 {id:'instagram',title:'Instagram',icon:'◎',desc:'Conta profissional Meta • login unificado ou direto'},
 {id:'tiktok',title:'TikTok',icon:'♪',desc:'Login Kit • escopos aprovados'},
 {id:'pinterest',title:'Pinterest',icon:'Ⓟ',desc:'Pinterest API • criação de Pins'},
 {id:'youtube',title:'YouTube',icon:'▶',desc:'Conta Google • canal do YouTube'}
];
const $=id=>document.getElementById(id);
const TIKTOK_CALLBACK='https://cde-imports-social-demo.onrender.com/api/oauth/callback/tiktok';
const INSTAGRAM_CALLBACK='https://cde-imports-social-demo.onrender.com/api/oauth/callback/instagram';
const SERVER_KEY='cde-social-api-base-v1',SESSION_KEY='cde-social-admin-session-v1',DEMO_URL='https://cde-imports-social-demo.onrender.com';
let api='',session=sessionStorage.getItem(SESSION_KEY)||'',accounts=[],health=null,busy=false;
function show(message,error=false){const m=$('api-message');m.textContent=message;m.className='api-message '+(error?'error':'');}
function parseServer(s){
 try{
  const u=new URL(s.trim());
  if(u.protocol!=='https:' && !(u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname)))return null;
  if(u.username||u.password||u.search||u.hash)return null;
  return u.origin;
 }catch{return null;}
}
function status(text,type='muted'){$('api-health').textContent=text;$('api-health').className='pill '+type;}
function setBusy(flag){busy=flag;for(const id of ['api-save','api-test','api-login','api-logout'])$(id).disabled=flag;render();}
async function request(path,options={}){
 if(!api)throw Error('Configure primeiro a URL HTTPS do servidor.');
 const r=await fetch(api+path,{...options,mode:'cors',cache:'no-store',headers:{
  ...(options.body?{'Content-Type':'application/json'}:{}),
  ...(session?{'Authorization':'Bearer '+session}:{}),
  ...(options.headers||{})
 }});
 const data=await r.json().catch(()=>({}));
 if(r.status===401&&path!=='/api/login'){session='';sessionStorage.removeItem(SESSION_KEY);}
 if(!r.ok)throw Error(String(data.error||'Erro '+r.status).slice(0,220));
 return data;
}
function el(tag,cls,text){
 const n=document.createElement(tag);if(cls)n.className=cls;
 if(text!==undefined)n.textContent=text;return n;
}
function render(){
 const demo=health?.demoMode===true;
 const cfg=$('tiktok-config-status');
 if(cfg)cfg.textContent=demo?'Faltam as credenciais privadas no Render':health?.providerConfigured?.tiktok?'Login TikTok disponível para teste temporário':'Aguardando servidor';
 const igCfg=$('instagram-config-status');
 if(igCfg){const account=accounts.find(x=>x.id==='instagram');const permitted=String(account?.scopes||'').split(/[,\s]+/).includes(health?.instagramLoginMode==='unified'?'instagram_content_publish':'instagram_business_content_publish');const tentative=health?.instagramLoginMode==='unified'&&account?.connected&&account?.grantSource!=='verified';igCfg.textContent=demo?'Configure credenciais Meta no Render':!health?.providerConfigured?.instagram?'Aguardando credenciais Instagram':account?.connected&&permitted&&account.status==='connected'?'Instagram autorizado para publicar':tentative?'Conta conectada; a Meta confirmará permissão ao publicar':account?.connected?'Conta conectada; permissão de publicação pendente':'Meta configurada; conecte seu Instagram';}
 $('api-login').hidden=demo||Boolean(session);
 $('api-password-wrap').hidden=demo||Boolean(session);
 $('api-logout').hidden=demo||!session;
 $('api-session').textContent=demo?'Ambiente de demonstração gratuito: não insira senha, token ou dados pessoais.':session?'Sessão administrativa ativa neste navegador.':'Entre no servidor para conectar suas contas.';

 const grid=$('account-grid');grid.replaceChildren();
 for(const p of providers){
  const a=accounts.find(z=>z.id===p.id);
  const ready=Boolean(health?.providerConfigured?.[p.id]);
  const connected=Boolean(a?.connected);
  const box=el('div','social-account');
  const top=el('div','account-title');
  top.append(el('span','account-icon',p.icon),el('strong','',p.title));
  box.append(top,el('small','account-desc',p.desc));
  const label=el('div','account-status');
  if(!api)label.textContent='Servidor não configurado';
  else if(!health)label.textContent='Servidor não verificado';
  else if(health?.demoMode)label.textContent='Apenas demonstração: autenticação real indisponível';
  else if(!ready)label.textContent='Aplicativo OAuth não configurado';
  else if(!session)label.textContent='Entre no servidor para ver a conta';
  else if(!connected)label.textContent='Conta não conectada';
  else label.textContent=a.status==='reconnect_required'?'Autorização expirada — reconectar':'Conectado: '+(a.label||p.title);
  if(connected&&a.status!=='reconnect_required')label.classList.add('linked');
  if(connected&&a.status==='reconnect_required')label.classList.add('needs-attention');
  box.append(label);
  if(connected&&a.connectedAt)box.append(el('small','account-updated','Autorizado em '+new Date(a.connectedAt).toLocaleDateString('pt-BR')));
  const row=el('div','account-buttons');
  const connect=el('button','primary',connected?'Reconectar':'Conectar '+p.title);
  connect.type='button';connect.disabled=busy||!api||!ready||!session;
  connect.addEventListener('click',()=>startOAuth(p.id));row.append(connect);
  if(connected){
   const remove=el('button','secondary','Desconectar');remove.type='button';remove.disabled=busy;
   remove.addEventListener('click',()=>disconnect(p));row.append(remove);
  }
  box.append(row);grid.append(box);
 }
 const whatsapp=el('div','social-account');
 whatsapp.append(el('div','account-title','◉  WhatsApp Grupo / Status'));
 whatsapp.append(el('small','account-desc','Compartilhamento assistido — não há login oficial de publicação automática em grupos e Status neste painel.'));
 const p=el('p','account-status','Sem integração automática de publicação');
 whatsapp.append(p);grid.append(whatsapp);
 window.dispatchEvent(new Event('cde:connections-change'));
}
async function check(){
 const val=parseServer($('api-url').value);if(!val){status('Servidor não configurado','amber');show('Insira uma URL HTTPS válida do backend, sem caminhos adicionais.',true);return;}
 api=val;
 try{
  status('Verificando...');health=await request('/api/health');
  if(!health.ok)throw Error('Servidor não respondeu corretamente.');
  status(health.demoMode?'Modo demo • gratuito':health.temporaryStorage?'Redes sociais • teste temporário':'Servidor online',health.demoMode?'amber':'connected');
  if(health.demoMode){session='';sessionStorage.removeItem(SESSION_KEY);accounts=[];show('✅ Conexão de teste funcionando! Este servidor gratuito não recebe senhas, não autentica redes e não realiza publicações.');}
  else if(session){
   try{const data=await request('/api/accounts');accounts=data.accounts||[];show('Servidor conectado. Contas verificadas.');}
   catch(e){accounts=[];show(e.message,true);}
  }else{accounts=[];show('Servidor disponível. Entre com a senha administrativa para autorizar contas.');}
 }catch(e){health=null;accounts=[];status('Servidor indisponível','amber');show('Não foi possível acessar o servidor. Verifique a hospedagem e o endereço HTTPS.',true);}
 render();
}
async function login(){
 const pwd=$('api-password').value;
 if(!pwd){show('Informe a senha administrativa configurada na hospedagem.',true);return;}
 setBusy(true);
 try{
  const url=parseServer($('api-url').value);
  if(!url)throw Error('Configure uma URL HTTPS válida.');
  api=url;
  const data=await request('/api/login',{method:'POST',body:JSON.stringify({password:pwd})});
  $('api-password').value='';session=data.session;sessionStorage.setItem(SESSION_KEY,session);
  await check();
 }catch(e){show(e.message,true);}finally{setBusy(false);}
}
async function logout(){
 setBusy(true);
 try{if(session)await request('/api/logout',{method:'POST'});}catch{}
 session='';sessionStorage.removeItem(SESSION_KEY);accounts=[];setBusy(false);render();show('Sessão encerrada.');
}
async function startOAuth(id){
 setBusy(true);
 try{
  const r=await request('/api/oauth/start/'+encodeURIComponent(id),{method:'POST'});
  const u=new URL(r.authorizationUrl);
  if(!['www.instagram.com','www.tiktok.com','www.pinterest.com','accounts.google.com'].includes(u.hostname)||u.protocol!=='https:')throw Error('A rede social devolveu um destino inválido.');
  window.location.assign(u.href);
 }catch(e){show(e.message,true);setBusy(false);}
}
async function disconnect(p){
 if(!confirm('Desconectar '+p.title+' do CDE Imports Social Studio?'))return;
 setBusy(true);
 try{await request('/api/accounts/'+p.id,{method:'DELETE'});await check();show(p.title+' desconectado do servidor. Você também pode revogar o aplicativo nas configurações da rede social.');}
 catch(e){show(e.message,true);}finally{setBusy(false);}
}
$('api-save').addEventListener('click',async()=>{
 const s=parseServer($('api-url').value);if(!s){show('Informe um endereço HTTPS válido, por exemplo https://seu-servidor.exemplo.com',true);return;}
 const previous=localStorage.getItem(SERVER_KEY);
 if(previous!==s){session='';sessionStorage.removeItem(SESSION_KEY);}
 localStorage.setItem(SERVER_KEY,s);api=s;await check();
});
$('api-test').addEventListener('click',check);
$('copy-tiktok-callback')?.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(TIKTOK_CALLBACK);show('URL de retorno copiada. Cole no Login Kit do TikTok Developers.');}catch{show('Copie a URL exibida no guia acima.',true);}});
$('copy-instagram-callback')?.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(INSTAGRAM_CALLBACK);show('URL do Instagram copiada. Cole no campo OAuth redirect URI da Meta.');}catch{show('Selecione e copie a URL exibida no guia acima.',true);}});
$('api-login').addEventListener('click',login);
$('api-password').addEventListener('keydown',e=>{if(e.key==='Enter')login();});
$('api-logout').addEventListener('click',logout);
const saved=localStorage.getItem(SERVER_KEY)||DEMO_URL;$('api-url').value=saved;
if(saved){api=parseServer(saved)||'';check();}else{api=DEMO_URL;check();}
const params=new URLSearchParams(location.search);
if(params.has('oauth_network')){
 const provider=params.get('oauth_network'),result=params.get('oauth_result');
 const label=providers.find(p=>p.id===provider)?.title||'Rede';
 if(result==='linked')show('Autorização retornou do '+label+'. Verifique abaixo se a conta aparece conectada.');
 else show('Não foi possível concluir a autorização do '+label+'. Revise as permissões e tente novamente.',true);
 params.delete('oauth_network');params.delete('oauth_result');
 history.replaceState(null,'',location.pathname+(params.size?'?'+params.toString():'')+location.hash);
}
window.CDEInstagramPublisher={
 status:()=>{
  const account=accounts.find(x=>x.id==='instagram');
  const scopes=String(account?.scopes||'').split(/[,\s]+/);
  const unified=health?.instagramLoginMode==='unified',publishPermission=unified?'instagram_content_publish':'instagram_business_content_publish';
  return {configured:Boolean(health?.providerConfigured?.instagram),
   authenticated:Boolean(session),connected:Boolean(account?.connected),
   ready:Boolean(session&&account?.connected&&account.status==='connected'&&(scopes.includes(publishPermission)||(unified&&account?.grantSource!=='verified'))),
   label:account?.label||null,scopes:account?.scopes||'',requestedScopes:health?.instagramScopes||''};
 },
 uploadImage:async blob=>{
  if(!session||!api)throw Error('Entre com a senha administrativa antes de carregar fotos.');
  if(!blob||blob.type!=='image/jpeg')throw Error('Envie apenas uma imagem JPEG.');
  const r=await fetch(api+'/api/instagram/media/upload',{
   method:'POST',mode:'cors',cache:'no-store',
   headers:{Authorization:'Bearer '+session,'Content-Type':'image/jpeg'},body:blob
  });
  const data=await r.json().catch(()=>({}));
  if(!r.ok)throw Error(String(data.error||'Não foi possível preparar a imagem.').slice(0,220));
  return data;
 },
 prepare:async ({kind,mediaUrl,caption})=>request('/api/instagram/publish/prepare',{method:'POST',body:JSON.stringify({kind,mediaUrl,caption})}),
 checkStatus:async jobId=>request('/api/instagram/publish/status',{method:'POST',body:JSON.stringify({jobId})}),
 confirm:async jobId=>request('/api/instagram/publish/confirm',{method:'POST',body:JSON.stringify({jobId,confirm:true})}),
 refreshAccounts:async ()=>{if(!session)return null;const data=await request('/api/accounts');accounts=data.accounts||[];render();return data;}
};
window.CDEAIBackend={
 status:()=>({configured:Boolean(health?.aiConfigured),loggedIn:Boolean(session),available:Boolean(health?.aiConfigured&&session),provider:health?.aiProvider||null}),
 generate:async input=>{
  if(!health?.aiConfigured||!session)throw Error('IA online indisponível. Entre no servidor ou use sugestões gratuitas.');
  return request('/api/ai/captions',{method:'POST',body:JSON.stringify(input)});
 }
};
})();