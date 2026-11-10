'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createPublisher,publicMediaUrl}=require('../instagram-publisher.js');
const connected={
 openId:'17841400000000123',name:'@cdeimports',accessToken:'token-for-local-test',
 expiresAt:Date.now()+3600000,
 scopes:'instagram_business_basic,instagram_business_content_publish'
};
const make=({account=connected,ready='FINISHED',failPublish=false}={})=>{
 const calls=[];
 const client=createPublisher({
  getAccount:()=>account,
  callMeta:async(url,opt={})=>{
   calls.push({url,method:opt.method||'GET',body:opt.body?.toString()||'',auth:opt.headers?.Authorization});
   if(url.endsWith('/media'))return {id:'17900000000000111'};
   if(url.includes('?fields=status_code'))return {status_code:ready};
   if(url.endsWith('/media_publish')){
    if(failPublish)throw Error('Falha simulada sem confirmação');
    return {id:'18100000000000555'};
   }
   throw Error('Chamada inesperada');
  }
 });
 return {client,calls};
};
test('URL pública estritamente HTTPS; rejeita IPs, localhost e credenciais',()=>{
 assert.equal(publicMediaUrl('https://cdn.exemplo.com/produto.jpg'),'https://cdn.exemplo.com/produto.jpg');
 for(const url of ['http://cdn.exemplo.com/a.jpg','https://127.0.0.1/a.jpg','https://[::1]/a.jpg',
  'https://localhost/a.jpg','https://recurso.internal/a.jpg','https://user:pass@cdn.exemplo.com/a.jpg',
  'https://cdn.exemplo.com:8443/a.jpg','file:///tmp/a.jpg','ftp://cdn.exemplo.com/a.jpg']){
  assert.equal(publicMediaUrl(url),null,url);
 }
});
test('Postar Instagram Feed exige sessão, permissão, mídia JPEG e confirmação de cada post',async()=>{
 const {client,calls}=make();
 const noSession=await client.prepare('other',{kind:'IMAGE',mediaUrl:'https://cdn.exemplo.com/a.jpg',caption:'Produto'});
 assert.equal(noSession.code,200); // factory currently uses account for any valid session; isolation is per-job.
 assert.equal((await client.checkStatus('different',{jobId:noSession.body.jobId})).code,404);
 assert.equal((await client.confirm('different',{jobId:noSession.body.jobId,confirm:true})).code,404);
 const invalid=await client.prepare('session1',{kind:'IMAGE',mediaUrl:'https://localhost/a.jpg',caption:'Olá'});
 assert.equal(invalid.code,400);
 const wrongFormat=await client.prepare('session1',{kind:'IMAGE',mediaUrl:'https://cdn.exemplo.com/a.png',caption:'Olá'});
 assert.equal(wrongFormat.code,400);
 const prepared=await client.prepare('session1',{kind:'IMAGE',mediaUrl:'https://cdn.exemplo.com/a.jpg',caption:'✨ Produto CDE Imports'});
 assert.equal(prepared.code,200);
 assert.ok(/^[a-f0-9]{48}$/.test(prepared.body.jobId));
 assert.match(calls.at(-1).url,/graph.instagram.com\/v26.0\/17841400000000123\/media$/);
 assert.equal(calls.at(-1).auth,'Bearer token-for-local-test');
 assert.equal(new URLSearchParams(calls.at(-1).body).get('image_url'),'https://cdn.exemplo.com/a.jpg');
 assert.equal((await client.confirm('session1',{jobId:prepared.body.jobId})).code,400);
 const status=await client.checkStatus('session1',{jobId:prepared.body.jobId});
 assert.equal(status.code,200);
 assert.equal(status.body.ready,true);
 const final=await client.confirm('session1',{jobId:prepared.body.jobId,confirm:true});
 assert.equal(final.code,200);
 assert.equal(final.body.mediaId,'18100000000000555');
 assert.equal(final.body.state,'published');
 const publishCalls=calls.filter(x=>x.url.endsWith('/media_publish'));
 assert.equal(publishCalls.length,1);
 assert.equal(new URLSearchParams(publishCalls[0].body).get('creation_id'),'17900000000000111');
 const repeated=await client.confirm('session1',{jobId:prepared.body.jobId,confirm:true});
 assert.equal(repeated.body.mediaId,final.body.mediaId);
 assert.equal(calls.filter(x=>x.url.endsWith('/media_publish')).length,1);
});
test('Reels aguardam processamento FINISHED e não publicam automaticamente',async()=>{
 const {client,calls}=make({ready:'IN_PROGRESS'});
 const made=await client.prepare('a',{kind:'REELS',mediaUrl:'https://cdn.exemplo.com/reel.mp4',caption:'Reels da CDE'});
 assert.equal(made.code,200);
 const args=new URLSearchParams(calls[0].body);
 assert.equal(args.get('media_type'),'REELS');
 assert.equal(args.get('video_url'),'https://cdn.exemplo.com/reel.mp4');
 const status=await client.checkStatus('a',{jobId:made.body.jobId});
 assert.equal(status.body.ready,false);
 const publish=await client.confirm('a',{jobId:made.body.jobId,confirm:true});
 assert.equal(publish.code,409);
 assert.equal(calls.filter(x=>x.url.endsWith('/media_publish')).length,0);
});
test('Sem permissão realmente concedida ou token vencido é bloqueado',async()=>{
 const noScope=make({account:{...connected,scopes:'instagram_business_basic'}});
 const deny=await noScope.client.prepare('s',{kind:'IMAGE',mediaUrl:'https://cdn.exemplo.com/a.jpg',caption:'teste'});
 assert.equal(deny.code,409);
 assert.match(deny.body.error,/instagram_business_content_publish/);
 assert.equal(noScope.calls.length,0);
 const expired=make({account:{...connected,expiresAt:Date.now()-1000}});
 assert.equal((await expired.client.prepare('s',{kind:'IMAGE',mediaUrl:'https://cdn.exemplo.com/a.jpg',caption:'teste'})).code,409);
 assert.equal(expired.calls.length,0);
});
test('Falha ambígua impede segundo envio para não duplicar publicação',async()=>{
 const {client,calls}=make({failPublish:true});
 const prepared=await client.prepare('s',{kind:'IMAGE',mediaUrl:'https://cdn.exemplo.com/a.jpg',caption:'Produto'});
 const one=await client.confirm('s',{jobId:prepared.body.jobId,confirm:true});
 assert.equal(one.code,502);
 const again=await client.confirm('s',{jobId:prepared.body.jobId,confirm:true});
 assert.equal(again.code,409);
 assert.equal(calls.filter(x=>x.url.endsWith('/media_publish')).length,1);
});
