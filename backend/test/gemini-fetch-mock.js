'use strict';
/*
 * Simulador da API Gemini para testes automatizados: nenhuma chamada real.
 * Injetado apenas em subprocessos de CI pelo NODE_OPTIONS --require.
 */
const original=globalThis.fetch;
globalThis.fetch=async (input,options)=>{
 const url=String(input);
 if(!url.startsWith('https://generativelanguage.googleapis.com/v1beta/models/'))return original(input,options);
 const body=JSON.parse(options?.body||'{}');
 const key=options?.headers?.['x-goog-api-key'];
 if(key!=='key-for-ci-only'||!url.includes('/gemini-3.5-flash-lite:generateContent')||
    body?.generationConfig?.responseMimeType!=='application/json'||
    !body?.systemInstruction?.parts?.[0]?.text||
    !body?.contents?.[0]?.parts?.[0]?.text){
  return new Response(JSON.stringify({error:{message:'Formato de requisição inválido no teste'}}),{status:400,headers:{'Content-Type':'application/json'}});
 }
 if(process.env.MOCK_GEMINI_MODE==='quota'){
  return new Response(JSON.stringify({error:{message:'RESOURCE_EXHAUSTED'}}),{status:429,headers:{'Content-Type':'application/json'}});
 }
 const p=JSON.parse(body.contents[0].parts[0].text);
 const result={
  suggestions:p.redes.map(channel=>({channel,variants:['✨ '+p.produto+' - primeira versão para '+channel,'💡 '+p.produto+' - segunda versão para '+channel]})),
  hashtags:['#CDEImports','#Perfumaria'],
  ideas:['Ideia de Reel com características informadas','Carrossel com fotos próprias']
 };
 return new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify(result)}]}}]}),{status:200,headers:{'Content-Type':'application/json'}});
};
