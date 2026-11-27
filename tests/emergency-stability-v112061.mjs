import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=p=>readFileSync(p,'utf8');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function clock(){
 const jobs=new Map();let id=0;
 return {setTimeout(fn,ms){jobs.set(++id,{fn,ms});return id},clearTimeout(key){jobs.delete(key)},
 fire(ms){const hit=[...jobs].find(([,j])=>j.ms===ms);assert.ok(hit,'Expected timer '+ms);jobs.delete(hit[0]);hit[1].fn()},
 count(ms){return [...jobs.values()].filter(j=>j.ms===ms).length}};
}
const state=read('js/beagu-level-state-v1.js');
const auth=read('js/beagu-participation-auth-v2.js');
const visit=read('js/visit-stats.js');
const timers=clock(),window={},requests=[];
const fetch=(url,opts)=>new Promise(resolve=>requests.push({opts,resolve}));
vm.runInNewContext(state.slice(state.indexOf('  const verifying=new Map();'),state.indexOf('  let generation=0;')),{window,fetch,VERIFY_URL:'https://example.invalid',AbortController,setTimeout:timers.setTimeout,clearTimeout:timers.clearTimeout});
const p1=window.BeaguVerifyLevelSession('test-token'),p2=window.BeaguVerifyLevelSession('test-token');
const failures=Promise.all([assert.rejects(p1,/AUTH_TIMEOUT/),assert.rejects(p2,/AUTH_TIMEOUT/)]);
await flush();assert.equal(requests.length,1);timers.fire(12000);await failures;
assert.equal(requests[0].opts.signal.aborted,true);
const next=window.BeaguVerifyLevelSession('test-token');await flush();assert.equal(requests.length,2);
requests[1].resolve(new Response(JSON.stringify({level:2}),{status:200}));assert.equal((await (await next).json()).level,2);
assert.equal(timers.count(12000),0);
const hungBody=window.BeaguVerifyLevelSession('test-token');
const bodyFailure=assert.rejects(hungBody,/AUTH_TIMEOUT/);
await flush();requests[2].resolve({clone:()=>({arrayBuffer:()=>new Promise(()=>{})})});
await flush();timers.fire(12000);await bodyFailure;
assert.equal(requests[2].opts.signal.aborted,true);

const authTimers=clock(),loginCalls=[];
const request=vm.runInNewContext(auth.slice(auth.indexOf(' async function request('),auth.indexOf(' async function verifyCurrent()'))+'\nrequest',{
 window:{},ENDPOINT:'https://example.invalid',AbortController,setTimeout:authTimers.setTimeout,clearTimeout:authTimers.clearTimeout,
 fetch:(url,opts)=>new Promise(resolve=>loginCalls.push({opts,resolve}))
});
const login=request('login',{code:'synthetic-code'});
const rejected=assert.rejects(login,/AUTH_TIMEOUT/);
await flush();authTimers.fire(12000);await rejected;
assert.equal(loginCalls[0].opts.signal.aborted,true);
const invalid=request('login',{code:'synthetic-code'});
loginCalls[1].resolve({ok:false,status:401,json:async()=>({error:'INVALID_CODE'})});
await assert.rejects(invalid,e=>e.status===401);
assert.match(auth,/const checked=await request\('verify',\{\},result\.token\)/);
assert.match(auth,/if\(stored\(\)!==startToken\)return/);
assert.match(auth,/if\(minimum===1&&level<2\)/);

function visitorFixture(){
 const c=clock(),calls=[],cells=['today','month','total'].map(stat=>({dataset:{stat},textContent:'집계 중'}));
 let ping;const storage={getItem:()=> 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',setItem(){}};
 const win={setTimeout(fn){ping=fn},setInterval(){}};
 const doc={querySelectorAll:()=>cells,visibilityState:'visible',addEventListener(){}};
 vm.runInNewContext(visit,{window:win,document:doc,localStorage:storage,sessionStorage:storage,
 crypto:{randomUUID:()=> 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'},location:{pathname:'/'},
 AbortController,setTimeout:c.setTimeout,clearTimeout:c.clearTimeout,
 supabaseClient:{functions:{invoke:(name,opts)=>new Promise(resolve=>calls.push({name,...opts,resolve}))}}});
 return {c,calls,cells,win,ping:()=>ping()};
}
const v=visitorFixture();await flush();
assert.equal(v.calls.length,1);v.ping();await flush();assert.equal(v.calls.length,1);
v.c.fire(8000);await flush();assert.ok(v.cells.every(x=>x.textContent==='집계 확인 불가'));assert.equal(v.calls[0].signal.aborted,true);
v.c.fire(3000);await flush();assert.equal(v.calls.length,2);assert.equal(v.calls[0].body.event,v.calls[1].body.event);
v.calls[1].resolve({data:{today:7,month:91,total:1000},error:null});await v.win.beaguVisitReady;
assert.deepEqual(v.cells.map(x=>x.textContent),['7','91','1,000']);
v.ping();await flush();assert.equal(v.calls[2].body.action,'ping');v.calls[2].resolve({data:{ok:true}});
await flush();
const fail=visitorFixture();await flush();
for(const backoff of [3000,9000]){fail.c.fire(8000);await flush();fail.c.fire(backoff);await flush();}
fail.c.fire(8000);assert.equal(await fail.win.beaguVisitReady,null);
assert.equal(fail.calls.length,3);assert.equal(new Set(fail.calls.map(x=>x.body.event)).size,1);
fail.ping();await flush();assert.equal(fail.calls.length,3);
assert.ok(fail.cells.every(x=>x.textContent==='집계 확인 불가'));
console.log('PASS: bounded single-flight and login, no token downgrade bypass, timely unavailable status, same-event retry and honest recovery, no ping storm');
