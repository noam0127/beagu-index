import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";

const read=p=>readFileSync(p,"utf8");
const level=read("supabase/functions/beagu-level-api/index.ts");
const referral=read("supabase/functions/beagu-referral-link-v1/index.ts");
const ingest=read("supabase/functions/beagu-2026-participation-ingest-v1/index.ts");
const migration=read("supabase/migrations/20261121235500_beagu_2026_verified_code_levels_v1.sql");
const card=read("js/challenge-referral-v1.js");
const quality=read("supabase/functions/beagu-referral-ingest-v1/index.ts");

test("original 2026 code is preserved, not reassigned or mutated",()=>{
 assert.match(migration,/select c\.visitor_id[\s\S]*?c\.identity_code=p_code/);
 assert.match(migration,/challenge_identity_codes/);
 assert.doesNotMatch(migration,/\bupdate\s+beagu_private\.challenge_identity_codes\b/i);
 assert.doesNotMatch(migration,/\balter\s+table\s+.*challenge_identity_codes\s+.*identity_code/i);
 assert.doesNotMatch(migration,/\bupdate\s+public\.beagu_level_codes\b/i);
 assert.match(card,/same|그대로 유지|번호는 그대로/);
});
test("known unverified 2026 code cannot fall back to historical Lv1 credential",()=>{
 const look=level.indexOf("'beagu_2026_verified_code_level_v1'");
 const legacy=level.indexOf(".from('beagu_level_codes')");
 assert.ok(look>0&&legacy>look);
 assert.match(level,/const known=verified\?\.known===true/);
 assert.match(level,/if\(!visitorId\|\|!\[1,2\]\.includes\(level\)\)/);
 assert.match(level,/return send\(\{error:'INVALID_CODE'\},401,origin\)/);
 assert.match(migration,/verified_code_level_v1/);
});
test("both tier eligibility and session restore require verified own survey participation",()=>{
 assert.match(migration,/v\.verification_status='approved'/);
 assert.match(migration,/when p_visitor is null or not exists\(/);
 assert.match(level,/beagu_2026_verified_visitor_level_v1/);
 assert.match(level,/if\(verifiedError\|\|!\[1,2\]\.includes\(level\)\)return null/);
 assert.match(level,/\.update\(\{access_level:level\}\)/);
 assert.match(level,/identity_campaign='2026'/);
});
test("earned Lv2 requires credited event, quality gate and unchanged referral hash",()=>{
 for(const text of [
  "p.valid_referrals>=1","p.upgraded_at is not null",
  "p.disabled=false","e.decision='credited'",
  "e.referral_token_sha256=p.referral_token_sha256",
  "q.quality_status='MANUALLY_APPROVED'",
  "q.quality_status='AUTO_PASS' and q.form_quality_attested=true"
 ])assert.ok(migration.includes(text),text);
 assert.match(migration,/create or replace function public\.beagu_has_earned_challenge_visitor/);
 assert.match(migration,/create or replace function public\.beagu_earned_challenge_visitor/);
});
test("referral API never upgrades from a bare profile-level hint",()=>{
 assert.match(referral,/beagu_2026_verified_visitor_level_v1/);
 assert.match(referral,/tier>=1/);
 assert.match(referral,/provisional: tier===2/);
 assert.match(referral,/ownResponseVerified: tier>=1/);
 assert.doesNotMatch(referral,/Number\(enrollment\?\.level\) === 2 &&/);
 assert.match(referral,/beagu_issue_challenge_identity_bound/);
});
test("only server-to-server worker can attest approved 2026 responses",()=>{
 assert.match(ingest,/BEAGU_2026_PARTICIPATION_INGEST_ENABLED/);
 assert.match(ingest,/BEAGU_2026_PARTICIPATION_INGEST_SECRET/);
 assert.match(ingest,/req\.headers\.has\("origin"\)/);
 assert.match(ingest,/validSecret\(given\)/);
 assert.match(ingest,/hmacSource\(sourceRowId\)/);
 assert.match(ingest,/body\.surveyYear!==2026/);
 assert.match(ingest,/body\.formSubmitted!==true\|\|body\.sourceValidated!==true/);
 assert.match(ingest,/beagu_2026_record_verified_response_v1/);
 assert.doesNotMatch(ingest,/console\.log|console\.error|rawAnswers|user_metadata/);
 assert.doesNotMatch(ingest,/Access-Control-Allow-Origin/);
});
test("verified evidence is nonpublic; synthetic tests and no auto-approval backfill",()=>{
 assert.match(migration,/enable row level security/g);
 assert.match(migration,/revoke all on beagu_private\.challenge_2026_verified_responses_v1/);
 assert.match(migration,/revoke all on function public\.beagu_2026_verified_code_level_v1/);
 assert.match(migration,/grant execute on function public\.beagu_2026_verified_code_level_v1[\s\S]*?to service_role/);
 assert.match(migration,/source_evidence_hmac text not null unique/);
 assert.match(migration,/verification_status in \('approved','revoked','review_required'\)/);
 assert.doesNotMatch(migration,/insert into beagu_private\.challenge_2026_verified_responses_v1[\s\S]*?select\s+\*/i);
});
test("UI reports Lv1 only from server own-response verification, Lv2 only after valid credit",()=>{
 assert.match(card,/payload\.ownResponseVerified === true/);
 assert.match(card,/Number\(payload\.level\) === 2/);
 assert.match(card,/Number\(payload\.validReferrals\) >= 1/);
 assert.match(card,/identityTitle\.textContent = upgraded \? 'Lv2 참여코드'/);
 assert.match(card,/ownResponseVerified \? 'Lv2 참여코드\\(비활성\\)'/);
 assert.match(card,/Lv\\.1 인증 가능/);
 assert.match(card,/previousTier !== nextTier/);
 assert.match(card,/unknownVerification/);
 assert.match(card,/인증 대기/);
});
test("existing independent public/reviewed 2026 data release and Google Form fraud gate preserved",()=>{
 assert.match(level,/beagu_2026_lv2_released_question_results/);
 assert.match(level,/beagu_consume_login_budget/);
 assert.match(quality,/beagu_referral_credit_quality_gate/);
 assert.doesNotMatch(quality,/\.rpc\('beagu_referral_credit',/);
 assert.match(level,/beagu_release_metrics_v2/);
});
