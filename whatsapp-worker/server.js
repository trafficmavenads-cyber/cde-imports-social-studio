// CDE Imports WhatsApp Group Worker — UNOFFICIAL integration.
// Never loads WhatsApp or connects unless WA_CONNECT_ENABLED=true and /connect is called.
// Never sends unless WA_SEND_ENABLED=true, the session is ready, and group ID is allowlisted.
'use strict';
require('dotenv').config();
const express = require('express');
const rateLimit = require('express-rate-limit');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '80kb' }));
app.use('/v1', rateLimit({windowMs: 60_000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false}));
const PORT = Number(process.env.PORT || 3888);
const HOST = process.env.HOST || '127.0.0.1';
const DATA_DIR = path.resolve(process.env.WA_DATA_DIR || './private-data');
const ID_FILE = path.join(DATA_DIR, 'sent-ids.json');
const connectEnabled = () => process.env.WA_CONNECT_ENABLED === 'true';
const sendEnabled = () => process.env.WA_SEND_ENABLED === 'true';
const allowed = () => (process.env.WA_ALLOWED_GROUP_IDS || '').split(',').map(x=>x.trim()).filter(Boolean);
let client = null;
let state = 'disconnected';
let qr = null;
let lastError = '';
let queue = Promise.resolve();

function auth(req,res,next) {
  const token = process.env.WA_ADMIN_TOKEN || '';
  const provided = (req.get('Authorization') || '').replace(/^Bearer\s+/i,'');
  if (token.length < 32 || provided.length !== token.length ||
    !crypto.timingSafeEqual(Buffer.from(provided),Buffer.from(token))) {
    return res.status(401).json({error:'Unauthorized: configure WA_ADMIN_TOKEN (32+ characters)'});
  }
  next();
}
function loadIds() {
  try {
    const parsed = JSON.parse(fs.readFileSync(ID_FILE,'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {return [];}
}
function rememberId(id) {
  fs.mkdirSync(DATA_DIR,{recursive:true,mode:0o700});
  const existing=loadIds();
  if (!existing.includes(id)) existing.push(id);
  const tmp=ID_FILE+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(existing.slice(-3000)),{mode:0o600});
  fs.renameSync(tmp,ID_FILE);
}
function validatePayload(p) {
  if (!p || typeof p !== 'object') return 'Invalid JSON';
  if (typeof p.groupId !== 'string' || !/^\d+@g\.us$/.test(p.groupId)) return 'Invalid WhatsApp group ID';
  if (!allowed().includes(p.groupId)) return 'Group not allowlisted';
  if (typeof p.message !== 'string' || !p.message.trim() || p.message.length > 4000) return 'Message must be 1-4000 characters';
  if (typeof p.idempotencyKey !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(p.idempotencyKey)) return 'Invalid idempotencyKey';
  return null;
}
app.get('/health',(req,res)=>res.json({service:'cde-whatsapp-worker',state,connectionEnabled:connectEnabled(),sendingEnabled:sendEnabled()}));
app.use('/v1',auth);
app.get('/v1/status',(req,res)=>res.json({
  state,connectionEnabled:connectEnabled(),sendingEnabled:sendEnabled(),
  allowlistedGroups:allowed().length,hasQr:!!qr,lastError
}));
app.post('/v1/connect',async(req,res)=>{
  if (!connectEnabled()) return res.status(423).json({error:'Connection disabled. Set WA_CONNECT_ENABLED=true manually.'});
  if (client) return res.json({state,hasQr:!!qr});
  try {
    const {Client,LocalAuth}=require('whatsapp-web.js');
    fs.mkdirSync(DATA_DIR,{recursive:true,mode:0o700});
    client=new Client({
      authStrategy:new LocalAuth({dataPath:path.join(DATA_DIR,'session')}),
      puppeteer:{headless:true,args:['--no-sandbox','--disable-dev-shm-usage']}
    });
    state='initializing';
    client.on('qr', value => { qr=value; state='awaiting_qr'; });
    client.on('authenticated',()=>{qr=null;state='authenticated';});
    client.on('ready',()=>{qr=null;state='ready';});
    client.on('auth_failure', msg=>{lastError=String(msg).slice(0,300);state='auth_failure';});
    client.on('disconnected', reason=>{state='disconnected';lastError=String(reason).slice(0,300);client=null;});
    client.initialize().catch(err=>{state='error';lastError=String(err.message||err);client=null;});
    return res.status(202).json({state});
  } catch(err) {client=null;state='error';lastError=String(err.message||err);return res.status(500).json({error:'Initialization failed'});}
});
// QR is sensitive: returned only to authenticated localhost administrator.
app.get('/v1/qr',(req,res)=>{
  if (!connectEnabled()) return res.status(423).json({error:'Connection disabled'});
  if (!qr) return res.status(404).json({error:'QR not available',state});
  res.json({qr});
});
app.get('/v1/groups',async(req,res)=>{
  if (!client || state!=='ready') return res.status(409).json({error:'Not connected'});
  try {
    const chats=await client.getChats();
    res.json({groups:chats.filter(c=>c.isGroup).map(c=>({id:c.id._serialized,name:c.name}))});
  } catch {res.status(500).json({error:'Could not list groups'});}
});
app.post('/v1/preview',(req,res)=>{
  const error=validatePayload(req.body);
  if(error)return res.status(400).json({error});
  res.json({valid:true,groupId:req.body.groupId,message:req.body.message,willSend:false});
});
app.post('/v1/send',async(req,res)=>{
  if (!sendEnabled()) return res.status(423).json({error:'Sending disabled. Set WA_SEND_ENABLED=true manually.'});
  if (!connectEnabled() || !client || state!=='ready') return res.status(409).json({error:'Not connected'});
  const error=validatePayload(req.body);
  if(error)return res.status(400).json({error});
  const payload={...req.body};
  // Serialize sends to reduce simultaneous submissions and duplicate deliveries.
  const task=queue.then(async()=>{
    if(loadIds().includes(payload.idempotencyKey))return {sent:false,duplicate:true};
    const result=await client.sendMessage(payload.groupId,payload.message,{linkPreview:false});
    rememberId(payload.idempotencyKey);
    return {sent:true,messageId:result.id?._serialized || null};
  });
  queue=task.catch(()=>{});
  try {return res.json(await task);}
  catch(err){lastError=String(err.message||err);return res.status(502).json({sent:false,error:'WhatsApp delivery failed; verify in app before retrying'});}
});
app.listen(PORT,HOST,()=>console.log('CDE WhatsApp worker listening on '+HOST+':'+PORT+'; connection '+(connectEnabled()?'permitted':'LOCKED')+'; sending '+(sendEnabled()?'permitted':'LOCKED')));
