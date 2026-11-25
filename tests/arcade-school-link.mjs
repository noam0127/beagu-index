import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script,runInNewContext} from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const backend=read('supabase/functions/arcade-leaderboard/index.ts');
const board=read('js/arcade-leaderboard-v1.js');
const history=read('js/arcade-history-v1.js');
const lv1=read('js/level-search.js');
const route=read('school-link.html');
const shell=read('arcade-history.html');
for(const src of [board,history,lv1])assert.doesNotThrow(()=>new Script(src));
assert.match(backend,/select:"score,created_at,school_id,school_name,difficulty"/);
assert.match(backend,/select:"id,score,created_at,school_id,school_name,difficulty/);
assert.match(backend,/schoolId:record\.school_id\?\?null/);
assert.match(backend,/session_id:"in\.\("\+sessions\.join\(","\)\+"\)"/);
assert.match(board,/function schoolLink\(entry\)/);
assert.match(board,/schoolLink\(entry\)/);
assert.match(board,/link\.target="_top"/);
assert.match(history,/function schoolHeading\(row\)/);
assert.match(history,/school-link\.html\?school_id=/);
assert.match(route,/Number\.isInteger\(data\.level\)/);
assert.match(route,/school-report\.html/);
assert.match(route,/search-lv1\.html/);
assert.match(route,/action:"verify"/);
assert.doesNotMatch(route,/service_role|supabase_secret/i);
assert.match(lv1,/String\(school\.school_id\)!==arcadeTargetId/);
assert.match(lv1,/String\(item\.school_id\)===arcadeTargetId/);
assert.match(lv1,/\.glory-detail-trigger/);
assert.match(shell,/history-school-link/);
for(const school of ['teacher-volleyball.html','teacher-run.html']){
 const page=read(school);
 assert.match(page,/js\/arcade-leaderboard-v1\.js\?v=(?:1119|11115-outcome)/);
}
assert.match(read('index.html'),/href="games.html"/);
assert.match(read('games.html'),/href="teacher-volleyball.html"/);
assert.match(read('games.html'),/href="teacher-run.html"/);
assert.match(shell,/js\/arcade-history-v1\.js\?v=11116-disclosure/);
assert.match(read('styles/arcade-cabinet-v1.css'),/arcade-rank-school-link::after/);
const script=route.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script);
assert.doesNotThrow(()=>new Script(script));
async function verifyRoute({schoolId='A123456',level=0,token=false,responseOk=true}={}){
 let target='';
 const session='a'.repeat(64);
 runInNewContext(script,{
  location:{search:'?school_id='+schoolId,replace:value=>{target=value}},
  sessionStorage:{getItem:()=>token?session:null},
  URLSearchParams,
  AbortSignal:{timeout:()=>({})},
  fetch:async(_url,options)=>({
    ok:responseOk,
    json:async()=>({level})
  })
 });
 await new Promise(resolve=>setImmediate(resolve));
 return target;
}
assert.equal(await verifyRoute(), 'school-report.html?school_id=A123456');
assert.equal(await verifyRoute({level:1,token:true}), 'search-lv1.html?school_id=A123456');
assert.equal(await verifyRoute({level:2,token:true}), 'search-lv1.html?school_id=A123456');
assert.equal(await verifyRoute({level:2,token:true,responseOk:false}), 'school-report.html?school_id=A123456');
assert.equal(await verifyRoute({schoolId:'../../admin'}), 'search.html');
console.log('PASS: immutable school links, Lv0 report, server-verified Lv1/Lv2 detail, unsafe ID rejected');
