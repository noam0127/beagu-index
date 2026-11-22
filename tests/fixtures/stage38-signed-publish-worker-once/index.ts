// Stage38 temporary signed CI worker ACTUAL sandbox Git publisher integration. ISOLATED STAGING ONLY.
// GitHub Actions is allowed to push ONLY one isolated sandbox branch; the staging Edge verifies its actual ref SHA. Never deploy this
// function to the real Supabase ref snvzwrexuqavnfvzgxqj.
// GitHub-signed same-repo PR244 run; disabled immediately after QA completion.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { createRemoteJWKSet, jwtVerify } from "https://esm.sh/jose@5.10.0";
const PROJECT="ycwuugggqbunlbwuzvbx";
const REPO="noam0127/beagu-index";
const WORKFLOW=REPO+"/.github/workflows/stage38-signed-publish-worker-e2e.yml@refs/pull/244/merge";
const BRANCH="hotfix/v1.1.0-preview-backend-isolation";
const AUD="beagu-stage38-signed-publish-worker-qa";
const A="037a14afa252c52eaa130d7cbe2e08e649adf5bd";
const B="5512e798633eeb8163e8eab20c9ab9678b66f0cd";
const endpoint="https://raw.githubusercontent.com/"+REPO+"/";
const SANDBOX_BRANCH="stage38-oidc-atomic-publish-rc-5c95aad";
// Public repo Git ref is the sole evidence of actual file publishing by the worker.
async function publishedBranchAt(sha:string):Promise<boolean>{
 if(sha!==A && sha!==B) return false;
 try {
  const response=await fetch(
    "https://api.github.com/repos/"+REPO+"/git/ref/heads/"+SANDBOX_BRANCH,
    {headers:{"Accept":"application/vnd.github+json","User-Agent":"stage38-isolated-release-qa"},
     signal:AbortSignal.timeout(12000)}
  );
  if(!response.ok)return false;
  const data=await response.json() as {ref?:string;object?:{sha?:string;type?:string}};
  return data.ref==="refs/heads/"+SANDBOX_BRANCH &&
    data.object?.type==="commit" && data.object?.sha===sha;
 } catch {return false;}
}

const trustedJWKS=createRemoteJWKSet(new URL("https://token.actions.githubusercontent.com/.well-known/jwks"));
const answer=(code:number,content:Record<string,unknown>)=>
 new Response(JSON.stringify(content),{status:code,headers:{
  "Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",
  "X-Content-Type-Options":"nosniff"
 }});
type DataRow=Record<string,unknown>;
async function checkStaticCommit(sha:string):Promise<boolean>{
 if(sha!==A && sha!==B)return false;
 const raw=endpoint+sha+"/stage38-lifecycle-check.html";
 try{
  const res=await fetch(raw,{signal:AbortSignal.timeout(10000),headers:{"Accept":"text/html"}});
  if(!res.ok)return false;
  const data=await res.text();
  const code=sha===A?"A":"B";
  return data.includes('id="stage38-lifecycle-version">SANDBOX-'+code) &&
    data.includes('connect-src &#39;none&#39;') && data.length<3500;
 }catch{return false;}
}
Deno.serve(async(req:Request)=>{
 if(req.method!=="POST")return answer(405,{error:"method_not_allowed"});
 if(req.headers.has("Origin"))return answer(403,{error:"browser_origin_forbidden"});
 const bearer=req.headers.get("authorization")?.match(/^Bearer ([A-Za-z0-9._-]+)$/)?.[1];
 if(!bearer)return answer(401,{error:"signed_github_identity_required"});
 try {
  const {payload}=await jwtVerify(bearer,trustedJWKS,{
   issuer:"https://token.actions.githubusercontent.com",audience:AUD
  });
  if(payload.repository!==REPO || payload.event_name!=="pull_request" ||
     payload.ref!=="refs/pull/244/merge" || payload.workflow_ref!==WORKFLOW ||
     payload.head_ref!==BRANCH || payload.base_ref!=="main" ||
     !/^\d{8,20}$/.test(String(payload.run_id||""))) {
    return answer(403,{error:"untrusted_ci_identity"});
  }
 }catch{return answer(403,{error:"invalid_github_oidc"});}
 const url=Deno.env.get("SUPABASE_URL")||"";
 const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 if(url!=="https://"+PROJECT+".supabase.co"||!key)return answer(503,{error:"not_isolated_staging"});
 let body:Record<string,unknown>;
 try{
  const raw=await req.text();if(raw.length>1500)throw Error();
  const parsed:unknown=JSON.parse(raw);
  if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))throw Error();
  body=parsed as Record<string,unknown>;
 }catch{return answer(400,{error:"bad_request"});}
 const action=String(body.action||"");
 const allowed=new Set(["prepare","worker_next","worker_complete","prepare_rollback","cleanup","status"]);
 if(!allowed.has(action))return answer(403,{error:"only_sandbox_actions_allowed"});
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 try{
  if(["prepare","prepare_rollback","cleanup","status"].includes(action)){
   const translated:Record<string,string>={prepare:"prepare",prepare_rollback:"prepare_rollback",
     cleanup:"cleanup",status:"status"};
   const {data,error}=await db.rpc("beagu_stage38_signed_publish_worker_fixture_v1",{p_action:translated[action]});
   if(error||!data?.ok)return answer(503,{error:"staging_fixture_unavailable"});
   return answer(200,data as Record<string,unknown>);
  }
  if(action==="worker_next"){
   const {data:queued,error:readError}=await db.from("beagu_site_release_jobs_v1")
    .select("id,action,target,from_sha,to_sha,version,status")
    .in("status",["queued","running"]).order("created_at",{ascending:true}).limit(1).maybeSingle();
   if(readError)return answer(503,{error:"staging_queue_unavailable"});
   if(!queued)return answer(200,{has_job:false});
   if(queued.target!=="staging" ||
      !["stage_apply","stage_rollback"].includes(queued.action) ||
      ![A,B].includes(queued.from_sha)||![A,B].includes(queued.to_sha) ||
      !["STAGE38-FAKE-B","STAGE38-FAKE-A"].includes(queued.version))
      return answer(403,{error:"not_a_sandbox_queued_job"});
   if(queued.status!=="queued")return answer(200,{has_job:false,already_running:true});
   const {data:claimed,error:claimError}=await db.from("beagu_site_release_jobs_v1")
      .update({status:"running",started_at:new Date().toISOString()})
      .eq("id",queued.id).eq("status","queued")
      .select("id,action,target,from_sha,to_sha,status").maybeSingle();
   if(claimError)return answer(503,{error:"claim_unavailable"});
   if(!claimed)return answer(200,{has_job:false});
   return answer(200,{has_job:true,job_id:claimed.id,action:claimed.action,
     target:claimed.target,from_sha:claimed.from_sha,to_sha:claimed.to_sha});
  }
  if(action==="worker_complete"){
   const jobId=String(body.job_id||"");
   if(!/^[0-9a-f-]{36}$/i.test(jobId))return answer(400,{error:"invalid_job"});
   const {data:job,error:e}=await db.from("beagu_site_release_jobs_v1")
      .select("id,action,target,status,from_sha,to_sha,version")
      .eq("id",jobId).maybeSingle();
   if(e||!job)return answer(404,{error:"sandbox_job_missing"});
   if(job.target!=="staging"||!["stage_apply","stage_rollback"].includes(job.action) ||
      ![A,B].includes(job.to_sha) || ![A,B].includes(job.from_sha) ||
      !["STAGE38-FAKE-B","STAGE38-FAKE-A"].includes(job.version))
      return answer(403,{error:"not_sandbox_job"});
   if(job.status!=="running")return answer(409,{error:"sandbox_job_not_running"});
   // Attest the immutable, independently published static artifact on GitHub
   // BEFORE recording its SHA. This endpoint still deploys no files.
   if(!(await checkStaticCommit(job.to_sha)))return answer(503,{error:"sandbox_asset_not_verified"});
   if(!(await publishedBranchAt(job.to_sha)))return answer(409,{
     error:"sandbox_branch_not_at_claimed_sha"
   });
   const deployedUrl="https://raw.githack.com/"+REPO+"/"+job.to_sha+"/stage38-lifecycle-check.html";
   const {data:result,error:finalError}=await db.rpc("beagu_site_release_finalize_v1",{
     p_job_id:job.id,p_outcome:"deployed",p_deployed_url:deployedUrl
   });
   if(finalError||result?.ok!==true)return answer(503,{error:"atomic_finalize_failed"});
   return answer(200,{ok:true,job_id:job.id,action:job.action,
     to_sha:job.to_sha,finalized:true,release_actions_enabled:false});
  }
  return answer(403,{error:"not_allowed"});
 }catch{return answer(503,{error:"sandbox_worker_unavailable"});}
});
