import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {validStagingCandidate,stageCandidateMatchesRef,isReleaseCandidateVersion,productionCandidateLocked,shouldAutoRegisterMainDraft} from "../supabase/functions/_shared/staging-release-candidate.mjs";
const sha="5c95aadad971901a8222f83c52e93bf901a3aeb7";
const rc={ref:"release/v1.1.0-rc.1",sha,version:"v1.1.0-rc.1",summary:"후보 버전 시험 웹 전용 적용"};
const gitRef={ref:"refs/heads/release/v1.1.0-rc.1",object:{type:"commit",sha}};
assert.equal(validStagingCandidate(rc),true);
assert.equal(stageCandidateMatchesRef(rc,gitRef),true);
assert.equal(isReleaseCandidateVersion(rc.version),true);
assert.equal(productionCandidateLocked(sha,rc.version),true,"RC must never be published as production");
assert.equal(productionCandidateLocked(sha,"이전 시험 버전"),true,
  "Rollback version label cannot bypass immutable RC source lock");
assert.equal(productionCandidateLocked("1".repeat(40),"v1.1.0-rc.2"),true,
  "Any explicitly labelled RC is blocked");
assert.equal(productionCandidateLocked("1".repeat(40),"v1.1.0"),false);
assert.equal(shouldAutoRegisterMainDraft(sha,"1".repeat(40),rc.version),false);
assert.equal(shouldAutoRegisterMainDraft(sha,sha,rc.version),false,
  "An already deployed RC must never be silently replaced with main");
assert.equal(shouldAutoRegisterMainDraft(null,"1".repeat(40),null),true);
assert.equal(shouldAutoRegisterMainDraft("1".repeat(40),"1".repeat(40),"1.0.1"),true);

for(const mismatch of [
  {...rc,sha:"0".repeat(40)},
  {...rc,ref:"release/v1.1.0-rc.2"},
  {...rc,version:"v1.1.0"},
  {...rc,summary:""},
  {...rc,ref:"main"},
  {...rc,ref:"release/v1.1.0-rc.1?x=1"},
  {...rc,sha:"../etc/passwd"},
  {...rc,version:"v1.1.1-rc.1"}
]){
  assert.equal(validStagingCandidate(mismatch)&&stageCandidateMatchesRef(mismatch,gitRef),false,"No unverified candidate ref");
}
assert.equal(stageCandidateMatchesRef(rc,{...gitRef,object:{type:"tag",sha}}),false);
assert.equal(stageCandidateMatchesRef(rc,{...gitRef,object:{type:"commit",sha:"1".repeat(40)}}),false);

await import("../js/beagu-release-progress-v1.js");
const snapshot=globalThis.BeaguReleaseProgress.snapshot;
const job=(status)=>({id:"demo-id",status,target:"staging",version:"v1.1.0-rc.1",to_sha:sha});
let state=snapshot(null,null);
assert.equal(state.visible,false);
state=snapshot(job("queued"),null);
assert.equal(state.value,0);assert.equal(state.completed,false);
state=snapshot(job("running"),null);
assert.equal(state.indeterminate,true);assert.equal(state.value,null);assert.equal(state.completed,false);
state=snapshot(null,job("deployed"),{staging_sha:sha});
assert.equal(state.value,100);assert.equal(state.completed,true);
state=snapshot(null,job("deployed"),{staging_sha:"1".repeat(40)});
assert.equal(state.state,"superseded","Old successful job must not show false 100% after rollback");
assert.equal(state.value,0);assert.equal(state.completed,false);
state=snapshot(null,job("deployed"));
assert.equal(state.state,"superseded","No server state must not count as deployment confirmation");
assert.equal(state.completed,false);
state=snapshot(null,{...job("deployed"),target:"production"},
  {staging_sha:sha,production_sha:"1".repeat(40)});
assert.equal(state.state,"superseded","An old production deployment must not be called current");
state=snapshot(null,{...job("deployed"),target:"production"},
  {staging_sha:"1".repeat(40),production_sha:sha});
assert.equal(state.value,100);
assert.equal(state.completed,true);
state=snapshot(null,job("failed"));
assert.equal(state.completed,false);assert.equal(state.value,0);
state=snapshot(null,job("cancelled"));
assert.equal(state.state,"unknown");assert.equal(state.completed,false);
state=snapshot(job("queued"),job("deployed"));
assert.equal(state.state,"queued","Active queued job takes precedence over previous successful deployment");

const api=readFileSync("supabase/functions/beagu-release-manager-v1/index.ts","utf8");
assert.match(api,/async function owner\(token:string\)/);
assert.match(api,/c\?\.aal!=="aal2"/);
assert.match(api,/beagu_admin_active_mfa_session/);
assert.match(api,/if\(action==="register_stage_candidate"\)/);
assert.match(api,/validStagingCandidate\(candidate\)/);
assert.match(api,/github\("\/git\/ref\/heads\/"\+candidate\.ref\)/);
assert.match(api,/stageCandidateMatchesRef\(candidate,remote\)/);
assert.match(api,/draft_sha:candidate\.sha/);
assert.match(api,/shouldAutoRegisterMainDraft\(candidateSha,s\.staging_sha,candidateVersion\)/);
assert.match(api,/if\(isReleaseCandidateVersion\(candidateVersion\)\)/,
  "Verify pinned GitHub branch again at stage-apply time");
assert.match(api,/stageCandidateMatchesRef\(candidate,remote\)/);
assert.match(api,/productionCandidateLocked\(s\.staging_sha,s\.staging_version\)/,
  "Prevent production promotion even after staging rollback relabels RC");
assert.match(api,/\.eq\("target","staging"\)\.eq\("to_sha",s\.staging_sha\)/,
  "Historical RC source must remain blocked across versions");
assert.match(api,/\.like\("version","v%-rc\.%"\)/,
  "Historical RC blocking query must be explicit");
assert.match(api,/if\(rcLookupError\|\|priorRcs\?\.length\)/,
  "RC history lookup error must fail closed");
assert.match(api,/release_candidate_production_locked/);
assert.match(api,/last_job:previousJob/);
assert.match(api,/\.select\("id,status,action,target,version,to_sha,created_at,started_at,finished_at,error_code"\)/);
const html=readFileSync("admin-updates.html","utf8");
for(const id of ["releaseCandidateRegister","releaseCandidateStatus","releaseProgressPanel","releaseProgressBar","releaseProgressLabel"]){
  assert.ok(html.includes('id="'+id+'"'),"Required user interface: "+id);
}
assert.ok(html.includes('value="0"'));
const script=readFileSync("js/beagu-admin-updates-v1.js","utf8");
assert.match(script,/register_stage_candidate/);
assert.match(script,/const blockedRc=\(s\.staging_sha===rc\.sha\)/,
  "Production Apply button must be disabled for pinned RC code even if version is changed");
assert.match(script,/el\("releaseProdApply"\)\.disabled=busy\|\|active\|\|blockedRc/,
  "RC block is reflected on the user interface");
assert.match(script,/releaseCandidateRegister/);
assert.match(script,/BeaguReleaseProgress\.snapshot\(job,data\.last_job,s\)/,
  "Completion must use the current server release SHA");
assert.match(script,/if\(progress\.indeterminate\)bar\.removeAttribute\("value"\)/);
assert.match(script,/bar\.value=progress\.value/);
assert.match(script,/if\(!proof\.permitted\|\|!proof\.mfa_verified\|\|proof\.role!=="owner"\)/);
for(const file of ["js/beagu-release-progress-v1.js","js/beagu-admin-updates-v1.js"]){
  execFileSync(process.execPath,["--check",file]);
}
const manifest=JSON.parse(readFileSync("docs/releases/v1.1.0-rc.1.json","utf8"));
assert.equal(manifest.immutable_candidate.commit_sha,sha);
assert.equal(manifest.deployment.production_release,"NO_GO");
const stageState=JSON.parse(readFileSync("docs/releases/v1.1.0-stage38-staging-state.json","utf8"));
assert.equal(stageState.stage,38);
assert.equal(stageState.rc_sha,sha);
assert.notEqual(stageState.published_staging_sha,sha,
  "Published preview must never be called rc.1 unless the exact pinned SHA matches");
assert.equal(stageState.live_stage_matches_rc,false);
assert.equal(stageState.staging_release_complete,false);
assert.equal(stageState.deployment_status,"BLOCKED_NOT_DEPLOYED");
assert.equal(stageState.production_release_allowed,false);
assert.equal(stageState.admin_release_api.requires_owner_aal2,true);
assert.equal(stageState.admin_release_api.live_deployed,false);
assert.equal(stageState.offline_package.passed,true);
assert.equal(stageState.offline_package.online,false);
const stageDoc=readFileSync("docs/releases/v1.1.0-stage38-staging-deployment.md","utf8");
assert.match(stageDoc,/38단계 진행 중/);
assert.match(stageDoc,/RC가 시험 웹에 배포되지 않음/);
assert.match(stageDoc,/AAL2/);
console.log("PASS: stage38 pinned RC ownership gate, server-authoritative job status and no production RC promotion.");
console.log("SCOPE: DEV BRANCH ONLY. RC staging deployment requires owner AAL2 + live release API support; no site deploy.");
