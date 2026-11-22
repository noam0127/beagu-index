"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const {evaluate,parseRow,STAGE_REF}=require("../scripts/staging/check-auth-readiness.cjs");
const sql=fs.readFileSync("scripts/staging/auth-readiness.sql","utf8");
assert.match(sql,/SELECT\s+[\s\S]*auth\.users[\s\S]*beagu_private\.challenge_referral_profiles/i);
assert.doesNotMatch(sql,/\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|CREATE|DROP|GRANT|REVOKE)\s+(?:INTO|FROM|ON|TABLE|FUNCTION|VIEW|SCHEMA|ROLE|POLICY)/i);
assert.match(sql,/owner_with_verified_mfa/);
assert.doesNotMatch(sql,/email\s+AS|phone\s+AS|raw_user_meta_data\s+AS/i);
const allZero={stage_ref:STAGE_REF,auth_users:0,confirmed_users:0,
 verified_mfa_factors:0,enabled_owners:0,owner_with_verified_mfa:0,
 active_level_codes:0,referral_profiles:0,earned_lv2_profiles:0,
 linked_member_accounts:0};
const blocked=evaluate(allZero);
assert.equal(blocked.stage_ready_for_manual_e2e,false);
assert.deepEqual(blocked.checks.filter(c=>!c.ready).map(c=>c.id),[
 "email_auth_prerequisite","lv1_code_prerequisite","lv2_referral_prerequisite",
 "admin_owner_prerequisite","owner_mfa_prerequisite"
]);
assert.equal(blocked.real_email_or_mfa_e2e_performed,false);
assert.equal(blocked.production_release_authorized,false);
assert(!JSON.stringify(blocked).includes("password"));
const ready={...allZero,auth_users:2,confirmed_users:2,verified_mfa_factors:1,
 enabled_owners:1,owner_with_verified_mfa:1,active_level_codes:1,
 referral_profiles:1,earned_lv2_profiles:1,linked_member_accounts:1};
const result=evaluate([ready]);
assert.equal(result.stage_ready_for_manual_e2e,true);
assert.equal(result.real_email_or_mfa_e2e_performed,false);
assert.equal(result.production_release_authorized,false);
for(const key of ["auth_users","confirmed_users","verified_mfa_factors",
 "enabled_owners","owner_with_verified_mfa","active_level_codes",
 "referral_profiles","earned_lv2_profiles","linked_member_accounts"]){
 const invalid={...ready,[key]:-1};
 assert.throws(()=>parseRow(invalid),/Invalid aggregate counter/);
}
assert.throws(()=>parseRow({...ready,stage_ref:"snvzwrexuqavnfvzgxqj"}),/staging project/);
assert.throws(()=>parseRow({...ready,confirmed_users:3}),/Inconsistent/);
assert.throws(()=>parseRow({...ready,owner_with_verified_mfa:2}),/Inconsistent/);
assert.throws(()=>parseRow({...ready,earned_lv2_profiles:2}),/Inconsistent/);
assert.throws(()=>parseRow([{...ready},{...ready}]),/One aggregate row/);
assert.equal(evaluate({...ready,owner_with_verified_mfa:0}).stage_ready_for_manual_e2e,false,
 "owner MFA must be linked to an enabled owner, not just any user");
assert.equal(evaluate({...ready,earned_lv2_profiles:0}).stage_ready_for_manual_e2e,false);
assert.equal(evaluate({...ready,auth_users:1,confirmed_users:0}).stage_ready_for_manual_e2e,false);
assert.equal(evaluate({...ready,active_level_codes:0}).stage_ready_for_manual_e2e,true,
 "earned referral profile can supply an Lv1 participation code");
assert.equal(evaluate({...ready,active_level_codes:0,referral_profiles:0,earned_lv2_profiles:0})
 .stage_ready_for_manual_e2e,false);
console.log("PASS: read-only stage auth inventory and fail-closed empty/MFA/Lv1/Lv2 gates");
console.log("PASS: even ready prerequisites never count as actual E2E or production release");
