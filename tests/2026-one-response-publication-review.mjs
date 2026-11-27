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

// The old review filters remain server-side; the current admin page uses
// explicit final edited data and civic reports, not the legacy school approval UI.
for(const value of ['single','single_technical','awaiting_basis']){
 assert.ok(edge.includes('"'+value+'"'));
}
for(const id of ['adminPipelineSingle','adminPipelineSingleTechnical','adminPipelineSingleReview']){
 assert.match(ui,new RegExp('setCount\\("'+id+'"'));
}
assert.doesNotMatch(html,/src="js\/beagu-2026-admin-review\.js/);
assert.match(html,/id="adminAuto2026" hidden/);
assert.match(html,/src="js\/beagu-2026-edited-admin-v1\.js/);
assert.match(html,/src="js\/beagu-2026-civic-admin-v1\.js/);
const edited=read('js/beagu-2026-edited-admin-v1.js');
const civic=read('js/beagu-2026-civic-admin-v1.js');
assert.match(edited,/owner=role==="owner";[^\n]*if\(!owner\)return/);
assert.match(edited,/action:"edited_2026_publish",confirmation:"FINAL_EDITED_FILE",table/);
assert.match(edited,/기존 공개중단은 유지됩니다/);
assert.match(edge,/if\(account\.role!=="owner"\)return send\(origin,403/);
assert.match(edge,/if\(input\.confirmation!=="FINAL_EDITED_FILE"\)return send\(origin,400/);
assert.match(edge,/beagu_admin_active_mfa_session/);
assert.match(civic,/owner=role==="owner";panel\.hidden=!owner/);
assert.match(civic,/c\.school_approval==="APPROVED"&&\(!c\.edited_file\|\|c\.edited_after_hold\)/);
assert.match(civic,/원본 설문이나 공개 수치는 자동 수정되지 않습니다/);
assert.doesNotMatch(ui,/\bpublish\(|\bapproveResults\(/);
assert.match(release,/review_status='VERIFIED'/);
assert.match(release,/beagu_admin_active_mfa_session/);
assert.match(release,/p_evidence->>'decision'<>'APPROVE_EXACT_SNAPSHOT'/);
assert.match(release,/approved_at <= now\(\)-interval '24 hours'/);
assert.match(lv2,/review_status='VERIFIED'/);
assert.match(lv2,/r\.approval_status='APPROVED'/);
assert.doesNotMatch(sql,/school_response_rows\s*>?=\s*5/);
new vm.Script(ui);
console.log('PASS: 2026 legacy review filters, current owner-only edited publication and civic hold safeguards');
