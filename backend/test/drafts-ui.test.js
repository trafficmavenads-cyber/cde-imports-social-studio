'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const script=fs.readFileSync(path.resolve(__dirname,'../../site/drafts.js'),'utf8');
test('Gemini routes captions to TikTok and Instagram directories, supports editing, calendar and no false publishing',()=>{
 let storage={},seq=0,dispatched={},areaHandlers={},saveCalls=0;
 const fields={
  'network-drafts':{innerHTML:'',addEventListener:(type,fn)=>{areaHandlers[type]=fn;}},
  title:{value:'Perfume Oud'},
  checkout:{value:'https://cdeimports.site/produto'},
  message:{textContent:'',style:{}},
  rights:{checked:true},
  save:{click:()=>{
   saveCalls++;
   dispatched['cde:campaign-saved']({detail:{title:fields.title.value,channels:['tiktok'],campaignId:'saved1'}});
  }}
 };
 const checks=[
  {value:'tiktok',checked:true},
  {value:'instagram-feed',checked:true},
  {value:'pinterest',checked:false}
 ];
 const document={
  getElementById:id=>fields[id]||null,
  querySelectorAll:query=>query.startsWith('#channels')?checks:[]
 };
 const win={addEventListener:(event,fn)=>{dispatched[event]=fn;}};
 const ctx={window:win,document,localStorage:{
  getItem:key=>storage[key]||null,
  setItem:(key,value)=>{storage[key]=value;}
 },crypto:{randomUUID:()=>String(++seq)},navigator:{clipboard:{writeText:async()=>{}}},console};
 vm.runInNewContext(script,ctx);
 const api=win.CDEDraftRouter;
 assert.ok(api);
 const id=api.sync({title:'Perfume Oud',checkout:'https://cdeimports.site/produto',
  captions:{tiktok:'Legenda própria para TikTok #Fyp','instagram-feed':'Legenda especial Instagram #CDEImports'}});
 assert.equal(api.getRecords().length,2);
 assert.notEqual(api.getRecords()[0].channel,api.getRecords()[1].channel);
 assert.ok(fields['network-drafts'].innerHTML.includes('TikTok'));
 assert.ok(fields['network-drafts'].innerHTML.includes('Instagram Feed'));
 assert.ok(fields['network-drafts'].innerHTML.includes('Rascunho criado pela IA'));
 assert.ok(fields['network-drafts'].innerHTML.includes('não enviado'));
 assert.equal(api.captionForChannel('tiktok'),'Legenda própria para TikTok #Fyp');
 assert.equal(api.patch(id,'tiktok','Legenda revisada do TikTok'),true);
 assert.equal(api.captionForChannel('tiktok'),'Legenda revisada do TikTok');
 assert.equal(api.captionForChannel('instagram-feed'),'Legenda especial Instagram #CDEImports');
 const before=api.getRecords().find(x=>x.channel==='tiktok');
 const card={dataset:{draftId:before.id},querySelector:()=>({value:'Legenda final TikTok com emojis ✨'})};
 const button={dataset:{draftAction:'calendar'},closest:()=>card};
 areaHandlers.click({target:{closest:()=>button}});
 assert.equal(saveCalls,1);
 assert.equal(fields.title.value,'Perfume Oud');
 assert.equal(checks[0].checked,true);
 assert.equal(checks[1].checked,true);
 const after=api.getRecords();
 assert.equal(after.find(x=>x.channel==='tiktok').scheduled,true);
 assert.equal(after.find(x=>x.channel==='instagram-feed').scheduled,false);
 assert.equal(after.find(x=>x.channel==='tiktok').caption,'Legenda final TikTok com emojis ✨');
 assert.equal(api.captionForChannel('tiktok'),null);
 const newGroup=api.sync({groupId:id,title:'Perfume Oud',captions:{tiktok:'Novo texto para TikTok'}});
 assert.notEqual(newGroup,id);
 assert.equal(api.getRecords().length,3);
 assert.equal(api.getRecords().filter(x=>x.scheduled).length,1);
 assert.ok(JSON.stringify(storage).includes('Novo texto para TikTok'));
});
test('Past captions are escaped and remain in browser; external publisher does not exist',()=>{
 let store={},handlers={},events={},count=0;
 const nodes={
  'network-drafts':{innerHTML:'',addEventListener:(type,fn)=>{handlers[type]=fn;}},
  title:{value:'Perfume <img onerror=bad()>'},
  message:{textContent:'',style:{}},
  checkout:{value:''}
 };
 const context={document:{getElementById:id=>nodes[id],querySelectorAll:()=>[]},
  localStorage:{getItem:key=>store[key]||null,setItem:(key,val)=>{store[key]=val;}},
  crypto:{randomUUID:()=>String(++count)},window:{addEventListener:(event,fn)=>{events[event]=fn;}},console};
 vm.runInNewContext(script,context);
 context.window.CDEDraftRouter.sync({title:nodes.title.value,captions:{pinterest:'Olá <script>alert(1)</script>'}});
 const html=nodes['network-drafts'].innerHTML;
 assert.ok(html.includes('&lt;script&gt;'));
 assert.ok(html.includes('&lt;img'));
 assert.equal(typeof context.window.CDEDraftRouter.publish,'undefined');
});
