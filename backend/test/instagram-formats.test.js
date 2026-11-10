'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createPublisher}=require('../instagram-publisher.js');
function fixture({unfinished=false}={}){
 const calls=[],statuses=new Map(),ids=[];
 let n=17900000000000000n;
 const account={flow:'unified',openId:'17841400000000123',scopes:'instagram_basic,instagram_content_publish',
  grantSource:'verified',accessToken:'mock-only',expiresAt:Date.now()+3600000};
 const publisher=createPublisher({getAccount:()=>account,callMeta:async(url,opt={})=>{
  const body=new URLSearchParams(opt.body||'');
  calls.push({url,method:opt.method||'GET',body});
  if(url.endsWith('/media')){
   const id=String(++n);ids.push(id);
   statuses.set(id,'FINISHED');return {id};
  }
  if(url.includes('?fields=status_code')){
   const id=url.split('/').pop().split('?')[0];
   if(unfinished&&ids.length<3&&id===ids[0])return {status_code:'IN_PROGRESS'};
   return {status_code:statuses.get(id)||'FINISHED'};
  }
  if(url.endsWith('/media_publish'))return {id:'18100000000000111'};
  throw Error('Unexpected mock path: '+url);
 }});
 return {publisher,calls,ids};
}
const photo='https://assets.example.net/p1.jpg';
const video='https://assets.example.net/r1.mp4';
test('Story image sends media_type STORIES without caption or clickable link sticker',async()=>{
 const f=fixture();
 const r=await f.publisher.prepare('s',{kind:'STORY_IMAGE',mediaUrl:photo,caption:'Mensagem do Story'});
 assert.equal(r.code,200);
 assert.equal(r.body.kind,'STORY_IMAGE');
 const args=f.calls[0].body;
 assert.equal(args.get('media_type'),'STORIES');
 assert.equal(args.get('image_url'),photo);
 assert.equal(args.has('caption'),false);
 assert.equal(args.has('link_sticker'),false);
 assert.equal((await f.publisher.checkStatus('s',{jobId:r.body.jobId})).body.ready,true);
 const result=await f.publisher.confirm('s',{jobId:r.body.jobId,confirm:true});
 assert.equal(result.code,200);
 assert.equal(result.body.state,'published');
});
test('Video Story publishes a video URL as a Story, not Reels',async()=>{
 const f=fixture();
 const r=await f.publisher.prepare('s',{kind:'STORY_VIDEO',mediaUrl:video});
 assert.equal(r.code,200);
 const args=f.calls[0].body;
 assert.equal(args.get('media_type'),'STORIES');
 assert.equal(args.get('video_url'),video);
 assert.equal(args.has('share_to_feed'),false);
});
test('Carrossel creates 2 children, polls status, then creates and publishes a parent',async()=>{
 const f=fixture();
 const r=await f.publisher.prepare('s',{kind:'CAROUSEL',caption:'Novidades da CDE',
  items:[{kind:'IMAGE',mediaUrl:photo},{kind:'VIDEO',mediaUrl:video}]});
 assert.equal(r.code,200);
 assert.equal(r.body.state,'children_pending');
 assert.equal(f.calls.length,2);
 assert.equal(f.calls[0].body.get('is_carousel_item'),'true');
 assert.equal(f.calls[0].body.get('image_url'),photo);
 assert.equal(f.calls[1].body.get('is_carousel_item'),'true');
 assert.equal(f.calls[1].body.get('media_type'),'VIDEO');
 assert.equal(f.calls[1].body.get('video_url'),video);
 const checked=await f.publisher.checkStatus('s',{jobId:r.body.jobId});
 assert.equal(checked.code,200);
 assert.equal(checked.body.ready,true);
 assert.equal(f.calls.filter(x=>x.url.endsWith('/media')).length,3);
 const parent=f.calls.filter(x=>x.url.endsWith('/media'))[2].body;
 assert.equal(parent.get('media_type'),'CAROUSEL');
 assert.equal(parent.get('caption'),'Novidades da CDE');
 assert.equal(parent.get('children'),f.ids.slice(0,2).join(','));
 const response=await f.publisher.confirm('s',{jobId:r.body.jobId,confirm:true});
 assert.equal(response.code,200);assert.equal(response.body.mediaId,'18100000000000111');
 assert.equal(f.calls.filter(x=>x.url.endsWith('/media_publish')).length,1);
});
test('Reject invalid carousels, invalid URLs and wrong JPEG extension before any Meta call',async()=>{
 const f=fixture();
 for(const input of [
  {kind:'CAROUSEL',caption:'t',items:[{kind:'IMAGE',mediaUrl:photo}]},
  {kind:'CAROUSEL',caption:'t',items:Array(11).fill({kind:'IMAGE',mediaUrl:photo})},
  {kind:'CAROUSEL',caption:'t',items:[{kind:'IMAGE',mediaUrl:photo},{kind:'IMAGE',mediaUrl:'http://localhost/private.jpg'}]},
  {kind:'STORY_IMAGE',mediaUrl:'https://assets.example.net/p.png'},
  {kind:'REELS',caption:'t',mediaUrl:'https://assets.example.net/photo.jpg'}
 ]){
  const r=await f.publisher.prepare('s',input);
  assert.equal(r.code,400);
 }
 assert.equal(f.calls.length,0);
});
