// Regression tests for public school loading, arcade server validation and private RLS.
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const cp=require('node:child_process');
const read=p=>fs.readFileSync(p,'utf8');
for(const p of ['js/statistics-directory-v2.js','js/statistics-compare.js','js/level-search.js','js/arcade-school-picker-v1.js']){
  cp.execFileSync(process.execPath,['--check',p],{stdio:'inherit'});
}
const compare=read('js/statistics-directory-v2.js');
const comparison=read('js/statistics-compare.js');
const publicSearch=read('search.html');
const lv1=read('js/level-search.js');
const picker=read('js/arcade-school-picker-v1.js');
const backend=read('supabase/functions/arcade-leaderboard/index.ts');
const secure=read('supabase/migrations/20261120_class_diary_preview_rls_hardening.sql');
assert.match(secure,/alter table beagu_private.class_diary_preview_gate enable row level security/i);
assert.match(secure,/alter table beagu_private.class_diary_preview_attempts enable row level security/i);
assert.match(secure,/revoke all on beagu_private.class_diary_preview_gate from anon, authenticated, public/i);
assert.match(compare,/DIRECTORY_TTL_MS/);
assert.match(compare,/Promise.all\(Array.from/);
assert.match(compare,/snapshotOnly:true/);
assert.match(comparison,/detail.snapshotOnly===true/);
assert.match(comparison,/!detail.snapshotPending/);
assert.match(publicSearch,/renderSchools\(list,count\|\|0\);\s*(?:perfSucceeded=true;\s*)?void \(async\(\)=>/);
assert.match(lv1,/render\(data,count,sortValue\);\s*(?:perfSucceeded=true;\s*)?void \(async\(\)=>/);
assert.match(lv1,/\.glory-detail-trigger\[aria-expanded="true"\]/);
assert.match(backend,/const \[rows,annualRows\]=await Promise.all\(\[/);
assert.match(picker,/const requestCache=new Map\(\)/);
assert.match(picker,/if\(cached\)return cached/);
for(const p of ['teacher-run.html','teacher-volleyball.html']){
  assert.match(read(p),/js\/arcade-school-picker-v1\.js\?v=11116-recommend-fix/);
}
// Inline script syntax checks for the modified public search page.
const block=/<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
let match,checked=0;
while((match=block.exec(publicSearch))){
  if(/\bsrc\s*=/.test(match[1])||!match[2].trim())continue;
  if(/type\s*=\s*["']application\/json/.test(match[1]))continue;
  new vm.Script(match[2],{filename:'search.html script '+(++checked)});
}
assert.ok(checked>0,'search page inline scripts checked');
// Functional comparison directory regression: it must show schools before
// the public percentile JSON has returned.
async function progressive(){
  const events=[],school={school_id:'S123456',school_name:'테스트초등학교',status:'운영'};
  let completeSnapshot;
  const sandbox={
    window:{
      BeaguLoading:{start:()=>1,finish:()=>{}},
      BeaguPublic:{buildIndex:()=>new Map([['S123456',{percentiles:[20,30,40]}]])},
      dispatchEvent:e=>events.push(e.detail)
    },
    document:{getElementById:()=>({textContent:''})},
    CustomEvent:class{constructor(_,init){this.detail=init.detail}},
    sessionStorage:{getItem:()=>null,setItem:()=>{}},
    supabaseClient:{from:()=>({
      select:()=>({
        eq:()=>({
          order:()=>({
            range:()=>Promise.resolve({data:[school],count:1,error:null})
          })
        })
      })
    })},
    fetch:url=>String(url).includes('public-compare-school-directory-v1.json')?
      Promise.reject(new Error('simulate unavailable static snapshot')):
      new Promise(resolve=>{completeSnapshot=()=>resolve({ok:true,json:async()=>({})})}),
    console,Map,Date,Array,Promise,Set
  };
  sandbox.performance={now:()=>100};
  vm.runInNewContext(compare,sandbox);
  for(let i=0;i<12;i++)await Promise.resolve();
  assert.equal(events.length,1);
  assert.equal(events[0].schools[0].school_name,school.school_name);
  assert.equal(events[0].snapshotPending,true);
  completeSnapshot();
  for(let i=0;i<12;i++)await Promise.resolve();
  assert.equal(events.length,2);
  assert.equal(events[1].snapshotOnly,true);
  assert.equal(events[1].snapshotReady,true);
}
progressive().then(()=>console.log('School loading/RLS static and progressive behavior checks passed'))
  .catch(err=>{console.error(err);process.exitCode=1});
