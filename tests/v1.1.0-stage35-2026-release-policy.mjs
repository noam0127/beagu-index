import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  RELEASE_DELAY_MS, LV2_RELEASE_DELAY_MS,
  approved2026ReleaseIsOldEnough, canUse2026Lv2Snapshot, releaseMetrics
} from '../supabase/functions/_shared/release-policy.mjs';

const hour=60*60*1000;
const now=Date.now();
assert.equal(RELEASE_DELAY_MS,24*hour);
assert.equal(LV2_RELEASE_DELAY_MS,6*hour);
const iso=(age)=>new Date(now-age).toISOString();

// Boundary values: require at least 24h for Lv1 or 6h for Lv2.
const fixed=Date.UTC(2026,10,22,12,0,0);
const at=ms=>new Date(fixed-ms).toISOString();
for(const [threshold,can] of [
  [24*hour,approved2026ReleaseIsOldEnough],
  [6*hour,canUse2026Lv2Snapshot]
]){
  assert.equal(can(at(threshold),fixed),true,'At cutoff must pass');
  assert.equal(can(at(threshold-1),fixed),false,'One millisecond early must fail');
  assert.equal(can('garbled-date',fixed),false,'Unparseable approval fails closed');
  assert.equal(can(null,fixed),false,'Missing approval fails closed');
  assert.equal(can(new Date(fixed+hour).toISOString(),fixed),false,'Future approval fails closed');
}
assert.equal(approved2026ReleaseIsOldEnough(at(24*hour),fixed,-1),false);
assert.equal(approved2026ReleaseIsOldEnough(at(24*hour),NaN),false);
const catalog=(qid='percentile',level=1,year=2026)=>[{
  survey_year:year,question_id:qid,access_level:level,verified:true,
  value_type:'number',minimum:0,maximum:100,label:'검토된 점수',
  meaning:'검토된 지표',interpretation:'검토된 해설',direction:'higher',
  unit:'%',spatial_scope:'검토 대상 학교'
}];
const metric=(qid='percentile',age=7*hour,level=1,year=2026)=>({
  survey_year:year,question_id:qid,access_level:level,approved_at:iso(age),
  approval_status:'APPROVED',privacy_status:'PASSED',identity_reviewed:true,
  question_reviewed:true,small_cell_reviewed:true,differencing_reviewed:true,
  approved_by:'test-reviewer',approval_evidence:{decision:'APPROVED'},
  release_version:'test-1',value:'42.5'
});
const result=(row,cat,lv,snapshot=false)=>releaseMetrics([row],cat,lv,snapshot);
assert.equal(result(metric('percentile',7*hour),catalog(),1,false).length,0,
  'Lv1 must not see a 7h approved metric');
assert.equal(result(metric('percentile',7*hour),catalog(),1,true).length,0,
  'Passing a truthy Lv2 snapshot flag must NOT unlock Lv1');
assert.equal(result(metric('percentile',25*hour),catalog(),1).length,1,
  'Lv1 releases a reviewed metric after 24h');
assert.equal(result(metric('percentile',5*hour),catalog(),2,true).length,0,
  'Lv2 must not see less-than-6h metric even with reviewed snapshot');
assert.equal(result(metric('percentile',7*hour),catalog(),2,true).length,1,
  'Lv2 can see reviewed 2026 metric after 6h with independently approved snapshot');
assert.equal(result(metric('percentile',7*hour),catalog(),2,false).length,0,
  'Lv2 must not skip 24h without snapshot review');
assert.equal(result(metric('percentile',25*hour),catalog(),2,false).length,1,
  'After 24h the approved metric follows the ordinary public release');
assert.equal(result(metric('Q10',1*hour,2,2025),catalog('Q10',2,2025),2,false).length,1,
  'New 2026 timing restrictions must not change approved historical 2025 metrics');
assert.equal(result(metric('percentile',2*hour),catalog(),2,true).length,0,
  'A newly approved metric cannot inherit an older snapshot release timestamp');

for(const id of ['Q31','Q51']){
  assert.equal(result(metric(id,30*hour,2),catalog(id,2),2,true).length,0,
    id+' sensitive/private question cannot be published even when older than 24h');
}
// Review flags and metadata must still fail closed after the delay.
assert.equal(result({...metric('percentile',30*hour),small_cell_reviewed:false},catalog(),2,true).length,0);
assert.equal(result({...metric('percentile',30*hour),privacy_status:'PENDING'},catalog(),2,true).length,0);
assert.equal(result({...metric('percentile',30*hour),approval_evidence:null},catalog(),2,true).length,0);

const api=readFileSync('supabase/functions/beagu-level-api/index.ts','utf8');
assert.match(api,/canUse2026Lv2Snapshot\(approval\?\.approved_at\)/,
  'School route must enforce 6-hour cutoff before trusted RPC');
assert.match(api,/canUse2026Lv2Snapshot\(x\.approved_at\)/,
  'Batch percentile route must enforce 6-hour cutoff before trusted RPC');
assert.match(api,/releaseMetrics\(\(metrics\.data\|\|\[\]\)\.filter\(\(m:any\)=>m\.school_id===id\),catalog\.data\|\|\[\],Number\(session\.access_level\),recentIds\.has\(id\)\)/,
  'Percentile route must pass verified session level, not hard-coded Lv1');
const school=api.slice(api.indexOf("let lv2Approved2026:null|unknown[]=null;"),api.indexOf("const [legacy,metrics,catalog,curated2025]"));
assert.ok(school.indexOf('canUse2026Lv2Snapshot')<school.indexOf("admin.rpc('beagu_2026_lv2_released_question_results'"),
  'No Lv2 exact-snapshot RPC may execute before approval age is verified');

console.log('PASS: 2026 Lv1 24h / Lv2 6h release delay + independent snapshot + private Q31/Q51 and review flags.');
console.log('NOT TESTED: live Lv3 zero-delay, cross-account Auth, or publication approval RPC E2E.');
