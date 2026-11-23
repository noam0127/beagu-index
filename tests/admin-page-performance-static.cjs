'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),cp=require('node:child_process');
const read=p=>fs.readFileSync(p,'utf8');
for(const path of ['js/beagu-page-performance-v1.js','js/beagu-admin-access-v1.js',
  'js/arcade-school-picker-v1.js','js/statistics-directory-v2.js','js/level-search.js']){
  cp.execFileSync(process.execPath,['--check',path],{stdio:'inherit'});
}
const pages=['index.html','search.html','search-lv1.html','statistics.html','challenge.html',
  'result.html','school-report.html','teacher-volleyball.html','teacher-run.html'];
for(const page of pages){
  const html=read(page);
  assert.match(html,/js\/beagu-page-performance-v1\.js\?v=20261120-rum1/);
  assert.ok(html.indexOf('js/supabase-config.js')<html.indexOf('js/beagu-page-performance-v1.js'));
}
const sql=read('supabase/migrations/20261120_admin_page_perf_v1.sql');
assert.match(sql,/create table if not exists beagu_private\.beagu_page_perf_samples_v1/);
assert.match(sql,/create table if not exists beagu_private\.beagu_page_perf_rate_v1/);
assert.match(sql,/alter table beagu_private\.beagu_page_perf_samples_v1 enable row level security/);
assert.match(sql,/revoke all on beagu_private\.beagu_page_perf_samples_v1 from public,anon,authenticated/);
assert.match(sql,/grant execute on function public\.beagu_admin_page_perf_v1\(text\) to service_role/);
assert.match(sql,/revoke all on function public\.beagu_admin_page_perf_v1\(text\) from public,anon,authenticated/);
assert.match(sql,/last_sample_at\s*< now\(\)-interval '20 seconds'/);
assert.match(sql,/percentile_disc\(0\.50\)/);
assert.match(sql,/percentile_disc\(0\.90\)/);
assert.match(sql,/percentile_disc\(0\.99\)/);
assert.match(sql,/interval '31 days'/);
assert.match(sql,/interval '48 hours'/);
const edge=read('supabase/functions/beagu-admin-dashboard-v1/index.ts');
assert.match(edge,/claims\.aal!=="aal2"/);
assert.match(edge,/beagu_admin_active_mfa_session/);
assert.match(edge,/if\(input\.action==="live_traffic"\)/);
assert.match(edge,/beagu_admin_page_perf_v1/);
assert.match(edge,/performance:performanceResult\.error\?null:performanceResult\.data/);
const admin=read('admin.html');
assert.match(admin,/id="adminPerfRows"/);
assert.match(admin,/id="adminPerfAsOf"/);
for(const heading of ['P50','P90','P99','실패율'])assert.ok(admin.includes(heading));
const client=read('js/beagu-admin-access-v1.js');
assert.match(client,/function renderPerformance\(data\)/);
assert.match(client,/renderPerformance\(payload\.performance\)/);
assert.match(client,/item\.operation==='navigation'\?"측정 안 함"/);
const search=read('search.html');
const lv1=read('js/level-search.js');
const compare=read('js/statistics-directory-v2.js');
const picker=read('js/arcade-school-picker-v1.js');
assert.match(search,/BeaguPerf\?\.record\('school_search'/);
assert.match(lv1,/BeaguPerf\?\.record\('school_search'/);
assert.match(compare,/BeaguPerf\?\.record\('compare_directory'/);
assert.match(picker,/BeaguPerf\?\.record\('school_selection'/);
assert.match(picker,/BeaguPerf\?\.record\('school_search'/);
const body=read('js/beagu-page-performance-v1.js');
assert.doesNotMatch(body,/location\.search|searchInput\.value|userAgent|error\.message/);
assert.doesNotMatch(body,/supabaseClient\.rpc\(['"]beagu_perf_record_v1/);
assert.match(body,/functions\/v1\/beagu-perf-ingest-v1/);
const stageSql=read('scripts/staging/schema-page-performance-server-only-qa.sql');
assert.match(stageSql,/REVOKE ALL ON FUNCTION public\.beagu_perf_record_v1/);
assert.match(stageSql,/FROM PUBLIC,anon,authenticated/);
assert.match(stageSql,/TO service_role/);
const gateway=read('scripts/staging/recovered-beagu-perf-ingest-v1/index.ts');
assert.match(gateway,/const STAGE_URL='https:\/\/ycwuugggqbunlbwuzvbx\.supabase\.co'/);
assert.match(gateway,/ORIGIN_NOT_ALLOWED/);
assert.match(gateway,/beagu_perf_record_v1/);
assert.match(body,/window\.setTimeout\(\(\)=>\{/);
async function unit(){
  const events={},scheduled=[],calls=[];
  const storage=new Map();
  const state={
    window:{
      crypto:{randomUUID:()=> '11111111-1111-4111-8111-111111111111'},
      localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
      sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
      addEventListener:(name,cb)=>{events[name]=cb},
      setTimeout:cb=>{scheduled.push(cb);return scheduled.length}
    },
    location:{pathname:'/search.html'},
    document:{readyState:'loading'},
    performance:{getEntriesByType:()=>[{loadEventEnd:832}],timing:null},
    SUPABASE_URL:'https://ycwuugggqbunlbwuzvbx.supabase.co',
    fetch:(url,opts)=>{calls.push({url,body:JSON.parse(opts.body),headers:opts.headers});return Promise.resolve({ok:true,status:200})},
    crypto:{randomUUID:()=> '11111111-1111-4111-8111-111111111111'},
    Promise,Number,Math,Set,RegExp,Date,Object,String,console
  };
  vm.runInNewContext(body,state);
  assert.equal(typeof state.window.BeaguPerf.record,'function');
  state.window.BeaguPerf.record('school_search',280,true);
  await Promise.resolve();await Promise.resolve();
  assert.equal(calls[0].body.page,'search');
  assert.equal(calls[0].body.duration_ms,280);
  assert.equal(calls[0].body.ok,true);
  assert.equal(calls[0].body.operation,'school_search');
  assert.equal(calls[0].url,
    'https://ycwuugggqbunlbwuzvbx.supabase.co/functions/v1/beagu-perf-ingest-v1');
  assert.equal(calls[0].body.visitor,'11111111-1111-4111-8111-111111111111');
  assert.equal(calls[0].headers['Content-Type'],'application/json');
  state.window.BeaguPerf.record('unknown',10,true);
  assert.equal(calls.length,1);
  assert.equal(typeof events.load,'function');
  events.load();
  assert.equal(scheduled.length,1);
  scheduled.shift()();
  assert.equal(scheduled.length,1);
  scheduled.shift()();
  await Promise.resolve();await Promise.resolve();
  assert.ok(calls.some(x=>x.body.operation==='navigation'&&x.body.duration_ms===832));
  const previous=calls.length;
  vm.runInNewContext(body,{
    ...state,
    SUPABASE_URL:'https://snvzwrexuqavnfvzgxqj.supabase.co',
    window:{...state.window,BeaguPerf:undefined}
  });
  // The development sampler may be embedded in a production-configured page,
  // but it must NEVER send QA events to that production API.
  assert.equal(calls.length,previous);
}
unit().then(()=>console.log('Admin performance privacy/latency/behavior tests passed'))
  .catch(e=>{console.error(e);process.exitCode=1});
