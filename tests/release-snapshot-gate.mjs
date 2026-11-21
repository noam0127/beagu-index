import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 evaluateReleaseSnapshotGate,REQUIRED_SNAPSHOT_EVIDENCE
} from "../supabase/functions/beagu-release-manager-v1/release-snapshot-gate.mjs";

const MAIN="a".repeat(40),NEW_MAIN="b".repeat(40),OLD="c".repeat(40);
const NOW=Date.parse("2026-11-22T01:17:00Z");
const proof=(sha=MAIN,at=NOW)=>Object.fromEntries(
 Object.entries(REQUIRED_SNAPSHOT_EVIDENCE).map(([key,contract])=>
  [key,{state:"passed",source:contract.source,head_sha:sha,verified_at:new Date(at).toISOString()}])
);
const ready=()=>({
 mainSha:MAIN,reviewedSha:MAIN,candidateSha:MAIN,integratedSha:MAIN,
 evidence:proof(),ownerApproved:true,freezeActive:false,job:null,now:NOW
});
test("no evidence and frozen release are always blocked",()=>{
 const x=evaluateReleaseSnapshotGate();
 assert.equal(x.status,"blocked");
 assert.equal(x.eligible,false);
 assert.equal(x.snapshot_created,false);
 assert.equal(x.production_deployed,false);
 assert.ok(x.reason_codes.includes("version_finalization_frozen"));
 assert.ok(x.reason_codes.includes("integrated_ci_unverified"));
 assert.ok(x.reason_codes.includes("sandbox_rls_unverified"));
});
test("all independently proven conditions can reach evaluation-ready without writing a version",()=>{
 const x=evaluateReleaseSnapshotGate(ready());
 assert.equal(x.eligible,true);
 assert.equal(x.status,"ready_for_snapshot");
 assert.equal(x.verified_evidence_count,8);
 assert.equal(x.snapshot_created,false);
 assert.equal(x.approval_granted,false);
});
test("immutable emergency hold blocks even complete genuine-looking evidence",()=>{
 const x=evaluateReleaseSnapshotGate({...ready(),freezeActive:true});
 assert.equal(x.eligible,false);
 assert.deepEqual(x.reason_codes,["version_finalization_frozen"]);
});
test("if main changes after review, freeze blocks old reviewed head",()=>{
 const x=evaluateReleaseSnapshotGate({...ready(),mainSha:NEW_MAIN});
 assert.equal(x.eligible,false);
 assert.ok(x.reason_codes.includes("main_sha_changed"));
 assert.ok(x.reason_codes.includes("candidate_not_current_main"));
});
test("different integrated vs candidate SHA must block snapshot",()=>{
 const x=evaluateReleaseSnapshotGate({...ready(),integratedSha:OLD});
 assert.ok(x.reason_codes.includes("integrated_snapshot_mismatch"));
});
test("head SHA cannot be missing, shortened or a branch label",()=>{
 for(const value of [null,"main",MAIN.slice(0,7),MAIN.toUpperCase()]){
  const x=evaluateReleaseSnapshotGate({...ready(),mainSha:value});
  assert.equal(x.eligible,false);
  assert.ok(x.reason_codes.includes("main_sha_unavailable"));
 }
});
test("no reliance on client passed=true or generic checks green",()=>{
 const x=evaluateReleaseSnapshotGate({...ready(),evidence:{passed:true,green:true,ci:true}});
 assert.equal(x.eligible,false);
 assert.equal(x.verified_evidence_count,0);
 assert.ok(x.reason_codes.includes("integrated_merge_unverified"));
});
test("each independently required evidence category blocks on omission",()=>{
 for(const [key,contract] of Object.entries(REQUIRED_SNAPSHOT_EVIDENCE)){
  const existing=proof();delete existing[key];
  const x=evaluateReleaseSnapshotGate({...ready(),evidence:existing});
  assert.ok(x.reason_codes.includes(contract.code),key);
  assert.equal(x.verified_evidence_count,7,key);
 }
});
test("evidence from incorrect source is not an approval token",()=>{
 const evidence=proof();evidence.integrated_ci.source="browser";
 const x=evaluateReleaseSnapshotGate({...ready(),evidence});
 assert.ok(x.reason_codes.includes("integrated_ci_unverified"));
});
test("evidence bound to another commit does not count",()=>{
 const evidence=proof(NEW_MAIN);
 const x=evaluateReleaseSnapshotGate({...ready(),evidence});
 assert.equal(x.verified_evidence_count,0);
 assert.ok(x.reason_codes.includes("sandbox_db_unverified"));
});
test("expired and future-dated attestations are rejected",()=>{
 for(const at of [NOW-2*60*60*1000-1000,NOW+1000]){
  const x=evaluateReleaseSnapshotGate({...ready(),evidence:proof(MAIN,at)});
  assert.equal(x.eligible,false);
  assert.equal(x.verified_evidence_count,0);
 }
});
test("missing owner approval never becomes automatic after CI",()=>{
 const x=evaluateReleaseSnapshotGate({...ready(),ownerApproved:false});
 assert.deepEqual(x.reason_codes,["owner_approval_missing"]);
});
test("queued release jobs block version finalization",()=>{
 const x=evaluateReleaseSnapshotGate({...ready(),job:{status:"queued",target:"staging",action:"stage_apply"}});
 assert.ok(x.reason_codes.includes("pending_release_job"));
});
test("queued first staging rollback with null destination is explicitly unsafe",()=>{
 const x=evaluateReleaseSnapshotGate({...ready(),job:{status:"queued",target:"staging",action:"stage_rollback",to_sha:null}});
 assert.ok(x.reason_codes.includes("pending_release_job"));
 assert.ok(x.reason_codes.includes("unsafe_staging_rollback_queued"));
});
test("even unknown release job with no reviewed SHA is not green",()=>{
 const x=evaluateReleaseSnapshotGate({...ready(),reviewedSha:null,integratedSha:null});
 assert.ok(x.reason_codes.includes("reviewed_sha_missing"));
 assert.ok(x.reason_codes.includes("integrated_sha_unverified"));
});
test("server enforces freeze before any release write and does not consume browser evidence",()=>{
 const s=readFileSync("supabase/functions/beagu-release-manager-v1/index.ts","utf8");
 assert.match(s,/import \{evaluateReleaseSnapshotGate\} from "\.\/release-snapshot-gate\.mjs"/);
 assert.match(s,/const VERSION_FINALIZATION_PAUSED=true;/);
 const before=s.slice(s.indexOf("async function adminAction("),s.indexOf(" const s=await state();",s.indexOf("async function adminAction(")));
 for(const action of ["create_version","register","stage_apply"])assert.ok(before.includes('"'+action+'"'));
 assert.match(before,/github\("\/commits\/main"\)/);
 assert.match(before,/integratedSha:null/);
 assert.match(before,/evidence:null/);
 assert.match(before,/ownerApproved:false/);
 assert.match(before,/error:"version_snapshot_blocked"/);
 assert.doesNotMatch(before,/input\.evidence|input\.ownerApproved|input\.ci_passed/);
 assert.ok(s.indexOf('error:"version_snapshot_blocked"')<s.indexOf('if(action==="create_version")'));
});
test("status and UI show blocked readiness and disable both version creation and staging",()=>{
 const s=readFileSync("supabase/functions/beagu-release-manager-v1/index.ts","utf8");
 const ui=readFileSync("js/beagu-admin-updates-v1.js","utf8");
 const html=readFileSync("admin-updates.html","utf8");
 assert.match(s,/release_gate:releaseGate/);
 assert.match(ui,/releaseGate=data\.release_gate\|\|null/);
 assert.match(ui,/el\("releaseRegister"\)\.disabled=busy\|\|job\|\|releaseGate\?\.eligible!==true/);
 assert.match(ui,/el\("releaseStageApply"\)\.disabled=busy\|\|job\|\|releaseGate\?\.eligible!==true/);
 assert.match(ui,/if\(releaseGate\?\.eligible!==true\)\{/);
 assert.match(html,/id="releaseFreezeStatus"/);
 assert.doesNotMatch(ui,/innerHTML\s*=/);
});
