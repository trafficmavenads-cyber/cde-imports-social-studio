'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.resolve(__dirname,'../../site/connections.js'),'utf8');
const start=source.indexOf('function isAllowedAuthDestination(');
const end=source.indexOf('\nfunction status(',start);
assert.ok(start>0&&end>start,'Shared OAuth destination guard is present in the frontend');
const run=vm.runInNewContext(source.slice(start,end)+'\nisAllowedAuthDestination;',{URL});
test('Meta Unified Login should redirect to official facebook.com/dialog/oauth',()=>{
 assert.equal(run('instagram',new URL('https://www.facebook.com/dialog/oauth?client_id=123&config_id=456&state=abc')),true);
 assert.equal(run('instagram',new URL('https://www.instagram.com/oauth/authorize?client_id=123')),true);
 assert.equal(run('tiktok',new URL('https://www.tiktok.com/v2/auth/authorize/?client_key=x')),true);
});
test('Reject hostname impersonation, untrusted paths, insecure protocol and other provider URLs',()=>{
 for(const raw of [
  'http://www.facebook.com/dialog/oauth?client_id=123',
  'https://www.facebook.com.attacker.example/dialog/oauth',
  'https://www.facebook.com/other/path',
  'https://instagram.com/dialog/oauth',
  'https://user@www.facebook.com/dialog/oauth',
  'https://www.facebook.com:8443/dialog/oauth',
  'https://www.tiktok.com/v2/auth/authorize/'
 ])assert.equal(run('instagram',new URL(raw)),false,raw);
 assert.equal(run('pinterest',new URL('https://www.facebook.com/dialog/oauth')),false);
});
