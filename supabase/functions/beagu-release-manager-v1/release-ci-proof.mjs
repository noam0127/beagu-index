// Fail-closed proof of release CI results. No browser-supplied "tested" flag
// or run ID is trusted. This helper runs server-side in the privileged API.
// The three acceptance workflows are NOT yet deployed on protected main; until
// separately created and passing against the staged SHA, promotion stays NO-GO.
export const RELEASE_CI_POLICY=Object.freeze([
 Object.freeze({file:"v1.1.0-acceptance-e2e.yml",job:"release-acceptance-e2e"}),
 Object.freeze({file:"v1.1.0-acceptance-security-privacy.yml",job:"release-security-privacy"}),
 Object.freeze({file:"v1.1.0-acceptance-desktop-mobile.yml",job:"release-desktop-mobile"})
]);
const SHA=/^[0-9a-f]{40}$/;
const REPO="noam0127/beagu-index";
const WINDOW=7*24*60*60*1000;
const SKEW=2*60*1000;
const denied=(code)=>({ok:false,code});
const ts=v=>typeof v==="string"?Date.parse(v):NaN;
const validTime=v=>Number.isFinite(v)&&v>0;
const kind=x=>x&&typeof x==="object"&&!Array.isArray(x);
const isMatchingRun=(run,spec,sha)=>{
 const exactPath=".github/workflows/"+spec.file;
 return kind(run)&&run.path===exactPath&&run.event==="workflow_dispatch"&&
   run.head_sha===sha&&run.head_branch==="main"&&
   run.repository?.full_name===REPO&&run.head_repository?.full_name===REPO&&
   Number.isSafeInteger(run.id)&&run.id>0&&
   Number.isSafeInteger(run.run_attempt)&&run.run_attempt>0;
};
async function evidenceFor({githubGet,spec,sha,stagedAt,now}){
 let response;
 try {
  response=await githubGet("/actions/workflows/"+encodeURIComponent(spec.file)+
    "/runs?head_sha="+sha+"&branch=main&event=workflow_dispatch&per_page=30");
 }catch{return denied("ci_github_unavailable");}
 if(!kind(response)||!Array.isArray(response.workflow_runs)||
    !Number.isSafeInteger(response.total_count)||response.total_count<0)
  return denied("ci_runs_invalid");
 // The server never accepts a run ID supplied by a browser or caller.
 const matching=response.workflow_runs.filter(run=>isMatchingRun(run,spec,sha));
 // If more matching runs exist than the first page, GitHub returns most recent
 // first. Never accept a prior success when the newest attempt has failed.
 matching.sort((a,b)=>ts(b.created_at)-ts(a.created_at)||b.id-a.id);
 const run=matching[0];
 if(!run)return denied("ci_attestation_missing");
 const created=ts(run.created_at),updated=ts(run.updated_at);
 if(!validTime(created)||!validTime(updated)||updated<created||
    created<stagedAt-SKEW||created>now+SKEW||updated>now+SKEW||
    now-created>WINDOW)
   return denied("ci_attestation_stale");
 if(run.status!=="completed"||run.conclusion!=="success")
   return denied("ci_attestation_not_successful");
 let page;
 try{page=await githubGet("/actions/runs/"+run.id+"/jobs?per_page=100");}
 catch{return denied("ci_github_unavailable");}
 if(!kind(page)||!Number.isSafeInteger(page.total_count)||
    !Array.isArray(page.jobs)||page.total_count===0||
    page.total_count>100||page.total_count!==page.jobs.length)
  return denied("ci_jobs_incomplete");
 if(page.jobs.some(job=>!kind(job)||job.run_id!==run.id||
   (job.run_attempt!==undefined&&job.run_attempt!==run.run_attempt)||
   job.status!=="completed"||job.conclusion!=="success"))
  return denied("ci_jobs_not_successful");
 const required=page.jobs.filter(job=>job.name===spec.job);
 if(required.length!==1)return denied("ci_required_job_missing");
 const attested=required[0];
 if(!Array.isArray(attested.steps)||attested.steps.length<2||
    attested.steps.some(step=>!kind(step)||step.status!=="completed"||
       step.conclusion!=="success"))
  return denied("ci_test_steps_incomplete");
 return {ok:true,run_id:run.id};
}
export async function verifyProductionReadiness({
 githubGet,sha,stagingDeployedAt,now=Date.now()
}){
 // Fail closed without an independently recorded staged deployment.
 if(typeof githubGet!=="function"||!SHA.test(String(sha||""))||
    !Number.isFinite(now))return denied("ci_inputs_invalid");
 const stagedAt=ts(stagingDeployedAt);
 if(!validTime(stagedAt)||stagedAt>now+SKEW||now-stagedAt>WINDOW)
  return denied("ci_stage_evidence_missing_or_expired");
 const runIds=[];
 for(const spec of RELEASE_CI_POLICY){
  const result=await evidenceFor({githubGet,spec,sha,stagedAt,now});
  if(!result.ok)return result;
  runIds.push(result.run_id);
 }
 if(new Set(runIds).size!==runIds.length)return denied("ci_duplicate_workflow_proof");
 return {ok:true,code:"ci_verified",sha,verified_run_ids:runIds};
}
