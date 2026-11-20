// Public-only snapshot and protected Lv.1 approved sort-cache checks.
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const cp=require('node:child_process');
const read=p=>fs.readFileSync(p,'utf8');
const snapshot=JSON.parse(read('data/public-compare-school-directory-v1.json'));
assert.equal(snapshot.schema_version,2);
assert.equal(snapshot.source,'public.schools');
assert.equal(snapshot.rows.length,snapshot.count);
assert.ok(snapshot.count>=6000&&snapshot.count<=15000);
assert.ok(Date.now()-Date.parse(snapshot.generated_at)<7*86400000);
const ids=new Set();
for(const row of snapshot.rows){
  assert.ok(Array.isArray(row)&&row.length===5,'only 5 public fields may be exported');
  assert.match(row[0],/^[A-Z0-9]{7}$/);
  assert.ok(row[1]?.trim());
  assert.ok(!ids.has(row[0]));
  ids.add(row[0]);
}
assert.equal(ids.size,snapshot.count);
const src=read('js/statistics-directory-v2.js');
assert.match(src,/async function staticDirectory\(\)/);
assert.match(src,/async function dbDirectory\(\)/);
assert.match(src,/catch\(error\)\s*\{[\s\S]*?list=await dbDirectory\(\)/);
assert.match(src,/status:'운영'/);
const api=read('supabase/functions/beagu-level-api/index.ts');
assert.match(api,/rankedQuery\('beagu_lv1_school_sort_cache_v1'\)/);
assert.match(api,/rankedQuery\('beagu_lv1_school_sort_index'\)/);
assert.match(api,/return send\(\{schools:data\|\|\[\],total:count\|\|0,page:pagination,sort,direction,nulls:'last'\}/);
assert.doesNotMatch(api,/direction:ascending\?'asc':'desc'/);
assert.match(read('supabase/migrations/20261120_lv1_sort_cache_v1.sql'),/\*\/5 \* \* \* \*/);
assert.match(api,/session=await check\(req\)/);
assert.match(api,/Number\(session.access_level\)<1/);
const sql=read('supabase/migrations/20261120_lv1_school_sort_approved_cache.sql');
assert.match(sql,/enable row level security/i);
assert.match(sql,/revoke all on public.beagu_lv1_school_sort_cache from public, anon, authenticated/i);
assert.match(sql,/grant select on public.beagu_lv1_school_sort_cache to service_role/i);
assert.match(sql,/refresh_lv1_school_sort_cache_v1/i);
assert.match(sql,/3,18,33,48 \* \* \* \*/);
const generator=read('scripts/build-public-compare-directory.cjs');
assert.match(generator,/url.searchParams.set\('offset',String\(offset\)\)/);
assert.match(generator,/url.searchParams.set\('limit',String\(PAGE\)\)/);
assert.doesNotMatch(generator,/SERVICE_ROLE_KEY|survey_submissions|teacher_answers/i);
for(const file of ['js/statistics-directory-v2.js','scripts/build-public-compare-directory.cjs']){
  cp.execFileSync(process.execPath,['--check',file],{stdio:'inherit'});
}
async function staticProgressive(){
 const events=[];
 let releasePercentiles;
 const testRows=Array.from({length:6000},(_,i)=>[String(7000000+i),'테스트초등학교','부산','교육지원청','공립']);
 const sandbox={
   window:{BeaguLoading:{start:()=>1,finish:()=>{}},
    BeaguPublic:{buildIndex:()=>new Map([['7000000',{percentiles:[50,50,50]}]])},
    dispatchEvent:event=>events.push(event.detail)},
   document:{getElementById:()=>({textContent:''})},
   CustomEvent:class{constructor(_,init){this.detail=init.detail}},
   sessionStorage:{getItem:()=>null,setItem:()=>{}},
   supabaseClient:{from:()=>{throw Error('Static path should not hit database')}},
   fetch:url=>String(url).includes('public-compare-school-directory-v1.json')?
     Promise.resolve({ok:true,json:async()=>({schema_version:2,source:'public.schools',generated_at:new Date().toISOString(),count:6000,rows:testRows})}):
     new Promise(resolve=>{releasePercentiles=()=>resolve({ok:true,json:async()=>({})})}),
   console,Map,Date,Array,Promise,Set
 };
 sandbox.performance={now:()=>100};
 vm.runInNewContext(src,sandbox);
 for(let i=0;i<20;i++)await Promise.resolve();
 assert.equal(events.length,1);
 assert.equal(events[0].schools.length,6000);
 assert.equal(events[0].snapshotPending,true);
 releasePercentiles();
 for(let i=0;i<20;i++)await Promise.resolve();
 assert.equal(events.length,2);
 assert.equal(events[1].snapshotOnly,true);
}
staticProgressive().then(()=>console.log('PASS: public directory, progressive loading, protected cache and safe fallback'))
 .catch(err=>{console.error(err);process.exitCode=1});
