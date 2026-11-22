import {existsSync, readFileSync} from "node:fs";
import {pathToFileURL} from "node:url";

// Stage38 REVIEW-ONLY local source check, without accessing live Supabase.
// A CI-green frontend/package DOES NOT prove this backend is safe to deploy.
// The isolated staging Edge Function currently includes Lv3 ownership logic
// that is absent in the production-matching GitHub index.ts. Deploying the
// unmerged source to staging would silently regress those features.
const sources={
  index:"supabase/functions/beagu-level-api/index.ts",
  policy:"supabase/functions/_shared/release-policy.mjs",
  ownership:"supabase/functions/_shared/postit-member-ownership.mjs",
  memberTier:"supabase/functions/_shared/member-tier-v1.mjs"
};
const load = path => existsSync(path)?readFileSync(path,"utf8"):null;
export function reviewBackendSources({
  index,policy,ownership,memberTier
}={}) {
  const required=[
    ["edge-index-present",typeof index==="string"&&index.length>0],
    ["staging-only-origin",typeof index==="string"&&
      index.includes("http://127.0.0.1:8000")&&
      !index.includes("'https://baeguindex.com'")&&
      !index.includes("'https://www.baeguindex.com'")],
    ["lv3-member-import",typeof index==="string"&&
      /from\s+['"]\.\.\/_shared\/member-tier-v1\.mjs['"]/.test(index)],
    ["postit-ownership-import",typeof index==="string"&&
      /from\s+['"]\.\.\/_shared\/postit-member-ownership\.mjs['"]/.test(index)],
    ["lv3-verified-member-path",typeof index==="string"&&
      /verifiedMemberTier\s*\(/.test(index)&&
      /admin\.auth\.getUser\s*\(/.test(index)&&
      /isVerifiedLv3Member\s*\(/.test(index)],
    ["postit-member-scope",typeof index==="string"&&
      /beagu_postit_member_accounts/.test(index)&&
      /identity_visitor_id/.test(index)],
    ["live-lv2-referral-recheck",typeof index==="string"&&
      /beagu_has_earned_challenge_visitor/.test(index)],
    ["snapshot-policy-import",typeof index==="string"&&
      /canSortRankedSchools/.test(index)&&
      /canUse2026TierSnapshot/.test(index)],
    ["release-policy-with-staging-gates",typeof policy==="string"&&
      /export\s+(?:function|const)\s+canSortRankedSchools/.test(policy)&&
      /export\s+(?:function|const)\s+canUse2026TierSnapshot/.test(policy)],
    ["postit-ownership-shared-module",typeof ownership==="string"&&
      /eligiblePostitAuthUser/.test(ownership)],
    ["lv3-member-tier-shared-module",typeof memberTier==="string"&&
      /isVerifiedLv3Member/.test(memberTier)]
  ];
  const missing=required.filter(([,value])=>!value).map(([name])=>name);
  return Object.freeze({
    status:missing.length?"NO_GO_STAGING_EDGE_REGRESSION_RISK":"REVIEW_READY_NOT_DEPLOY_AUTHORIZED",
    missing,
    inspected:required.length,
    passed:required.length-missing.length
  });
}
export function reviewRepositoryCandidate() {
  return reviewBackendSources({
    index:load(sources.index),
    policy:load(sources.policy),
    ownership:load(sources.ownership),
    memberTier:load(sources.memberTier)
  });
}
const launched=process.argv[1]&&
  import.meta.url===pathToFileURL(process.argv[1]).href;
if(launched) {
  if(process.argv.length!==3 ||
    !["--audit","--require-stage-parity"].includes(process.argv[2])) {
    process.stderr.write("USAGE: node scripts/release-manager/stage38-backend-source-gate.mjs --audit|--require-stage-parity\n");
    process.exitCode=2;
  }else{
    const result=reviewRepositoryCandidate();
    process.stdout.write(JSON.stringify(result)+"\n");
    // Even a fully matching source only becomes REVIEW_READY, not approved
    // or deployed. Separate operator approval and live Edge E2E are required.
    if(process.argv[2]==="--require-stage-parity"&&result.missing.length)
      process.exitCode=3;
  }
}
