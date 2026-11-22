import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {reviewBackendSources,reviewRepositoryCandidate} from
  "../scripts/release-manager/stage38-backend-source-gate.mjs";

// Review-only fixtures: never contact Supabase, GitHub/Vercel APIs or log
// secrets. A "review ready" result does not confirm any live API deployment.
const stageFixture={
 index: [
  "import {isVerifiedLv3Member} from '../_shared/member-tier-v1.mjs';",
  "import {eligiblePostitAuthUser} from '../_shared/postit-member-ownership.mjs';",
  "import {canSortRankedSchools,canUse2026TierSnapshot} from '../_shared/release-policy.mjs';",
  "const allowed=new Set(['http://127.0.0.1:8000','http://localhost:8000']);",
  "async function verifiedMemberTier(req,session) {",
  "const user=await admin.auth.getUser('synthetic');",
  "const member=await admin.from('beagu_postit_member_accounts').select('identity_visitor_id');",
  "return isVerifiedLv3Member(session,user,member,eligiblePostitAuthUser);",
  "}",
  "const earned=await admin.rpc('beagu_has_earned_challenge_visitor');"
 ].join("\n"),
 policy:"export const canSortRankedSchools = ()=>true;\nexport function canUse2026TierSnapshot(){}",
 ownership:"export const eligiblePostitAuthUser = ()=>true;",
 memberTier:"export const isVerifiedLv3Member = ()=>true;"
};

test("current PR source matches production baseline but is NOT safe to overwrite staging Lv3",()=>{
 const repo=reviewRepositoryCandidate();
 assert.equal(repo.status,"NO_GO_STAGING_EDGE_REGRESSION_RISK");
 assert.ok(repo.missing.length>=6);
 for(const mustFail of [
  "staging-only-origin","lv3-member-import","postit-ownership-import",
  "lv3-verified-member-path","release-policy-with-staging-gates",
  "postit-ownership-shared-module","lv3-member-tier-shared-module"
 ]) assert.ok(repo.missing.includes(mustFail),mustFail);
 assert.ok(!repo.missing.includes("edge-index-present"));
 assert.ok(!repo.missing.includes("live-lv2-referral-recheck"));
 const template=readFileSync("docs/releases/templates/stage38-approved-vercel-preview.yml","utf8");
 assert.doesNotMatch(template,/supabase\s+functions\s+deploy|supabase\s+db\s+(push|reset)/i,
  "Staging Vercel preview template must never deploy an Edge Function or DB");
});
test("a synthetic candidate with all existing staging features is review-ready, not deployed",()=>{
 const result=reviewBackendSources(stageFixture);
 assert.equal(result.status,"REVIEW_READY_NOT_DEPLOY_AUTHORIZED");
 assert.deepEqual(result.missing,[]);
 assert.equal(result.passed,result.inspected);
});
test("staging Lv3 import, ownership helper, policy and access isolation cannot regress",()=>{
 for(const [field,changed,rejected] of [
  ["index",stageFixture.index.replace("'../_shared/member-tier-v1.mjs'","'../_shared/lost-member-tier-v1.mjs'"),"lv3-member-import"],
  ["index",stageFixture.index.replace("verifiedMemberTier","verifiedNoLongerMemberTier"),"lv3-verified-member-path"],
  ["index",stageFixture.index.replace("beagu_postit_member_accounts","not_a_real_member_table"),"postit-member-scope"],
  ["index",stageFixture.index.replace("beagu_has_earned_challenge_visitor","skipped_referral_check"),"live-lv2-referral-recheck"],
  ["index",stageFixture.index.replace("canUse2026TierSnapshot","noSnapshotSecurityGate"),"snapshot-policy-import"],
  ["index",stageFixture.index.replace("http://127.0.0.1:8000","https://baeguindex.com"),"staging-only-origin"],
  ["policy",stageFixture.policy.replace("canUse2026TierSnapshot","snapshotOpen"),"release-policy-with-staging-gates"],
  ["ownership",null,"postit-ownership-shared-module"],
  ["memberTier",null,"lv3-member-tier-shared-module"]
 ]){
  const candidate={...stageFixture,[field]:changed};
  const result=reviewBackendSources(candidate);
  assert.equal(result.status,"NO_GO_STAGING_EDGE_REGRESSION_RISK");
  assert.ok(result.missing.includes(rejected),rejected);
 }
});
test("production-facing origin in staging source is always rejected",()=>{
 for(const origin of ["'https://baeguindex.com'","'https://www.baeguindex.com'"]) {
  const result=reviewBackendSources({
   ...stageFixture,index:stageFixture.index+"\nconst crossOrigin="+origin+";"
  });
  assert.ok(result.missing.includes("staging-only-origin"));
 }
});
test("this check is not a substitute for actual test-project API availability",()=>{
 const src=readFileSync("scripts/release-manager/stage38-backend-source-gate.mjs","utf8");
 assert.match(src,/REVIEW_READY_NOT_DEPLOY_AUTHORIZED/);
 assert.doesNotMatch(src,/https:\/\/.*supabase\.co\/functions/);
 assert.doesNotMatch(src,/service_role_key|SUPABASE_SERVICE_ROLE_KEY/);
});
console.log("PASS: Stage38 source drift gate detects accidental overwrite of staging Lv3 with production-baseline Edge code.");
