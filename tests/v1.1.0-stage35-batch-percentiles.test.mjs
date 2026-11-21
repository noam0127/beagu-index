import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {public2026BatchPercentiles} from '../supabase/functions/_shared/2026-batch-percentiles.mjs';

const edge=fs.readFileSync('supabase/functions/beagu-level-api/index.ts','utf8');
const policy=fs.readFileSync('supabase/functions/_shared/release-policy.mjs','utf8');
const client=fs.readFileSync('js/level-search.js','utf8');

const id=n=>'A'+String(n).padStart(6,'0');
const approvals={
 source:'synthetic-publication-review',
 approvedBy:'owner',
 evidence:'independent-exact-snapshot',
};
const catalog=[{
 survey_year:2026,question_id:'percentile',access_level:1,verified:true,
 label:'학교 문화 백분위',value_type:'number',minimum:0,maximum:100,
 meaning:'승인된 지표',interpretation:'승인된 지표 해석',
 direction:'higher',unit:'점',spatial_scope:'school'
}];
function metric(n,approvedHours=7,value='75',more={}){
 return {
  school_id:id(n),survey_year:2026,question_id:'percentile',
  access_level:1,value,release_version:'2026-reviewed-v1',
  approval_status:'APPROVED',privacy_status:'PASSED',
  identity_reviewed:true,question_reviewed:true,
  small_cell_reviewed:true,differencing_reviewed:true,
  approved_at:new Date(Date.now()-approvedHours*3600*1000).toISOString(),
  approved_by:approvals.approvedBy,
  approval_evidence:approvals.evidence,...more
 };
}
function project({ids=[id(1)],rows=[metric(1)],level=2,early=[id(1)],defs=catalog}={}){
 return public2026BatchPercentiles({
  schoolIds:ids,metrics:rows,catalog:defs,verifiedLevel:level,
  reviewedEarlySchoolIds:new Set(early)
 });
}
const plain=object=>({...object});

test('Stage35 regression: verified Lv2 sees 7h-approved percentile only after independent same-school RPC',()=>{
 assert.deepEqual(plain(project()),{[id(1)]:75});
 assert.deepEqual(plain(project({early:[]})),{});
 assert.deepEqual(plain(project({level:1})),{});
 assert.deepEqual(plain(project({level:1,early:[id(1)]})),{});
 assert.deepEqual(plain(project({level:3})),{},'Lv3 is not a valid participation-level session');
 assert.deepEqual(plain(project({rows:[metric(1,5.9)]})),{},'cannot bypass verified six-hour delay');
 assert.deepEqual(plain(project({rows:[metric(1,2)]})),{},'not even Lv2 with a copied 2h approval');
});

test('Stage35: Lv1 uses exactly the independently approved 24h rule (no early bypass)',()=>{
 const rows=[metric(1,26)];
 assert.deepEqual(plain(project({level:1,rows,early:[]})),{[id(1)]:75});
 assert.deepEqual(plain(project({level:2,rows,early:[]})),{[id(1)]:75});
 assert.deepEqual(plain(project({level:1,rows:[metric(1,23.9)],early:[id(1)]})),{});
 assert.deepEqual(plain(project({level:2,rows:[metric(1,23.9)],early:[]})),{});
 assert.deepEqual(plain(project({level:2,rows:[metric(1,23.9)],early:[id(1)]})),{[id(1)]:75});
});

test('Stage35: one school exact-review approval never unlocks another school, even within a 20-ID batch',()=>{
 const ids=[id(1),id(2),id(3)];
 const rows=[metric(1),metric(2),metric(3)];
 assert.deepEqual(plain(project({ids,rows,early:[id(2)]})),{[id(2)]:75});
 assert.deepEqual(plain(project({ids,rows,early:[id(20)]})),{});
 assert.deepEqual(plain(project({ids,rows,early:[]})),{});
 assert.deepEqual(plain(project({ids,rows,level:1,early:ids})),{});
});

test('Stage35: withdrawn approval, revoked privacy, incomplete independent review and unknown metrics fail closed',()=>{
 const risks=[
  {approval_status:'WITHHELD'},{privacy_status:'PENDING'},
  {identity_reviewed:false},{question_reviewed:false},
  {small_cell_reviewed:false},{differencing_reviewed:false},
  {approved_by:''},{approval_evidence:''},{approved_at:null},
  {access_level:2},{value:'101'},{value:'-1'},{value:'NaN'},
  {value:'unreviewed'},{question_id:'Q31'},
  {question_id:'Q51'},{question_id:'Q31_sensitive'},
  {survey_year:2025}
 ];
 for(const change of risks){
  const output=project({rows:[metric(1,7,'75',change)]});
  assert.deepEqual(plain(output),{},'misreviewed candidate: '+JSON.stringify(change));
 }
 assert.deepEqual(plain(project({defs:[{...catalog[0],verified:false}]})),{});
 assert.deepEqual(plain(project({defs:[{...catalog[0],label:'학교별 응답자 수'}]})),{});
});

test('Stage35: input shape enforces 1..20 unique authenticated school IDs, never 10k unaudited lookups',()=>{
 const rows=Array.from({length:10001},(_,i)=>metric(i+1,7,String((i+1)%101)));
 const ids=Array.from({length:20},(_,i)=>id(9982+i));
 assert.equal(rows.length,10001);
 const matched=plain(project({ids,rows,early:ids}));
 assert.equal(Object.keys(matched).length,20,'only the requested twenty IDs can be returned');
 assert.equal(matched[id(9982)],(9982%101));
 assert.equal(matched[id(10001)],(10001%101));
 for(const bad of [
  [],Array.from({length:21},(_,i)=>id(i+1)),
  [id(1),id(1)],['INVALID'],['a000001'],
  [null],['A000001?'],Array(10001).fill(id(1))
 ]){
  const result=public2026BatchPercentiles({
   schoolIds:bad,metrics:rows,catalog,verifiedLevel:2,
   reviewedEarlySchoolIds:new Set(ids)
  });
  assert.deepEqual(plain(result),{},'invalid IDs must be withheld');
 }
});

test('Stage35: one response, 13 answered items, skipped fields and valid zero are not treated as auth bypasses',()=>{
 // Survey answer counts are intentionally NOT an input to this projection.
 const approvedOneResponse=metric(1,7,'0');
 assert.deepEqual(plain(project({rows:[approvedOneResponse],early:[]})),{});
 assert.deepEqual(plain(project({rows:[approvedOneResponse]})),{[id(1)]:0});
 const partial={...approvedOneResponse,
  school_response_rows:1,Q31:'teacher-sensitive',Q51:'personal detail',
  raw_response:'personal detail',source_row_id:'private-row',
  visible_answer_count:13};
 const output=project({rows:[partial]});
 assert.deepEqual(plain(output),{[id(1)]:0});
 for(const key of ['school_response_rows','Q31','Q51','source_row_id','raw_response','visible_answer_count'])
  assert.equal(JSON.stringify(output).includes(key),false);
});

test('Stage35: Edge route uses verified session level, 6h independent reviewed IDs, and never browser tier claims',()=>{
 assert.match(edge,/public2026BatchPercentiles\(\{/);
 assert.match(edge,/verifiedLevel:Number\(session\.access_level\)>=2\?2:1/);
 assert.match(edge,/reviewedEarlySchoolIds:recentIds/);
 assert.match(edge,/beagu_2026_lv2_released_question_results/);
 assert.match(edge,/if\(Array\.isArray\(r\.data\)\)recentIds\.add\(r\.schoolId\)/);
 assert.match(edge,/if\(reviewed\.some\(r=>r\.error\)\)return send\(\{error:'APPROVED_RESULTS_UNAVAILABLE'\},503,origin\)/);
 assert.doesNotMatch(edge,/releaseMetrics\(\(metrics\.data\|\|\[\]\)\.filter\(\(m:any\)=>m\.school_id===id\),catalog\.data\|\|\[\],1,recentIds\.has\(id\)\)/);
 assert.doesNotMatch(edge,/body\.level|body\.tier|body\.isLv2|request\.tier/);
 assert.match(policy,/approved2026Lv2ReleaseIsOldEnough/);
 assert.match(client,/percentiles/);
});
