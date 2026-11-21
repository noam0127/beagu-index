import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {evaluateReleaseVersionGate,REQUIRED_EVIDENCE,REQUIRED_RELEASE_WORKFLOWS}
 from "../supabase/functions/beagu-release-manager-v1/release-version-gate.mjs";

const MAIN="a".repeat(40),OTHER="b".repeat(40);
const pr=(head=MAIN)=>({number:223,state:"closed",merged_at:"2026-11-22T00:00:00Z",
 draft:false,head_sha:head});
const evidence=(sha=MAIN)=>Object.fromEntries(REQUIRED_EVIDENCE.map(name=>
 [name,{status:"verified",sha}]));
const workflows=(sha=MAIN)=>({total_count:2,workflow_runs:
 REQUIRED_RELEASE_WORKFLOWS.map(name=>({name,head_sha:sha,status:"completed",
 conclusion:"success"}))});
const completed=(overrides={})=>({
 candidate:pr(),expected_pr:223,main_sha:MAIN,expected_sha:MAIN,
 workflow_runs:workflows(),evidence:evidence(),active_release_job:false,
 server_creation_paused:false,...overrides
});
function check(input){return evaluateReleaseVersionGate(input);}

test("missing inputs all fail closed without false positive",()=>{
 const out=check();
 assert.equal(out.status,"blocked");
 assert.equal(out.allow_create_version,false);
 assert.ok(out.reasons.includes("candidate_pr_not_verified"));
 assert.ok(out.reasons.includes("main_sha_unavailable"));
 assert.ok(out.reasons.includes("workflow_evidence_unavailable"));
 assert.equal(out.deployment_approval,false);
});

test("normal PR #223 remains draft and unmerged, so version creation blocked",()=>{
 const out=check(completed({candidate:{
  number:223,state:"open",draft:true,head_sha:OTHER,merged_at:null
 }}));
 assert.equal(out.allow_create_version,false);
 assert.ok(out.reasons.includes("candidate_pr_not_merged"));
 assert.ok(out.reasons.includes("candidate_pr_draft"));
 assert.ok(out.reasons.includes("candidate_not_equal_to_current_main"));
});

test("pinning reviewed main SHA prevents newer concurrent changes becoming release",()=>{
 const out=check(completed({main_sha:OTHER}));
 assert.ok(out.reasons.includes("main_moved_since_review"));
 assert.ok(out.reasons.includes("candidate_not_equal_to_current_main"));
});

test("no head matches main is not an implicit proof of merge or release",()=>{
 const out=check(completed({candidate:{...pr(),state:"open",merged_at:null}}));
 assert.ok(out.reasons.includes("candidate_pr_not_merged"));
 assert.equal(out.allow_create_version,false);
});

test("a PR cannot be substituted for reviewed #223",()=>{
 const out=check(completed({candidate:{...pr(),number:222}}));
 assert.ok(out.reasons.includes("unexpected_candidate_pr"));
});

test("CI successes must belong to exact candidate SHA",()=>{
 const out=check(completed({workflow_runs:workflows(OTHER)}));
 assert.ok(out.reasons.includes("required_workflow_not_verified"));
 assert.equal(out.required_workflows.every(x=>x.status==="unverified"),true);
});

test("queued or failed required CI is never considered success",()=>{
 const wf=workflows();
 wf.workflow_runs[0].conclusion="failure";
 wf.workflow_runs[1].status="in_progress";
 wf.workflow_runs[1].conclusion=null;
 const out=check(completed({workflow_runs:wf}));
 assert.equal(out.required_workflows.every(x=>x.status==="unverified"),true);
});

test("GitHub actions listing truncated means not verified",()=>{
 const out=check(completed({workflow_runs:{
  total_count:3,workflow_runs:workflows().workflow_runs
 }}));
 assert.ok(out.reasons.includes("workflow_evidence_unavailable"));
 assert.equal(out.inspected_workflow_runs,false);
});

test("a bare boolean, user string, or mismatched SHA cannot prove RLS/E2E",()=>{
 const claims={
  ...evidence(),
  staging_rls:true,
  candidate_browser_e2e:{status:"verified",sha:OTHER},
  owner_release_approval:"approved"
 };
 const out=check(completed({evidence:claims}));
 assert.ok(out.reasons.includes("required_staging_rls_unverified"));
 assert.ok(out.reasons.includes("required_candidate_browser_e2e_unverified"));
 assert.ok(out.reasons.includes("required_owner_release_approval_unverified"));
});

test("server hard lock prevents creation even in hypothetical fully verified scenario",()=>{
 const out=check(completed({server_creation_paused:true}));
 assert.equal(out.allow_create_version,false);
 assert.ok(out.reasons.includes("release_creation_paused"));
});

test("unknown server lock state is denied, never truthy-by-default",()=>{
 const input=completed();delete input.server_creation_paused;
 const out=check(input);
 assert.ok(out.reasons.includes("release_creation_paused"));
});

test("an existing queued release must not be bypassed by candidate preflight",()=>{
 const out=check(completed({active_release_job:true}));
 assert.equal(out.allow_create_version,false);
 assert.ok(out.reasons.includes("release_queue_busy"));
});

test("only exact SHA-bound complete evidence could make the pure gate eligible",()=>{
 const out=check(completed());
 assert.equal(out.status,"eligible_for_server_review");
 assert.equal(out.allow_create_version,true);
 assert.equal(out.deployment_approval,false);
 assert.equal(out.evidence.every(x=>x.status==="verified"),true);
});

test("server uses audited constants, no browser-supplied approval flags",()=>{
 const edge=readFileSync("supabase/functions/beagu-release-manager-v1/index.ts","utf8");
 const admin=edge.slice(edge.indexOf("async function adminAction("),
  edge.indexOf("async function workerAction("));
 assert.match(edge,/const RELEASE_VERSION_CREATION_PAUSED=true;/);
 assert.match(edge,/const RELEASE_REVIEW_PR=223;/);
 assert.match(edge,/const RELEASE_QA_EVIDENCE=Object\.freeze\(\{\}\);/);
 assert.match(admin,/\["create_version","register","stage_apply"\]\.includes\(action\)/);
 assert.match(admin,/return error\("release_version_gate_blocked",423,origin\)/);
 assert.ok(admin.indexOf('return error("release_version_gate_blocked"')<
  admin.indexOf("const s=await state();"));
 assert.match(admin,/release_version_gate:versionGate/);
 assert.match(admin,/workflow_runs:workflowRuns/);
 assert.match(admin,/expected_sha:REVIEWED_MAIN_SHA/);
 assert.match(admin,/evidence:RELEASE_QA_EVIDENCE/);
 assert.doesNotMatch(admin,/evidence:input\.|server_creation_paused:input\./);
});

test("UI refuses creation/staging before evidence and renders blockers as text",()=>{
 const ui=readFileSync("js/beagu-admin-updates-v1.js","utf8");
 const page=readFileSync("admin-updates.html","utf8");
 assert.match(ui,/renderVersionGate\(\)/);
 assert.match(ui,/versionGate\?\.allow_create_version!==true/);
 assert.match(ui,/release_version_gate_blocked/);
 assert.match(ui,/versionGate=data\.release_version_gate\|\|null/);
 assert.match(page,/id="releaseVersionGateReasons"/);
 assert.match(page,/id="releaseVersionGateStatus"/);
 assert.match(page,/id="releaseRegister" class="primary" disabled/);
 assert.doesNotMatch(ui,/innerHTML\s*=/);
});

test("release cannot be approved by changing a local evidence JSON",()=>{
 const snapshot=JSON.parse(readFileSync("docs/releases/v2-step11-readiness-observation.json","utf8"));
 assert.equal(snapshot.release_gate,"blocked");
 assert.equal(snapshot.candidate.owner_approval,false);
 assert.equal(snapshot.candidate.staging_candidate_deployed,false);
 assert.equal(snapshot.candidate.production_candidate_deployed,false);
});
