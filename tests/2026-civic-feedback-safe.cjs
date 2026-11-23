const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const rd=p=>fs.readFileSync(p,"utf8");
const sql=rd("supabase/migrations/20261123190000_beagu_2026_civic_feedback.sql");
const api=rd("supabase/functions/beagu-2026-civic/index.ts");
const publicUI=rd("js/beagu-2026-civic-v1.js");
const adminUI=rd("js/beagu-2026-civic-admin-v1.js");
const adminLogin=rd("js/beagu-admin-access-v1.js");
new vm.Script(publicUI);new vm.Script(adminUI);new vm.Script(adminLogin);
for(const condition of [
 /beagu_private\.beagu_2026_civic_feedback/,
 /ENABLE ROW LEVEL SECURITY/,
 /REVOKE ALL ON beagu_private\.beagu_2026_civic_feedback FROM PUBLIC,anon,authenticated/,
 /GRANT SELECT,INSERT,UPDATE ON beagu_private\.beagu_2026_civic_feedback TO service_role/,
 /p_kind='CORRECTION_REQUEST'/,
 /p_visitor IS NULL/,
 /p_actor_hash/,
 /beagu_admin_active_mfa_session/,
 /role='owner'/,
 /feedback_audit/,
 /REVOKE ALL ON FUNCTION public\.beagu_2026_civic_submit/
])assert.match(sql,condition);
assert.doesNotMatch(sql,/UPDATE public\.survey_answers|UPDATE public\.survey_submissions/);
for(const guard of [
 /beagu_has_earned_challenge_visitor/,/s\.identity_campaign!=="2026"/,
 /identity_visitor_id/,/action==="status"/,/action!=="report"&&action!=="correct"/,
 /LV2_INDIVIDUAL_CODE_REQUIRED/,/OWNER_MFA_REQUIRED/,
 /claims\.aal!=="aal2"/,/beagu_admin_active_mfa_session/
])assert.match(api,guard);
assert.doesNotMatch(api,/from\("survey_answers"\)|update\(\{.*answer_value/);
assert.match(publicUI,/Lv\.2 답변 정정 요청/);
assert.match(publicUI,/원본 응답/);
assert.match(adminUI,/window\.BeaguCivicAdmin/);
assert.match(adminUI,/textContent=text/);
assert.match(adminLogin,/window\.BeaguCivicAdmin\?\.mount/);
assert.match(adminLogin,/window\.BeaguCivicAdmin\?\.reset/);
assert.match(rd("school-report.html"),/js\/beagu-2026-civic-v1\.js/);
assert.match(rd("admin.html"),/js\/beagu-2026-civic-admin-v1\.js/);
console.log("PASS: 2026 civic report + verified personal Lv2 correction request, MFA admin-only queue and privacy gates");
