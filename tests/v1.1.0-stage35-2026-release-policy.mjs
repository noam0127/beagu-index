import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  RELEASE_DELAY_MS, LV2_RELEASE_DELAY_MS,
  approved2026ReleaseIsOldEnough, canUse2026Lv2Snapshot, canUse2026TierSnapshot, releaseMetrics
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
assert.equal(canUse2026TierSnapshot(at(0),3,fixed),true,'Lv3 can use approved exact snapshot immediately');
assert.equal(canUse2026TierSnapshot(at(1),3,fixed),true);
assert.equal(canUse2026TierSnapshot(new Date(fixed+1).toISOString(),3,fixed),false,'Future approval must fail');
assert.equal(canUse2026TierSnapshot(at(6*hour-1),2,fixed),false);
assert.equal(canUse2026TierSnapshot(at(6*hour),2,fixed),true);
assert.equal(canUse2026TierSnapshot(at(25*hour),1,fixed),false,'Lv1 cannot invoke early exact-snapshot gate');
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
assert.equal(result(metric('percentile',1*hour),catalog(),3,true).length,1,
  'Verified Lv3 may see a newly approved, fully reviewed 2026 metric');
assert.equal(result(metric('percentile',1*hour),catalog(),3,false).length,0,
  'A Lv3 caller without a separately reviewed snapshot cannot skip the delay');
assert.equal(result({...metric('percentile',1*hour),small_cell_reviewed:false},catalog(),3,true).length,0,
  'Lv3 still cannot bypass small-cell review');
assert.equal(result({...metric('percentile',1*hour),identity_reviewed:false},catalog(),3,true).length,0);
assert.equal(result({...metric('percentile',1*hour),approval_status:'PENDING'},catalog(),3,true).length,0);
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
  assert.equal(result(metric(id,1*hour,2),catalog(id,2),3,true).length,0,
    id+' is private for Lv3 regardless of timing');
}
// Review flags and metadata must still fail closed after the delay.
assert.equal(result({...metric('percentile',30*hour),small_cell_reviewed:false},catalog(),2,true).length,0);
assert.equal(result({...metric('percentile',30*hour),privacy_status:'PENDING'},catalog(),2,true).length,0);
assert.equal(result({...metric('percentile',30*hour),approval_evidence:null},catalog(),2,true).length,0);

const api=readFileSync('supabase/functions/beagu-level-api/index.ts','utf8');
assert.match(api,/const effectiveLevel=await verifiedMemberTier\(req,session\)/,
  'Every protected action must use server-verified member level');
assert.match(api,/canUse2026TierSnapshot\(approval\?\.approved_at,level\)/,
  'School route must enforce correct tier delay before trusted RPC');
assert.match(api,/canUse2026TierSnapshot\(x\.approved_at,effectiveLevel\)/,
  'Batch percentile route must use verified tier delay');
assert.match(api,/releaseMetrics\(\(metrics\.data\|\|\[\]\)\.filter\(\(m:any\)=>m\.school_id===id\),catalog\.data\|\|\[\],effectiveLevel,recentIds\.has\(id\)\)/,
  'Percentile route cannot downgrade Lv3 to a hardcoded tier');
assert.match(api,/const level=effectiveLevel/,
  'School route must use server-verified Lv3');
assert.match(api,/if\(level>=2\)\{/);
const school=api.slice(api.indexOf("let lv2Approved2026:null|unknown[]=null;"),api.indexOf("const [legacy,metrics,catalog,curated2025]"));
assert.ok(school.indexOf('canUse2026TierSnapshot')<school.indexOf("admin.rpc('beagu_2026_lv2_released_question_results'"),
  'Never call early exact-snapshot RPC before tier-specific approval check');
assert.match(api,/const safe=releaseMetrics\(metrics\.data\|\|\[\],catalog\.data\|\|\[\],level,level>=2&&lv2Approved2026!==null\)/);

console.log('PASS: 2026 Lv1 24h / Lv2 6h / verified Lv3 immediate, exact snapshot, sensitive Q31/Q51 and privacy checks.');
console.log('SCOPE: policy-unit/static checks; real published snapshot Lv3 data HTTP E2E and admin MFA still require separate proof.');
