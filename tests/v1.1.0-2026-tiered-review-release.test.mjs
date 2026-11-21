import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
 releaseMetrics,approved2026ReleaseIsOldEnough,
 approved2026Lv2ReleaseIsOldEnough
} from '../supabase/functions/_shared/release-policy.mjs';
import {catalog as questionCatalog} from '../supabase/functions/_shared/questionnaire-2026.mjs';
import {publicQuestionResults} from '../supabase/functions/_shared/results-2026.mjs';

const read=p=>fs.readFileSync(p,'utf8');
const sql=read('supabase/migrations/20261122003000_beagu_2026_tiered_review_release_v1.sql');
const edge=read('supabase/functions/beagu-2026-tiered-results-v1/index.ts');
const legacy=read('supabase/functions/beagu-level-api/index.ts');
const timing=read('supabase/functions/_shared/release-policy.mjs');
const row={
 school_id:'A000003',survey_year:2026,question_id:'Q20',access_level:2,
 value:'66',release_version:'reviewed-1',approval_status:'APPROVED',
 privacy_status:'PASSED',identity_reviewed:true,question_reviewed:true,
 small_cell_reviewed:true,differencing_reviewed:true,
 approved_at:new Date(Date.now()-2*60*60*1000).toISOString(),
 approved_by:'owner',approval_evidence:'exact reviewed snapshot'
};
const metricCatalog=[{
 survey_year:2026,question_id:'Q20',access_level:2,verified:true,
 label:'Approved closed test metric',value_type:'number',minimum:0,
 maximum:100,unit:'점',meaning:'test metric',interpretation:'test metric',
 direction:'higher',spatial_scope:'school'
}];
test('Lv1 waits 24 hours, Lv2 waits 6 hours and never trusts bare boolean override',()=>{
 assert.equal(approved2026ReleaseIsOldEnough(row.approved_at),false);
 assert.equal(approved2026Lv2ReleaseIsOldEnough(row.approved_at),false);
 assert.equal(releaseMetrics([row],metricCatalog,2,true).length,0);
 const seven={...row,approved_at:new Date(Date.now()-7*60*60*1000).toISOString()};
 assert.equal(approved2026Lv2ReleaseIsOldEnough(seven.approved_at),true);
 assert.equal(releaseMetrics([seven],metricCatalog,2,true).length,1);
 assert.equal(releaseMetrics([seven],metricCatalog,2,false).length,0);
 assert.equal(releaseMetrics([seven],metricCatalog,1,true).length,0);
 const day={...row,approved_at:new Date(Date.now()-25*60*60*1000).toISOString()};
 assert.equal(releaseMetrics([day],metricCatalog,2,false).length,1);
 assert.equal(releaseMetrics([day],metricCatalog,1,true).length,0,'Lv1 may not access Lv2-only metric');
});
test('2026 reviewed release SQL encodes exact post-approval tier delays with no time-only release',()=>{
 for(const needle of [
  "when 1 then interval '24 hours'",
  "when 2 then interval '6 hours'",
  "else interval '0 hours'",
  "r.approved_at<=now()",
  "r.approved_at>=r.updated_at",
  "r.approval_status='APPROVED'",
  "r.approved_payload_sha256=r.payload_sha256",
  "r.school_match_status='EXACT_REGION_OFFICE_NAME'",
  "r.approval_evidence->>'decision'='APPROVE_EXACT_SNAPSHOT'",
  "b.review_status='VERIFIED'",
  "b.payload_sha256=r.payload_sha256",
  "b.reviewed_at>=r.source_snapshot_at",
  "b.notice_effective_at<=r.source_snapshot_at",
  "b.distinct_respondents_reviewed is true",
  "b.personal_data_reviewed is true",
  "b.small_sample_reviewed is true",
  "b.reidentification_reviewed is true",
  "b.prior_data_combination_reviewed is true"
 ])assert.ok(sql.includes(needle),'missing exact review predicate: '+needle);
 assert.match(sql,/q\.value->>'id' not in \('Q31','Q51'\)/);
 assert.match(sql,/approved_at <= now\(\) - case p_level/);
});
test('previous direct Lv2 immediate RPC now delegates to 6h gate, not to old insecure code',()=>{
 assert.match(sql,/create or replace function public\.beagu_2026_lv2_released_question_results/);
 assert.match(sql,/public\.beagu_2026_tiered_released_question_results_v1\(\s*p_school_id,2::smallint/);
 assert.match(legacy,/beagu_2026_lv2_released_question_results/);
 assert.match(legacy,/releaseMetrics\(metrics\.data\|\|\[\],catalog\.data\|\|\[\],level,level>=2&&lv2Approved2026!==null\)/);
 assert.match(timing,/approved2026Lv2ReleaseIsOldEnough/);
 assert.match(timing,/level===2 && approvedLv2Instant2026/);
});
test('public callable roles cannot bypass server-owned review or supply arbitrary tier',()=>{
 assert.match(sql,/revoke all on function\s+public\.beagu_2026_tiered_released_question_results_v1\(text,smallint\)\s+from public,anon,authenticated/);
 assert.match(sql,/grant execute on function\s+public\.beagu_2026_tiered_released_question_results_v1\(text,smallint\)\s+to service_role/);
 assert.match(edge,/beagu_2026_verified_visitor_level_v1/);
 assert.match(edge,/session\.identity_campaign!=="2026"/);
 assert.match(edge,/!\[1,2\]\.includes\(level\)/);
 assert.match(edge,/if\(tier===2&&await verifyLv3\(req,member\.visitor\)/);
 assert.match(edge,/beagu_lv3_verify_session_v1/);
 assert.match(edge,/beagu_member_live_session_v1/);
 assert.match(edge,/db\.auth\.getUser\(access\[1\]\)/);
 assert.match(edge,/beagu_2026_tiered_released_question_results_v1/);
 assert.doesNotMatch(edge,/input\.tier|input\.level|body\.level|request\.tier|raw_user_meta_data|user_metadata/);
});
test('Q31/Q51 and raw counts, identities, free answers never serialize from the public tiered Edge API',()=>{
 for(const label of ['publicQuestionResults(data)','questions:safe',
  'status:"not_published"','"Cache-Control":"private,no-store"','"Referrer-Policy":"no-referrer"'])
  assert.ok(edge.includes(label),label);
 assert.doesNotMatch(edge,/return answer\([^)]*,\{[^}]*questions:data/);
 assert.doesNotMatch(edge,/console\.log|console\.error|Access-Control-Allow-Origin":\s*"\*"/);
 const ordinary=questionCatalog.Q01;
 const options=ordinary.options;
 const q=[{id:'Q01',row:-1,valid:1,invalid:0,counts:options.map((_,i)=>i===1?1:0),minutes_sum:0},
  {id:'Q31',row:-1,valid:1,invalid:0,counts:[1,0],minutes_sum:0},
  {id:'Q51',row:-1,valid:1,invalid:0,counts:[1,0],minutes_sum:0}];
 const out=publicQuestionResults(q);
 assert.equal(out.length,1);
 assert.equal(out[0].questionId,'Q01');
 assert.equal(JSON.stringify(out).includes('"counts"'),false);
 assert.equal(JSON.stringify(out).includes('Q51'),false);
 assert.equal(JSON.stringify(out).includes('Q31'),false);
});
test('Lv3 cannot be spoofed from HTML badge or Auth account alone',()=>{
 assert.match(edge,/X-Beagu-Lv3-Token/);
 assert.match(edge,/Authorization/);
 assert.match(edge,/X-Beagu-Level-Session/);
 assert.match(edge,/beagu_member_live_session_v1/);
 assert.match(edge,/beagu_lv3_verify_session_v1/);
 assert.match(edge,/levelError\|\|!\[1,2\]\.includes\(level\)/);
 assert.match(edge,/if\(tier===2&&await verifyLv3/);
 assert.doesNotMatch(edge,/dataset\.memberLevel|window\.BeaguLv3AccountUI|document\.getElementById/);
});
test('Lv3 and Lv2 early access still requires exact independent legal/privacy and sample review',()=>{
 assert.match(sql,/basis_type in \(\s*'EXPLICIT_RESPONDENT_CONSENT',\s*'OTHER_DOCUMENTED_LEGAL_BASIS'/);
 assert.match(sql,/notice_digest_sha256 ~ '\^\[a-f0-9\]\{64\}\$'/);
 assert.match(sql,/reviewer_user_id::text=r\.approved_by/);
 assert.ok(sql.includes("coalesce(q->>'invalid','') !~ '^[0-9]+$'"),'Malformed or missing invalid counts must not pass');
 assert.ok(!sql.includes('grant select on public.beagu_2026_results_snapshot to anon'));
 assert.ok(!sql.includes('grant select on beagu_private.beagu_2026_publication_basis_review to authenticated'));
});
