import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read=file=>fs.readFileSync(file,'utf8');
const sql=read('supabase/migrations/20261122022000_beagu_2026_one_response_review_scope.sql');
const html=read('admin.html');
const ui=read('js/beagu-2026-admin-review.js');
const edge=read('supabase/functions/beagu-2026-review-admin/index.ts');
const release=read('supabase/migrations/20261120213000_beagu_2026_publication_basis_fail_closed.sql');
const lv2=read('supabase/migrations/20261121100000_beagu_2026_lv2_immediate_approved.sql');

assert.match(sql,/CREATE OR REPLACE FUNCTION public\.beagu_2026_admin_review_queue\(/i);
assert.match(sql,/CREATE OR REPLACE FUNCTION public\.beagu_2026_admin_pipeline_status\(/i);
assert.match(sql,/p_filter='single' and r\.school_response_rows=1/);
assert.match(sql,/p_filter='single_technical' and r\.school_response_rows=1[\s\S]*?technical_status='TECHNICAL_CHECK_PASSED'/);
assert.match(sql,/p_filter='awaiting_basis' and r\.school_response_rows>=1[\s\S]*?review_status='VERIFIED'/);
assert.match(sql,/'single_technical_pass'/);
assert.match(sql,/'single_technical_review_needed'/);
assert.match(sql,/'one_response_review_policy','ONE_OR_MORE_NO_AUTOMATIC_N5_REJECTION'/);
assert.match(sql,/'single_school_release_rule','VERIFIED_BASIS_AND_SNAPSHOT_APPROVAL_REQUIRED'/);
// This migration changes review-only queries. It can never approve a survey.
assert.doesNotMatch(sql,/\b(?:insert\s+into|update\s+(?:public|beagu_private)\.|delete\s+from|drop\s+table|truncate\s+table|cron\.schedule)\b/i);
assert.doesNotMatch(sql,/\b(?:set\s+approval_status\s*=\s*'APPROVED'|set\s+review_status\s*=\s*'VERIFIED')\b/i);
assert.match(sql,/REVOKE ALL ON FUNCTION public\.beagu_2026_admin_review_queue\(text,integer,integer\) FROM public,anon,authenticated/);
assert.match(sql,/REVOKE ALL ON FUNCTION public\.beagu_2026_admin_pipeline_status\(\) FROM public,anon,authenticated/);

for(const [value,label] of [
 ['single','응답 1건 학교 · 전체'],
 ['single_technical','응답 1건 학교 · 기술검사 통과'],
 ['awaiting_basis','기술검사 통과 · 공개 근거 검토 대기']
]){
 assert.ok(html.includes('<option value="'+value+'">'+label+'</option>'));
 assert.ok(edge.includes('"'+value+'"'));
}
for(const id of ['adminPipelineSingle','adminPipelineSingleTechnical','adminPipelineSingleReview']){
 assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(ui,new RegExp('setCount\\("'+id+'"'));
}
assert.match(html,/응답 수 1건인 학교도 검토할 수 있지만/);
assert.match(html,/동의·적법 근거·재식별 위험 검수와 최종 승인을 생략하지 않습니다/);
assert.match(html,/기술검사 통과만으로 공개되지 않습니다/);
assert.doesNotMatch(ui,/\bpublish\(|\bapproveResults\(/);
assert.match(release,/review_status='VERIFIED'/);
assert.match(release,/beagu_admin_active_mfa_session/);
assert.match(release,/p_evidence->>'decision'<>'APPROVE_EXACT_SNAPSHOT'/);
assert.match(release,/approved_at <= now\(\)-interval '24 hours'/);
assert.match(lv2,/review_status='VERIFIED'/);
assert.match(lv2,/r\.approval_status='APPROVED'/);
assert.doesNotMatch(sql,/school_response_rows\s*>?=\s*5/);
new vm.Script(ui);
console.log('PASS: 2026 single-response reviewer filters and metrics without automatic public release or consent bypass');
