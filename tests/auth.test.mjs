import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {releaseMetrics,legacyRows} from '../supabase/functions/_shared/release-policy.mjs';
const digest=async s=>Buffer.from(await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode(s))).toString('hex');
async function harness(){
 const sessions=[],codes=[{code_sha256:await digest('TESTCODE8'),active:true,access_level:1}];
 let permitted=true,handler;
 const tables={beagu_level_codes:codes,beagu_level_sessions:sessions,beagu_release_metrics_v2:[],beagu_metric_catalog:[]};
 const admin={rpc:async()=>({data:permitted,error:null}),from(name){
  let filters=[],mode='read',insert;
  const q={select(){return q;},eq(k,v){filters.push(r=>r[k]===v);return q;},lte(){return q;},lt(){return q;},order(){return q;},limit(){return q;},insert(v){mode='insert';insert=v;return q;},delete(){mode='delete';return q;},maybeSingle(){return q.then(r=>({...r,data:r.data[0]||null}));},then(resolve,reject){return Promise.resolve().then(()=>{
   const all=tables[name]||[],found=all.filter(r=>filters.every(f=>f(r)));
   if(mode==='insert')all.push(insert);
   if(mode==='delete')for(const r of found)all.splice(all.indexOf(r),1);
   return {data:found,error:null};
  }).then(resolve,reject);}};return q;
 }};
 const source=readFileSync(new URL('../supabase/functions/beagu-level-api/index.ts',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'');
 vm.runInNewContext(stripTypeScriptTypes(source),{createClient:()=>admin,releaseMetrics,legacyRows,Deno:{env:{get:()=>''},serve:fn=>handler=fn},crypto:webcrypto,TextEncoder,TextDecoder,Response,console});
 const call=(body,token,options={})=>handler(new Request('https://example.test',{method:'POST',headers:{'Content-Type':'application/json',...(token?{'X-Beagu-Session':token}:{}),...options.headers},body:typeof body==='string'?body:JSON.stringify(body)}));
 return {call,sessions,limit:()=>permitted=false};
}
test('eight-character test code, hash-only storage, expiry and server logout',async()=>{
 const h=await harness();const login=await h.call({action:'login',code:'TESTCODE8'});assert.equal(login.status,200);
 const {token}=await login.json();assert.match(token,/^[a-f0-9]{64}$/);assert.notEqual(h.sessions[0].token_sha256,token);
 assert.equal((await h.call({action:'verify'},token)).status,200);
 assert.equal((await h.call({action:'logout'},token)).status,200);
 assert.equal((await h.call({action:'verify'},token)).status,401);
 const next=await (await h.call({action:'login',code:'TESTCODE8'})).json();h.sessions[0].expires_at='invalid';
 assert.equal((await h.call({action:'verify'},next.token)).status,401);
 h.sessions[0].expires_at='2000-01-01';assert.equal((await h.call({action:'verify'},next.token)).status,401);
});
test('unauthenticated, forged, malformed, cross-origin and oversized requests rejected',async()=>{
 const h=await harness();
 assert.equal((await h.call({action:'school',schoolId:'1234567'})).status,401);
 assert.equal((await h.call({action:'verify'},'a'.repeat(64))).status,401);
 assert.equal((await h.call('{')).status,400);
 assert.equal((await h.call([])).status,400);
 assert.equal((await h.call('x'.repeat(1025))).status,413);
 assert.equal((await h.call({},null,{headers:{Origin:'https://evil.test'}})).status,403);
 h.limit();assert.equal((await h.call({action:'login',code:'TESTCODE8'})).status,429);
});
