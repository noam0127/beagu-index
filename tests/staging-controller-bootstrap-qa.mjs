import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {
 validStagingCandidate,stageCandidateMatchesRef,productionCandidateLocked,
 shouldAutoRegisterMainDraft
} from "../supabase/functions/_shared/staging-release-candidate.mjs";

const rcSha="5c95aadad971901a8222f83c52e93bf901a3aeb7";
const rc={ref:"release/v1.1.0-rc.1",version:"v1.1.0-rc.1",sha:rcSha,summary:"고정 후보 시험 등록"};
const ref={ref:"refs/heads/"+rc.ref,object:{type:"commit",sha:rcSha}};
assert.equal(validStagingCandidate(rc),true);
assert.equal(stageCandidateMatchesRef(rc,ref),true);
assert.equal(stageCandidateMatchesRef(rc,{...ref,object:{type:"commit",sha:"a".repeat(40)}}),false);
assert.equal(stageCandidateMatchesRef(rc,{...ref,object:{type:"tag",sha:rcSha}}),false);
assert.equal(validStagingCandidate({...rc,ref:"main"}),false);
assert.equal(validStagingCandidate({...rc,sha:"../main"}),false);
assert.equal(validStagingCandidate({...rc,version:"v1.1.1"}),false);
assert.equal(productionCandidateLocked(rcSha,"이전 시험 버전"),true);
assert.equal(productionCandidateLocked("a".repeat(40),"v1.1.0-rc.2"),true);
assert.equal(shouldAutoRegisterMainDraft(rcSha,rcSha,rc.version),false);

// Regression matrix: fail closed on ref retargeting, malformed RCs and
// unexpected auto-registration of a new main commit over a pinned draft.
assert.equal(stageCandidateMatchesRef(rc,null),false);
assert.equal(stageCandidateMatchesRef(rc,{...ref,ref:"refs/heads/main"}),false);
assert.equal(stageCandidateMatchesRef(rc,{...ref,object:{type:"commit",sha:"0".repeat(40)}}),false);
assert.equal(validStagingCandidate({...rc,summary:"  "}),false);
assert.equal(validStagingCandidate({...rc,ref:"release/v1.1.0-rc.2"}),false);
assert.equal(validStagingCandidate({...rc,version:"v1.1.0-rc.0",ref:"release/v1.1.0-rc.0"}),false);
assert.equal(validStagingCandidate({...rc,sha:"A".repeat(40)}),false);
assert.equal(productionCandidateLocked(rcSha,"이전 시험 버전"),true);
assert.equal(productionCandidateLocked("b".repeat(40),"v1.1.0-rc.10"),true);
assert.equal(productionCandidateLocked("b".repeat(40),"1.1.0-qa"),false);
assert.equal(shouldAutoRegisterMainDraft(null,"b".repeat(40),"1.1.0-qa"),true);
assert.equal(shouldAutoRegisterMainDraft("b".repeat(40),"b".repeat(40),"1.1.0-qa"),true);
assert.equal(shouldAutoRegisterMainDraft("a".repeat(40),"b".repeat(40),"1.1.0-qa"),false);
assert.equal(shouldAutoRegisterMainDraft(null,"b".repeat(40),"v1.1.0-rc.1"),false);

await import("../js/beagu-release-progress-v1.js");
const status=globalThis.BeaguReleaseProgress.snapshot;
const job={status:"deployed",target:"staging",version:rc.version,to_sha:rcSha};
assert.equal(status(null,job,{staging_sha:rcSha}).completed,true);
assert.equal(status(null,job,{staging_sha:"a".repeat(40)}).completed,false);
assert.equal(status(null,job).completed,false);
assert.equal(status({ ...job,status:"running" },null,{staging_sha:rcSha}).indeterminate,true);
// Only a deployed job for the exact current SHA may show 100%.
assert.equal(status(null,null,{staging_sha:rcSha}).visible,false);
assert.equal(status({ ...job,status:"queued" },null,{staging_sha:rcSha}).completed,false);
assert.equal(status({ ...job,status:"failed" },null,{staging_sha:rcSha}).completed,false);
assert.equal(status(null,{...job,to_sha:"0".repeat(40)},{staging_sha:rcSha}).state,"superseded");
assert.equal(status(null,{...job,to_sha:"not-a-sha"},{staging_sha:"not-a-sha"}).completed,false);
assert.equal(status(null,{...job,target:"production"},{production_sha:rcSha}).completed,true);
assert.equal(status(null,{...job,target:"production"},{staging_sha:rcSha}).completed,false);

const api=readFileSync("supabase/functions/beagu-release-manager-v1/index.ts","utf8");
const client=readFileSync("js/beagu-admin-updates-v1.js","utf8");
const html=readFileSync("admin-updates.html","utf8");
assert.match(api,/c\?\.aal!=="aal2"/);
assert.match(api,/beagu_admin_active_mfa_session/);
assert.match(api,/if\(action==="register_stage_candidate"\)/);
assert.match(api,/validStagingCandidate\(candidate\)/);
assert.match(api,/stageCandidateMatchesRef\(candidate,remote\)/);
assert.match(api,/if\(isReleaseCandidateVersion\(candidateVersion\)\)/);
assert.match(api,/productionCandidateLocked\(s\.staging_sha,s\.staging_version\)/);
assert.match(api,/\.eq\("target","staging"\)\.eq\("to_sha",s\.staging_sha\)/);
assert.match(api,/release_candidate_production_locked/);
assert.match(api,/last_job:previousJob/);
// The release worker stays behind signed OIDC, and the HTTP admin surface
// stays behind a real owner session + active AAL2 verification.
assert.match(api,/if\(!userId\)return error\("admin_mfa_required",403,origin\)/);
assert.match(api,/if\(!\(await githubWorker\(jwt\)\)\)return error\("worker_auth_denied",403,origin\)/);
assert.match(api,/if\(action==="prod_apply"\)/);
assert.match(api,/if\(action==="prod_rollback"\)/);
assert.match(api,/if\(action==="stage_rollback"\)/);
assert.match(api,/confirmed_tested!==true/);
assert.match(api,/if\(rcLookupError\|\|priorRcs\?\.length\)/);
// The opt-in bootstrap workflow itself cannot run the production deploy worker.
const bootstrapWorkflow=readFileSync(".github/workflows/staging-controller-bootstrap-qa.yml","utf8");
assert.match(bootstrapWorkflow,/branches: \['hotfix\/v1\.1\.0-staging-controller-bootstrap'\]/);
assert.doesNotMatch(bootstrapWorkflow,/scripts\/release-manager\/worker\.py (?:next|build|complete)/);
assert.match(client,/register_stage_candidate/);
assert.match(client,/blockedRc/);
assert.match(client,/BeaguReleaseProgress\.snapshot\(job,data\.last_job,s\)/);
assert.match(html,/id="releaseCandidateRegister"/);
assert.match(html,/id="releaseProgressBar"/);
assert.match(html,/src="js\/beagu-release-progress-v1\.js/);
for(const path of ["js/beagu-admin-updates-v1.js","js/beagu-release-progress-v1.js"]){
 execFileSync(process.execPath,["--check",path]);
}
console.log("PASS: owner AAL2, staging-only pinned RC ref, production lock, current-SHA completion and UI scripts.");
console.log("RELEASE EFFECT: NONE. Bootstrap PR must not auto-merge or deploy.");
