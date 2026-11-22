// Validate that every path to production release is closed without
// independent, SHA-bound CI proof. These static checks complement unit tests.
import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const edge=readFileSync("supabase/functions/beagu-release-manager-v1/index.ts","utf8");
const proof=readFileSync("supabase/functions/beagu-release-manager-v1/release-ci-proof.mjs","utf8");
const ui=readFileSync("js/beagu-admin-updates-v1.js","utf8");
test("actual production HTTP prod_apply requires owner AAL2 AND server CI",()=>{
 assert.match(edge,/async function owner\(token:string\)/);
 assert.match(edge,/beagu_admin_active_mfa_session/);
 assert.match(edge,/if\(action==="prod_apply"\)/);
 assert.match(edge,/const verified=await productionProof\(s\.staging_sha,s\.staging_version\|\|""\)/);
 assert.match(edge,/if\(!verified\.ok\)return error\(verified\.code\|\|"release_ci_evidence_required"/);
 const apply=edge.indexOf('}else if(action==="prod_apply"){');
 const verify=edge.indexOf("const verified=await productionProof(s.staging_sha");
 const enqueue=edge.indexOf("const queued=await enqueue(job);");
 assert(apply>0&&verify>apply&&enqueue>verify);
});
test("signed production worker rechecks proof before queued job CLAIM",()=>{
 const idx=edge.indexOf('if(action==="worker_next"){');
 const auto=edge.indexOf('if(!job&&!s.production_sha)',idx);
 const check=edge.indexOf('const verified=await productionProof(String(job.to_sha||"")',idx);
 const claim=edge.indexOf('.update({status:"running",started_at',idx);
 assert(idx>0&&auto>idx&&check>auto&&claim>check,
  "CI gating must run before the worker can claim a production release");
 assert.match(edge,/if\(job\?\.target==="production"&&job\.action!=="prod_rollback"\)/);
});
test("automatic production bootstrap and public-data refresh cannot enqueue",()=>{
 assert.match(edge,/release_bootstrap_ci_required/);
 assert.match(edge,/release_data_refresh_ci_required/);
 assert.doesNotMatch(edge,/action:"bootstrap",target:"production"/);
 assert.doesNotMatch(edge,/action:"data_refresh",target:"production"/);
});
test("worker complete refuses previously running unverified production jobs",()=>{
 const start=edge.indexOf('if(action==="worker_complete"||action==="worker_fail"){');
 const proofIndex=edge.indexOf('const verified=await productionProof(String(job.to_sha||"")',start);
 const commit=edge.indexOf('.update(update).eq("id",1)',start);
 assert(proofIndex>start&&commit>proofIndex);
 assert.match(edge,/if\(job\.target==="production"&&job\.action!=="prod_rollback"\)/);
});
test("staging SHA must correspond to real recorded staging deploy and current main",()=>{
 assert.match(edge,/\.eq\("action","stage_apply"\)\.eq\("to_sha",sha\)/);
 assert.match(edge,/stage\.version!==version/);
 assert.match(edge,/head\.sha!==sha/);
 assert.match(proof,/run\.head_branch==="main"/);
 assert.match(proof,/run\.head_sha===sha/);
});
test("no caller-controlled run ID or boolean accepted by release proof",()=>{
 assert.doesNotMatch(proof,/input\.run_id/);
 assert.doesNotMatch(proof,/confirmed_tested/);
 assert.match(edge,/if\(input\.confirmed_tested!==true\)/);
 assert.match(proof,/ci_attestation_missing/);
 assert.match(proof,/ci_duplicate_workflow_proof/);
 assert.match(proof,/ci_github_unavailable/);
});
test("emergency rollback remains a separate explicitly owner-approved action",()=>{
 assert.match(edge,/action==="prod_rollback"/);
 assert.match(edge,/const userId=await owner\(jwt\)/);
 assert.match(edge,/if\(job\.target==="production"&&job\.action!=="prod_rollback"\)/);
});
test("the existing release center never contains service-role credentials or pushes a deployment itself",()=>{
 assert.match(ui,/request\(action,action==="prod_apply"\?\{confirmed_tested:true\}:\{\}\)/);
 assert.doesNotMatch(ui,/SUPABASE_SERVICE_ROLE_KEY/);
 assert.doesNotMatch(ui,/github_pat|GITHUB_TOKEN/i);
 assert.doesNotMatch(ui,/deploy-pages|workflow_dispatch/);
});
