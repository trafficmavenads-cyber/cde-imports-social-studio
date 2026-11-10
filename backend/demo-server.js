'use strict';
// CDE Imports Social Studio — free demonstration backend.
// NO OAuth, NO secrets, NO passwords, NO persistent storage, NO social publishing.
const http=require('node:http');
const PORT=Number(process.env.PORT||10000);
const allowedOrigin='https://trafficmavenads-cyber.github.io';
const noStore={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const providers={instagram:false,tiktok:false,pinterest:false,youtube:false};
const server=http.createServer((req,res)=>{
 const origin=req.headers.origin;
 const cors=origin===allowedOrigin?{'Access-Control-Allow-Origin':allowedOrigin,'Vary':'Origin'}:{};
 const url=new URL(req.url,'http://localhost');
 const respond=(status,data)=>{
  res.writeHead(status,{...noStore,...cors,'Content-Type':'application/json; charset=utf-8'});
  res.end(JSON.stringify(data));
 };
 if(origin && origin!==allowedOrigin)return respond(403,{ok:false,error:'Origem não autorizada'});
 if(req.method==='OPTIONS'){
  res.writeHead(204,{...noStore,...cors,'Access-Control-Allow-Methods':'GET,OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'600'});res.end();return;
 }
 if(req.method==='GET'&&url.pathname==='/api/health')return respond(200,{
  ok:true,service:'CDE Imports Social Studio',mode:'demo',demoMode:true,version:'0.8.1',
  message:'Servidor gratuito de testes ativo. OAuth, senhas, tokens e publicações desativados.',
  providerConfigured:providers,serverTime:new Date().toISOString()
 });
 if(req.method==='GET'&&url.pathname==='/api/demo/ping')return respond(200,{
  ok:true,demoMode:true,roundTrip:'ok',serverTime:new Date().toISOString()
 });
 if(req.method==='GET'&&url.pathname==='/')return respond(200,{
  service:'CDE Imports Social Studio - DEMONSTRAÇÃO',ok:true,
  statusEndpoint:'/api/health',warning:'Não envie senhas, tokens ou dados de clientes.'
 });
 if(req.method!=='GET')return respond(405,{ok:false,error:'Modo demonstração: somente consultas públicas de teste.'});
 return respond(404,{ok:false,error:'Rota indisponível no ambiente de demonstração.'});
});
server.listen(PORT,'0.0.0.0',()=>console.log('CDE demo disponível em '+PORT));
