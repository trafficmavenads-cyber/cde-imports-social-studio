'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {chooseRecorderMime,examineMP4,inspectCodecs,convertToMP4}=require('../../site/mp4-export.js');
function box(name,payload=Buffer.alloc(4)){
 const buf=Buffer.alloc(payload.length+8);
 buf.writeUInt32BE(buf.length,0);
 buf.write(name,4,4,'ascii');payload.copy(buf,8);
 return buf;
}
const ftyp=box('ftyp',Buffer.from('isom0000','ascii'));
const moov=box('moov');
const mdat=box('mdat');
test('Prefere gravação MP4 com H264 e AAC; WebM apenas como intermediário',()=>{
 const recorder={isTypeSupported:type=>type==='video/mp4;codecs=avc1.42E01E,mp4a.40.2'||type==='video/webm'};
 assert.match(chooseRecorderMime(recorder),/^video\/mp4;codecs=avc1/);
 assert.equal(chooseRecorderMime({isTypeSupported:type=>type==='video/webm'}),'video/webm');
 assert.equal(chooseRecorderMime({isTypeSupported:()=>false}),null);
});
test('Verifica contêiner MP4 real e átomo moov antes de mdat',async()=>{
 const good=new Blob([ftyp,moov,mdat],{type:'video/mp4'});
 const bad=new Blob([ftyp,mdat,moov],{type:'video/mp4'});
 const webm=new Blob([Buffer.from([0x1a,0x45,0xdf,0xa3]),Buffer.alloc(30)],{type:'video/mp4'});
 assert.deepEqual(await examineMP4(good),{valid:true,fastStart:true});
 assert.deepEqual(await examineMP4(bad),{valid:true,fastStart:false});
 assert.deepEqual(await examineMP4(webm),{valid:false,fastStart:false});
 const same=await convertToMP4(good,{native:true});
 assert.strictEqual(same,good,'Um MP4 H264/AAC já correto não deve sofrer conversão desnecessária');
});


test('Quando só há WebM, a conversão gera H.264/AAC e MP4 com faststart',async()=>{
 const fetchBefore=globalThis.fetch,ffmpegBefore=globalThis.FFmpegWASM;
 const commands=[];
 const output=Buffer.concat([ftyp,moov,mdat]);
 class FakeFFmpeg{
  async load(config){assert.ok(config.classWorkerURL&&config.coreURL&&config.wasmURL);}
  async writeFile(name,data){assert.equal(name,'cde-source.webm');assert.ok(data.byteLength);}
  async exec(args){commands.push(args);return 0;}
  async readFile(name){assert.equal(name,'cde-result.mp4');return output;}
  terminate(){}
 }
 globalThis.FFmpegWASM={FFmpeg:FakeFFmpeg};
 globalThis.fetch=async()=>new Response(new Uint8Array([1,2,3]),{status:200});
 try{
  const media=new Blob([Buffer.from([0x1a,0x45,0xdf,0xa3,5,6,7,8])],{type:'video/webm'});
  const result=await convertToMP4(media,{native:false});
  assert.equal(result.type,'video/mp4');
  assert.deepEqual(await examineMP4(result),{valid:true,fastStart:true});
  assert.equal(commands.length,1);
  assert.ok(commands[0].includes('libx264'));
  assert.ok(commands[0].includes('aac'));
  assert.ok(commands[0].includes('+faststart'));
 }finally{
  globalThis.fetch=fetchBefore;
  if(ffmpegBefore===undefined)delete globalThis.FFmpegWASM;
  else globalThis.FFmpegWASM=ffmpegBefore;
 }
});

function codecMovie(audio){
 const entries=Buffer.concat([box('avc1'),box(audio)]),header=Buffer.alloc(8);header.writeUInt32BE(2,4);
 return Buffer.concat([ftyp,box('moov',box('trak',box('mdia',box('minf',box('stbl',box('stsd',Buffer.concat([header,entries]))))))),mdat]);
}
test('MP4 nativo com áudio Opus deve converter para AAC antes de publicar na Meta',async()=>{
 const input=new Blob([codecMovie('Opus')],{type:'video/mp4'});
 assert.deepEqual(await inspectCodecs(input),['avc1','Opus']);
 const beforeFetch=globalThis.fetch,beforeFFmpeg=globalThis.FFmpegWASM,commands=[];
 class FakeFFmpeg{
  async load(){} async writeFile(name){assert.equal(name,'cde-source.mp4');}
  async exec(args){commands.push(args);return 0;}
  async readFile(){return codecMovie('mp4a');} terminate(){}
 }
 globalThis.fetch=async()=>new Response(new Uint8Array([1,2,3]));
 globalThis.FFmpegWASM={FFmpeg:FakeFFmpeg};
 try{
  const output=await convertToMP4(input,{native:true});
  assert.notStrictEqual(output,input);
  assert.deepEqual(await inspectCodecs(output),['avc1','mp4a']);
  const args=commands[0];assert.equal(args[args.indexOf('-c:a')+1],'aac');assert.equal(args[args.indexOf('-c:v')+1],'copy');
 }finally{globalThis.fetch=beforeFetch;if(beforeFFmpeg===undefined)delete globalThis.FFmpegWASM;else globalThis.FFmpegWASM=beforeFFmpeg;}
});
