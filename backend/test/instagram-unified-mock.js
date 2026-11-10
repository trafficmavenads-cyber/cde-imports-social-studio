'use strict';
const original=globalThis.fetch;
const respond=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
globalThis.fetch=async(input,options={})=>{
 const url=String(input);
 if(!url.startsWith('https://graph.facebook.com/'))return original(input,options);
 const u=new URL(url);
 const p=u.pathname;
 if(p.endsWith('/oauth/access_token')){
  if(u.searchParams.get('client_id')!=='1838295347373815'||
     u.searchParams.get('client_secret')!=='unified-secret-test-only'||
     u.searchParams.get('code')!=='code-unified-test-only')
   return respond({error:{message:'Wrong exchange params'}},400);
  return respond({access_token:'unified-test-only-token'});
 }
 if(options.headers?.Authorization!=='Bearer unified-test-only-token')
  return respond({error:{message:'Invalid bearer'}},401);
 if(p.endsWith('/me/assigned_instagram_accounts')){
  const rows=process.env.MOCK_MULTIPLE_INSTAGRAM==='true'?
   [{id:'17841400000000123',username:'cdeimports'},{id:'17841400000000124',username:'outra_conta'}]:
   [{id:'17841400000000123',username:'cdeimports'}];
  return respond({data:rows});
 }
 if(p.endsWith('/me/permissions'))return respond({data:[
  {permission:'instagram_basic',status:'granted'},
  {permission:'instagram_content_publish',status:'granted'}
 ]});
 if(p.endsWith('/17841400000000123/media'))return respond({id:'17900000000000111'});
 if(p.endsWith('/17900000000000111'))return respond({status_code:'FINISHED'});
 if(p.endsWith('/17841400000000123/media_publish'))return respond({id:'18100000000000555'});
 throw Error('Unexpected Meta Graph route in unified test: '+p);
};
