import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {catalog} from '../supabase/functions/_shared/questionnaire-2026.mjs';
import {publicQuestionResults} from '../supabase/functions/_shared/results-2026.mjs';

const read=path=>fs.readFileSync(path,'utf8');
const search=read('js/level-search.js');
const compare=read('js/statistics-compare.js');
const report=read('school-report.html');
const view=read('js/2026-approved-question-results.js');
const api=read('supabase/functions/beagu-level-api/index.ts');
const lv1Release=read('supabase/migrations/20261120213000_beagu_2026_publication_basis_fail_closed.sql');
const lv2Release=read('supabase/migrations/20261121100000_beagu_2026_lv2_immediate_approved.sql');

for(const source of [search,compare,view])assert.doesNotThrow(()=>new vm.Script(source));
assert.match(search,/approved2026Views=new WeakMap\(\)/);
assert.match(search,/latest2026Status='error'/);
assert.match(search,/results2026=\[\]/);
assert.match(search,/if\(currentYear===2026\)choose\(2026\)/);
assert.match(search,/approved2026Views\.get\(detail\)\?\.\(null,true\)/);
assert.match(search,/if\(sync\)sync\(null,true\)/);
assert.match(search,/if\(year===2026 && loadStatus==='error'\)/);
assert.match(search,/if\(sync\)sync\(fresh,false\)/);
assert.doesNotMatch(search,/Preserve the last server-approved result on transient network errors/);
assert.match(compare,/requested\.forEach\(id=>\{\s*state\.public2026\.delete\(id\);\s*state\.public2026Checked\.delete\(id\);\s*state\.public2026Error\.add\(id\);/);
assert.match(compare,/cached\.items\[2026\]=\{\}/);
assert.match(compare,/cached\.summaries\[2026\]=\[\]/);
assert.match(compare,/if\(epoch!==state\.authEpoch\|\|token!==state\.sessionToken\)return/);
assert.match(report,/if\(latestOnly\)\{\s*\/\/ A withdrawn 2026 publication[\s\S]*?state\.years\['2026'\]\.percentile=null/);
assert.match(report,/state\.years\['2026'\]\.items=\{\};\s*state\.approvedSummary\['2026'\]=\[\];\s*render\(\)/);
assert.match(read('search-lv1.html'),/js\/level-search\.js\?v=[A-Za-z0-9-]+/);
assert.match(read('statistics.html'),/js\/statistics-compare\.js\?v=20261124-waterway-ready1/);
for(const publicSource of [search,compare,report,view])
  assert.doesNotMatch(publicSource,/응답 1건 학교|1건이라도 공개/);
assert.match(api,/'Cache-Control':'no-store'/);
assert.match(api,/level===2&&Array.isArray\(lv2Approved2026\)/);
assert.match(api,/admin\.rpc\('beagu_2026_lv2_released_question_results'/);
for(const release of [lv1Release,lv2Release]){
  assert.match(release,/r\.approval_status='APPROVED'/);
  assert.match(release,/b\.review_status='VERIFIED'/);
  assert.match(release,/q\.value->>'id' not in \('Q31','Q51'\)/);
}

// A confirmed, approved N=1 single-choice value is semantically identical to
// that one teacher's selection. Never call it anonymous solely because the
// response count is omitted. Release authorization remains a separate gate.
const q01=catalog.Q01;
const single={id:'Q01',row:-1,valid:1,invalid:0,counts:q01.options.map((_,i)=>i===0?1:0),minutes_sum:0};
const released=publicQuestionResults([single,{...single,id:'Q31'},{...single,id:'Q51'}]);
assert.equal(released.length,1);
assert.deepEqual(released[0].values,[q01.options[0]]);
assert.equal(Object.hasOwn(released[0],'counts'),false);
assert.equal(Object.hasOwn(released[0],'school_response_rows'),false);
assert.equal(released.some(x=>['Q31','Q51'].includes(x.questionId)),false);

// Dynamic browser renderer regression: even if stale values are supplied by
// a caller, an unavailable approval recheck must show NO old Q01 answer.
const start=search.indexOf('  function renderYear(');
const stop=search.indexOf('  function percentile2026(',start);
assert.ok(start>0&&stop>start);
class Node{
  constructor(tag,cls='',value=''){
    this.tag=tag;this.className=cls;this.textContent=String(value);
    this.children=[];this.handlers={};
  }
  append(...items){this.children.push(...items);}
  replaceChildren(...items){this.children=[...items];}
  addEventListener(type,cb){this.handlers[type]=cb;}
  setAttribute(){}
}
const make=(tag,cls,text)=>new Node(tag,cls,text??'');
const draw=new Function('window','make','BeaguDetailGroups','addRow',
  'metricValue','api','loggedOut','renderHistoricalBenchmarks',
  search.slice(start,stop)+'\nreturn renderYear;'
)({},make,{},()=>{},()=>'',async()=>({}),()=>{},()=>{});
const host=new Node('div');
draw(host,2026,[{year:2026,access_level:1,summary:{metrics:[{
  key:'Q01',label:'stale secret',value:100,unit:'점'
}]}}],null,'ABC1234',[],null,null,'error',[],[{
  questionId:'Q01',row:-1,values:[q01.options[0]]
}],2);
const all=[host,...host.children.flatMap(x=>[x,...x.children])];
assert.equal(all.some(x=>x.className==='beagu-approved-section'),false);
assert.equal(all.some(x=>x.className==='beagu-question-block'),false);
assert.ok(all.some(x=>x.className==='beagu-year-error'));
assert.ok(all.some(x=>x.className==='year-2026-button'));
assert.ok(!JSON.stringify(host).includes('stale secret'));
assert.ok(!JSON.stringify(host).includes(q01.options[0]));
const lv1=new Node('div');draw(lv1,2026,[],null,'ABC1234',[],null,null,'error',[],[],1);assert.ok(JSON.stringify(lv1).includes('beagu-year-error'));assert.ok(JSON.stringify(lv1).includes('year-2026-button'));
console.log('PASS: Lv1 and Lv2 2026 caches fail closed');

// Automatic opening must not bypass the school visibility tier or exception hold.
const autoSql=read('supabase/2026-auto-opening-v1.sql');
const cultureApi=read('supabase/functions/beagu-school-culture-v1/index.ts');
assert.match(autoSql,/where p_level=2 and cardinality/);
assert.match(autoSql,/'auto_lv1',0/);
assert.match(api,/p_level:Number\(session\.access_level\)/);
assert.match(api,/if\(level===1&&tierPublished2026\)/);
assert.match(api,/admin\.rpc\('beagu_2026_released_question_results'/);
assert.match(api,/tierPublished2026=schoolReleased===true&&!hiddenIds.includes\(id\)/);
assert.match(cultureApi,/if\(Number\(session.access_level\)!==2\)return send/);
assert.match(cultureApi,/releasedIds.filter\(\(id:string\)=>!hiddenIds.includes\(id\)\)/);
