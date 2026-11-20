// Public comparison snapshot and Lv.1 approved sort-cache regression checks.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),cp=require('node:child_process');
const read=p=>fs.readFileSync(p,'utf8');
for(const path of ['js/statistics-directory-v2.js','scripts/build-public-comparison-directory.cjs'])
  cp.execFileSync(process.execPath,['--check',path],{stdio:'inherit'});
const data=JSON.parse(read('data/public-comparison-school-directory-v1.json'));
const fields=['school_id','school_name','sido_standard','support_office','establishment'];
assert.equal(data.version,1);
assert.equal(data.source,'public.schools/status=운영');
assert.deepEqual(data.fields,fields);
assert.equal(data.rows.length,data.count);
assert.ok(data.count>=6000&&data.count<=12000);
const ids=new Set();
for(const row of data.rows){
  assert.equal(row.length,5);
  assert.match(row[0],/^[A-Z0-9]{7}$/);
  assert.ok(typeof row[1]==='string'&&row[1].trim());
  assert.ok(!ids.has(row[0]));
  ids.add(row[0]);
}
assert.equal(ids.size,data.count);
const loader=read('js/statistics-directory-v2.js');
assert.match(loader,/async function staticDirectory\(\)/);
assert.match(loader,/fetch\('data\/public-comparison-school-directory-v1\.json/);
assert.match(loader,/catch\(error\)/);
assert.match(loader,/\.from\('schools'\)/); // live fallback remains
const migration=read('supabase/migrations/20261120_lv1_sort_cache_v1.sql');
assert.match(migration,/enable row level security/i);
assert.match(migration,/revoke all on public.beagu_lv1_school_sort_cache_v1 from public, anon, authenticated/i);
assert.match(migration,/grant select on public.beagu_lv1_school_sort_cache_v1 to service_role/i);
assert.match(migration,/on conflict \(school_id\) do update/i);
assert.match(migration,/is distinct from/i);
assert.match(migration,/\*\/5 \* \* \* \*/);
const api=read('supabase/functions/beagu-level-api/index.ts');
assert.match(api,/if\(Number\(session.access_level\)<1\)return send\(\{error:'ACCESS_DENIED'/);
assert.match(api,/rankedQuery\('beagu_lv1_school_sort_cache_v1'\)/);
assert.match(api,/rankedQuery\('beagu_lv1_school_sort_index'\)/);
assert.match(api,/count:'exact'/);
const workflow=read('.github/workflows/refresh-public-school-directory.yml');
assert.match(workflow,/workflow_dispatch:/);
assert.match(workflow,/node scripts\/build-public-comparison-directory.cjs/);
assert.match(workflow,/git diff --quiet/);
assert.match(read('statistics.html'),/statistics-directory-v2\.js\?v=20261120-compact1/);
// Simulate successful static directory: the database must never be queried.
async function testStatic(){
 const events=[];
 const sandbox={
  window:{BeaguLoading:{start:()=>1,finish:()=>{}},
    BeaguPublic:{buildIndex:()=>new Map([['AB12345',{}]])},
    dispatchEvent:ev=>events.push(ev.detail)},
  document:{getElementById:()=>({textContent:''})},
  CustomEvent:class{constructor(_name,opts){this.detail=opts.detail}},
  sessionStorage:{getItem:()=>null,setItem:()=>{}},
  supabaseClient:{from:()=>{throw Error('Static directory must not hit Supabase')}},
  fetch:async url=>({ok:true,json:async()=>String(url).includes('public-comparison')?data:{}}),
  Map,Set,Date,Promise,JSON,Array,console
 };
 vm.runInNewContext(loader,sandbox);
 for(let i=0;i<25;i++)await Promise.resolve();
 assert.equal(events.length,2);
 assert.equal(events[0].schools.length,data.count);
 assert.equal(events[0].snapshotPending,true);
 assert.equal(events[1].snapshotOnly,true);
 assert.equal(events[1].snapshotReady,true);
}
testStatic().then(()=>console.log('Public directory/Lv1 sort cache regression checks passed'))
 .catch(error=>{console.error(error);process.exitCode=1});
