'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
class MockNode{
 constructor(tag='div'){this.tag=tag;this.children=[];this.listeners={};this.value='';this.textContent='';this.disabled=false;this.className='';this.classList={toggle(){}};this.dataset={};}
 append(...children){this.children.push(...children);}
 replaceChildren(...children){this.children=[...children];}
 addEventListener(event,fn){this.listeners[event]=fn;}
 dispatchEvent(event){this.listeners[event.type]?.(event);}
}
function textOf(node){return [node.textContent,...(node.children||[]).map(textOf)].join(' ');}
test('gerador de legendas por rede, hashtags, ideias e insights manuais',async()=>{
 const nodes=new Map(),listeners={};
 const byId=id=>{if(!nodes.has(id))nodes.set(id,new MockNode());return nodes.get(id);};
 byId('title').value='Perfume Oud Amadeirado';
 byId('ai-brief').value='Notas amadeiradas. Disponível sob encomenda.';
 byId('ai-tone').value='premium';
 byId('ai-goal').value='vender';
 const platforms=[{value:'instagram-feed'},{value:'tiktok'},{value:'whatsapp-status'}];
 const document={createElement:tag=>new MockNode(tag),getElementById:byId,querySelectorAll:()=>platforms};
 const window={
  addEventListener:(event,fn)=>{listeners[event]=fn;},
  CDEAIBackend:{status:()=>({configured:false,available:false})},
  CDESocialData:{getItems:()=>[
   {channel:'instagram-feed',views:1000,likes:100,comments:10,shares:10},
   {channel:'tiktok',views:200,likes:5,comments:2,shares:3},
   {channel:'whatsapp-status',views:null,likes:null,comments:null,shares:null}
  ]}
 };
 const context={window,document,Event:class{constructor(type){this.type=type;}},navigator:{clipboard:{writeText:async()=>{}}},console};
 vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../site/ai.js'),'utf8'),context);
 assert.equal(byId('ai-online').disabled,true);
 byId('ai-local').listeners.click();
 assert.ok(window.CDESocialAI);
 const ig=window.CDESocialAI.captionForChannel('instagram-feed');
 const tik=window.CDESocialAI.captionForChannel('tiktok');
 const wsp=window.CDESocialAI.captionForChannel('whatsapp-status');
 assert.ok(ig.includes('Perfume Oud Amadeirado'));
 assert.ok(tik.includes('Perfume Oud Amadeirado'));
 assert.ok(wsp.includes('Perfume Oud Amadeirado'));
 assert.ok(ig.includes('#CDEImports'));
 assert.ok(!wsp.includes('#CDEImports'));
 assert.notEqual(ig,tik);
 assert.ok(textOf(byId('ai-hashtags')).includes('#PerfumesImportados'));
 assert.ok(textOf(byId('ai-captions')).includes('Instagram Feed'));
 assert.ok(textOf(byId('ai-captions')).includes('TikTok'));
 assert.ok(textOf(byId('ai-performance')).includes('12,0%'));
 assert.ok(textOf(byId('ai-performance')).includes('Instagram Feed'));
 byId('ai-brief').value='Outra característica';
 assert.equal(window.CDESocialAI.captionForChannel('instagram-feed'),null);
 byId('ai-unblock').listeners.click();
 assert.ok(textOf(byId('ai-ideas-result')).includes('Grave um vídeo curto'));
 assert.equal(typeof listeners['cde:metrics-updated'],'function');
});
