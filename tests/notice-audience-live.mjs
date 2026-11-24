import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const cfg=readFileSync('js/supabase-config.js','utf8'),url=cfg.match(/const SUPABASE_URL = "([^"]+)"/)?.[1],key=cfg.match(/const SUPABASE_PUBLISHABLE_KEY = "([^"]+)"/)?.[1];assert.ok(url&&key);
const endpoint=url+'/functions/v1/beagu-notice-audience-v1';
const call=async(body,headers={})=>{const r=await fetch(endpoint,{method:'POST',headers:{apikey:key,'Content-Type':'application/json',Origin:'https://baeguindex.com',...headers},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});let result;try{result=await r.json()}catch{throw Error('notice API non-JSON response: '+r.status)}return {status:r.status,result,cache:r.headers.get('cache-control')}};
const publicResult=await call({action:'public_read',audience:'2',level:2});
assert.equal(publicResult.status,200);assert.equal(publicResult.result.level,0);assert.ok(Array.isArray(publicResult.result.notices));assert.ok(publicResult.result.notices.every(n=>['all','0'].includes(n.audience)));assert.match(publicResult.cache,/no-store/);
assert.equal((await call({action:'public_read'},{'X-Beagu-Session':'f'.repeat(64)})).status,401);
assert.equal((await call({action:'admin_read',audience:'2'})).status,401);
assert.equal((await call({action:'admin_read',audience:'2'},{Authorization:'Bearer invalid'})).status,401);
// No legitimate admin write is attempted; even unauthorized probes cannot mutate rows.
assert.equal((await call({action:'admin_save',audience:'2',revision:0,body:''})).status,401);
assert.equal((await call({action:'admin_hide',audience:'2',revision:0})).status,401);
console.log('PASS deployed audience API: anonymous Lv0, forged level ignored, invalid token rejected, admin reads/writes denied');
