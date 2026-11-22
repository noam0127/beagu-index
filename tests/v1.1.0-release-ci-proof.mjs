import {test} from "node:test";
import assert from "node:assert/strict";
import {
 RELEASE_CI_POLICY,verifyProductionReadiness
} from "../supabase/functions/beagu-release-manager-v1/release-ci-proof.mjs";

const SHA="5c95aadad971901a8222f83c52e93bf901a3aeb7";
const NOW=Date.parse("2026-11-23T04:00:00Z");
const STAGED="2026-11-22T23:00:00Z";
const RUN_AT="2026-11-23T00:00:00Z";
const UPDATED="2026-11-23T00:12:00Z";

function fixture(){
 const runs=new Map(),jobs=new Map();
 for(let i=0;i<RELEASE_CI_POLICY.length;i++){
  const s=RELEASE_CI_POLICY[i],id=401+i;
  runs.set(s.file,[{
   id,run_attempt:1,path:".github/workflows/"+s.file,
   event:"workflow_dispatch",status:"completed",conclusion:"success",
   head_sha:SHA,head_branch:"main",
   repository:{full_name:"noam0127/beagu-index"},
   head_repository:{full_name:"noam0127/beagu-index"},
   created_at:RUN_AT,updated_at:UPDATED
  }]);
  jobs.set(id,[{
   id:1001+i,run_id:id,run_attempt:1,name:s.job,
   status:"completed",conclusion:"success",
   steps:[
    {name:"Set up job",status:"completed",conclusion:"success"},
    {name:"Run pinned acceptance suite",status:"completed",conclusion:"success"}
   ]
  }]);
 }
 let calls=[];
 async function githubGet(path){
  calls.push(path);
  const u=new URL(path,"https://api.github.com");
  const p=u.pathname.split("/");
  if(p[2]==="workflows"){
   assert.equal(p[4],"runs");
   assert.equal(u.searchParams.get("head_sha"),SHA);
   assert.equal(u.searchParams.get("branch"),"main");
   assert.equal(u.searchParams.get("event"),"workflow_dispatch");
   const list=runs.get(decodeURIComponent(p[3]))||[];
   return {workflow_runs:list,total_count:list.length};
  }
  if(p[2]==="runs"){
   assert.equal(p[4],"jobs");
   const list=jobs.get(Number(p[3]))||[];
   return {jobs:list,total_count:list.length};
  }
  throw Error("unexpected GitHub API path");
 }
 const result={runs,jobs,githubGet,calls};
 result.check=()=>verifyProductionReadiness({
  githubGet:result.githubGet,sha:SHA,stagingDeployedAt:STAGED,now:NOW
 });
 return result;
}
function negative(name,mutate,code){
 test(name,async()=>{
  const f=fixture();
  mutate(f);
  const result=await f.check();
  assert.equal(result.ok,false);
  assert.equal(result.code,code);
 });
}
test("all three distinct workflows attest same staged SHA after real staging deployment",async()=>{
 const f=fixture(),r=await f.check();
 assert.deepEqual(r,{ok:true,code:"ci_verified",sha:SHA,verified_run_ids:[401,402,403]});
 assert.equal(f.calls.length,6);
});
negative("no CI runs",f=>f.runs.set(RELEASE_CI_POLICY[0].file,[]),"ci_attestation_missing");
negative("incomplete run result",f=>{
 const origin=f.githubGet;
 f.githubGet=async p=>p.includes("/actions/workflows/")?
   {workflow_runs:null,total_count:1}:origin(p);
},"ci_runs_invalid");
negative("a run with no matching SHA cannot be trusted",f=>f.runs.get(RELEASE_CI_POLICY[0].file)[0].head_sha="a".repeat(40),"ci_attestation_missing");
negative("CI for branch other than main is rejected",f=>f.runs.get(RELEASE_CI_POLICY[0].file)[0].head_branch="feature","ci_attestation_missing");
negative("attacker fork run is rejected",f=>f.runs.get(RELEASE_CI_POLICY[0].file)[0].head_repository.full_name="attacker/beagu-index","ci_attestation_missing");
negative("different repository is rejected",f=>f.runs.get(RELEASE_CI_POLICY[0].file)[0].repository.full_name="attacker/other","ci_attestation_missing");
negative("workflow file path cannot be substituted",f=>f.runs.get(RELEASE_CI_POLICY[0].file)[0].path=".github/workflows/evil.yml","ci_attestation_missing");
negative("push event is not manual post-staging acceptance",f=>f.runs.get(RELEASE_CI_POLICY[0].file)[0].event="push","ci_attestation_missing");
negative("wrong run attempt schema rejected",f=>f.runs.get(RELEASE_CI_POLICY[0].file)[0].run_attempt=0,"ci_attestation_missing");
negative("workflow conclusion failure denies",f=>f.runs.get(RELEASE_CI_POLICY[0].file)[0].conclusion="failure","ci_attestation_not_successful");
negative("cancelled or in-progress CI denies",f=>f.runs.get(RELEASE_CI_POLICY[0].file)[0].status="in_progress","ci_attestation_not_successful");
negative("CI run completed before staging cannot attest staged artifact",f=>f.runs.get(RELEASE_CI_POLICY[0].file)[0].created_at="2026-11-22T20:00:00Z","ci_attestation_stale");
negative("CI evidence cannot be in the future",f=>f.runs.get(RELEASE_CI_POLICY[0].file)[0].created_at="2026-11-25T20:00:00Z","ci_attestation_stale");
negative("a more recent failed rerun eclipses earlier green run",f=>{
 const a=f.runs.get(RELEASE_CI_POLICY[0].file)[0];
 f.runs.get(RELEASE_CI_POLICY[0].file).push({...a,id:900,created_at:"2026-11-23T03:00:00Z",
 updated_at:"2026-11-23T03:12:00Z",conclusion:"failure"});
},"ci_attestation_not_successful");
negative("missing required job denies",f=>f.jobs.get(401)[0].name="fake-good-job","ci_required_job_missing");
negative("skipped required job denies",f=>f.jobs.get(401)[0].conclusion="skipped","ci_jobs_not_successful");
negative("required job failure denies despite run success",f=>f.jobs.get(401)[0].conclusion="failure","ci_jobs_not_successful");
negative("an unrelated failed job denies all",f=>f.jobs.get(401).push({...f.jobs.get(401)[0],id:5001,name:"another critical job",conclusion:"failure"}),"ci_jobs_not_successful");
negative("failed required step denies despite job green",f=>f.jobs.get(401)[0].steps[1].conclusion="failure","ci_test_steps_incomplete");
negative("skipped actual acceptance steps deny",f=>f.jobs.get(401)[0].steps[1].conclusion="skipped","ci_test_steps_incomplete");
negative("jobs from a prior attempt cannot be replayed",f=>f.jobs.get(401)[0].run_attempt=2,"ci_jobs_not_successful");
negative("insufficient job detail rejects",f=>f.jobs.get(401)[0].steps=[],"ci_test_steps_incomplete");
negative("a zero-job green workflow is not evidence",f=>f.jobs.set(401,[]),"ci_jobs_incomplete");
negative("truncated job list is rejected",f=>{
 const a=f.githubGet;f.githubGet=async p=>{
  const x=await a(p);
  if(p.includes("/runs/401/jobs"))return {...x,total_count:101};
  return x;
 };},"ci_jobs_incomplete");
negative("a duplicate workflow run id in required suites is rejected",f=>{
 const p=RELEASE_CI_POLICY[1].file;
 f.runs.get(p)[0].id=401;
 f.jobs.get(401).push({...f.jobs.get(402)[0],run_id:401});
},"ci_duplicate_workflow_proof");
test("missing staging confirmation is denied",async()=>{
 const f=fixture();
 assert.equal((await verifyProductionReadiness({
  githubGet:f.githubGet,sha:SHA,now:NOW
 })).code,"ci_stage_evidence_missing_or_expired");
 assert.equal(f.calls.length,0);
});
test("expired staging approval is denied before GitHub access",async()=>{
 const f=fixture();
 assert.equal((await verifyProductionReadiness({
  githubGet:f.githubGet,sha:SHA,
  stagingDeployedAt:"2026-11-01T00:00:00Z",now:NOW
 })).code,"ci_stage_evidence_missing_or_expired");
 assert.equal(f.calls.length,0);
});
test("invalid candidate SHA is denied",async()=>{
 const f=fixture();
 assert.equal((await verifyProductionReadiness({
  githubGet:f.githubGet,sha:"not-a-commit",stagingDeployedAt:STAGED,now:NOW
 })).code,"ci_inputs_invalid");
 assert.equal(f.calls.length,0);
});
test("GitHub outage blocks production promotion",async()=>{
 const x=await verifyProductionReadiness({
  githubGet:async()=>{throw Error("timeout")},sha:SHA,
  stagingDeployedAt:STAGED,now:NOW
 });
 assert.deepEqual(x,{ok:false,code:"ci_github_unavailable"});
});
test("duplicate distinct runs in same workflow: newest failed dominates older success",async()=>{
 const f=fixture(),t=RELEASE_CI_POLICY[0].file,run=f.runs.get(t)[0];
 f.runs.get(t).unshift({...run,id:650,run_attempt:2,
  created_at:"2026-11-23T01:00:00Z",updated_at:"2026-11-23T01:12:00Z",
  conclusion:"failure"});
 assert.equal((await f.check()).code,"ci_attestation_not_successful");
});
