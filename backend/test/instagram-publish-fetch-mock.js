'use strict';
/* Intercepts official Instagram URLs only in the CI server child process. No live Meta calls. */
const original=globalThis.fetch;
globalThis.fetch=async(input,options={})=>{
 const u=String(input);
 const json=data=>new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
 if(u==='https://api.instagram.com/oauth/access_token'){
  return json({access_token:'access-only-in-test',user_id:'17841400000000123',
   permissions:['instagram_business_basic','instagram_business_content_publish'],expires_in:3600});
 }
 if(u.startsWith('https://graph.instagram.com/access_token?')){
  const req=new URL(u);
  if(req.searchParams.get('grant_type')!=='ig_exchange_token'||!req.searchParams.get('client_secret'))
   throw Error('Long-lived token exchange parameters missing');
  return json({access_token:'long-token-test-only',expires_in:5184000,token_type:'bearer'});
 }
 if(u.startsWith('https://graph.instagram.com/me?')){
  return json({id:'17841400000000123',username:'cdeimports.test',account_type:'BUSINESS'});
 }
 if(u==='https://graph.instagram.com/v26.0/17841400000000123/media'){
  if(options.method!=='POST'||!String(options.body).includes('image_url='))throw Error('Missing media parameters');
  if(options.headers?.Authorization!=='Bearer long-token-test-only')throw Error('Invalid bearer');
  return json({id:'17900000000000111'});
 }
 if(u==='https://graph.instagram.com/v26.0/17900000000000111?fields=status_code'){
  return json({status_code:'FINISHED'});
 }
 if(u==='https://graph.instagram.com/v26.0/17841400000000123/media_publish'){
  if(options.method!=='POST'||!String(options.body).includes('creation_id=17900000000000111'))throw Error('Missing creation_id');
  return json({id:'18100000000000555'});
 }
 return original(input,options);
};
