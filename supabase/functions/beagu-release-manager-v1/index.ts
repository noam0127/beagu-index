// Secure release command API. User-facing operations require owner Auth + active AAL2.
// GitHub Actions worker operations require a signed GitHub OIDC token restricted to this repo/workflow.
import {createClient} from "https://esm.sh/@supabase/supabase-js@2.58.0";
import {createRemoteJWKSet,jwtVerify} from "https://esm.sh/jose@5.10.0";

const db=createClient(Deno.env.get("SUPABASE_URL")||"",Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"",{
  auth:{persistSession:false,autoRefreshToken:false}
});
const repo="noam0127/beagu-index";
const mainApi="https://api.github.com/repos/"+repo;
const dispatchToken=Deno.env.get("BEAGU_RELEASE_DISPATCH_TOKEN")||"";
async function wakeDispatcher(jobId:string,candidateSha:string){
 if(!dispatchToken)return "scheduled_only";
 const permit=await transition("reserve_dispatch",{job_id:jobId,candidate_sha:candidateSha});
 if(permit.error)return permit.error==="dispatch_rate_limited"?"dispatch_rate_limited":"dispatch_unavailable";
 try{
  const response=await fetch(mainApi+"/actions/workflows/beagu-release-controller.yml/dispatches",{method:"POST",headers:{"Authorization":"Bearer "+dispatchToken,"Accept":"application/vnd.github+json","Content-Type":"application/json","X-GitHub-Api-Version":"2022-11-28","User-Agent":"beaguindex-release-v2"},body:JSON.stringify({ref:"main"}),signal:AbortSignal.timeout(8000)});
  return response.status===204?"dispatched":"dispatch_unavailable";
 }catch{return "dispatch_unavailable";}
}
async function transition(action:string,payload:Record<string,unknown>){
 const {data,error}=await db.rpc("beagu_release_transition_v2",{p_action:action,p_payload:payload});
 if(error||!data)throw Error("transition_unavailable");
 return data;
}
const trusted=new Set(["https://baeguindex.com","https://www.baeguindex.com"]);
const jwks=createRemoteJWKSet(new URL("https://token.actions.githubusercontent.com/.well-known/jwks"));
const SHA=/^[0-9a-f]{40}$/;
const allowedVersion=/^[0-9A-Za-z][0-9A-Za-z._-]{0,31}$/;
const cors=(origin:string)=>({
 "Access-Control-Allow-Origin":trusted.has(origin)?origin:"https://baeguindex.com",
 "Access-Control-Allow-Methods":"POST,OPTIONS",
 "Access-Control-Allow-Headers":"authorization,apikey,content-type",
 "Access-Control-Max-Age":"3600","Cache-Control":"no-store","Vary":"Origin",
 "X-Content-Type-Options":"nosniff"
});
const respond=(value:unknown,status:number,origin:string)=>
 new Response(JSON.stringify(value),{status,headers:{...cors(origin),"Content-Type":"application/json;charset=utf-8"}});
const error=(code:string,status:number,origin:string)=>respond({error:code},status,origin);

type Claims={sub?:string;aal?:string;session_id?:string};
function claims(jwt:string):Claims|null{
 try{const v=jwt.split(".")[1];if(!v)return null;
  const b=v.replace(/-/g,"+").replace(/_/g,"/");
  return JSON.parse(atob(b.padEnd(Math.ceil(b.length/4)*4,"=")));
 }catch{return null;}
}
async function owner(token:string):Promise<string|null>{
 const {data,error}=await db.auth.getUser(token);
 const id=data?.user?.id||"";
 const c=claims(token);
 if(error||!id||c?.sub!==id||!c?.session_id||c?.aal!=="aal2")return null;
 const {data:account,error:err}=await db.from("beagu_admin_accounts")
   .select("role,enabled").eq("user_id",id).maybeSingle();
 if(err||account?.enabled!==true||account.role!=="owner")return null;
 const {data:active,error:sessionError}=await db.rpc("beagu_admin_active_mfa_session",
    {p_user:id,p_session:c.session_id});
 if(sessionError||active!==true)return null;
 return id;
}
async function githubWorker(token:string):Promise<boolean>{
 try{
  const {payload}=await jwtVerify(token,jwks,{
   issuer:"https://token.actions.githubusercontent.com",audience:"beagu-release-worker"
  });
  return payload.repository===repo && payload.ref==="refs/heads/main" &&
   payload.workflow_ref===repo+"/.github/workflows/beagu-release-controller.yml@refs/heads/main" &&
   ["schedule","push","workflow_dispatch"].includes(String(payload.event_name||""));
 }catch{return false;}
}
async function github(path:string){
 const response=await fetch(mainApi+path,{headers:{
  "Accept":"application/vnd.github+json","User-Agent":"beaguindex-release-v1",...(dispatchToken?{"Authorization":"Bearer "+dispatchToken}:{})
 },signal:AbortSignal.timeout(11000)});
 if(!response.ok)throw Error("github_unavailable");
 return response.json();
}
async function latestManifest(){
 try{
  const doc=await github("/contents/release-candidate.json?ref=main");
  if(typeof doc?.content!=="string")return null;
  const decoded=atob(doc.content.replace(/\s/g,""));
  const value=JSON.parse(new TextDecoder().decode(Uint8Array.from(decoded,ch=>ch.charCodeAt(0))));
  const version=typeof value?.version==="string"?value.version.trim():"";
  const summary=typeof value?.summary==="string"?value.summary.trim():"";
  if(!allowedVersion.test(version)||summary.length<3||summary.length>500)return null;
  return {version,summary};
 }catch{return null;}
}
async function changedFiles(from:string,to:string){
 if(!SHA.test(from)||!SHA.test(to)||from===to)return [];
 const diff=await github("/compare/"+from+"..."+to);
 return (diff.files||[]).map((f:{filename?:string})=>f.filename||"")
  .filter((path:string)=>path&&path!=="release-candidate.json");
}
// Phase 1: classify backend changes using the GitHub delta, never client flags.
function backendPaths(files:any[]):string[]{
 return [...new Set(files.flatMap(f=>[String(f.filename||""),String(f.previous_filename||"")])
  .filter(p=>/^supabase\//.test(p)||/^scripts\/release-manager\//.test(p)||
    /^\.github\/workflows\/(beagu-release-controller|deploy-github-pages-direct)\.ya?ml$/.test(p)))].sort();
}
async function backendChangeBetween(base:string,sha:string){
 if(!SHA.test(base)||!SHA.test(sha)||base===sha)throw Error("invalid_backend_comparison");
 const delta=await github("/compare/"+base+"..."+sha);
 if(delta.status!=="ahead"||delta.merge_base_commit?.sha!==base||!Array.isArray(delta.files)||!delta.files.length||delta.files.length>=300)
  throw Error("backend_comparison_unavailable");
 return backendPaths(delta.files);
}
// Direct Pages release gate: exact candidate, current production ancestor, and server-read CI.
async function directCandidate(base:string,sha:string){
 if(!SHA.test(base)||!SHA.test(sha)||base===sha)return {error:"invalid_direct_sha",status:400};
 const delta=await github("/compare/"+base+"..."+sha);
 if(delta.status!=="ahead"||delta.merge_base_commit?.sha!==base||!Array.isArray(delta.files)||!delta.files.length||delta.files.length>=300)
  return {error:"direct_candidate_stale",status:409};
 const doc=await github("/contents/release-candidate.json?ref="+sha);
 if(typeof doc?.content!=="string")return {error:"invalid_direct_manifest",status:400};
 const value=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(doc.content.replace(/\s/g,"")),ch=>ch.charCodeAt(0))));
 const version=String(value.version||"").trim(),summary=String(value.summary||"").trim();
 if(!allowedVersion.test(version)||summary.length<3||summary.length>500)return {error:"invalid_direct_manifest",status:400};
 // Code-only validation workflow must report success at the immutable candidate SHA.
 const runs=await github("/actions/runs?head_sha="+sha+"&status=success&per_page=50");
 const proof=(runs.workflow_runs||[]).find((r:any)=>r.head_sha===sha&&r.conclusion==="success"&&r.status==="completed"&&r.path===".github/workflows/clean-release-validation.yml"&&r.head_repository?.full_name===repo);
 if(!proof)return {error:"direct_ci_required",status:409};
 const backend_files=backendPaths(delta.files);
 return {version,summary,files:delta.files.map((f:any)=>String(f.filename||"")).filter(Boolean),backend_required:backend_files.length>0,backend_files};
}
async function state(){
 const {data,error}=await db.from("beagu_site_release_state_v1").select("*").eq("id",1).single();
 if(error||!data)throw Error("state_unavailable");return data;
}
async function history(target:string){
 const {data,error}=await db.from("beagu_site_release_history_v1")
  .select("id,target,action,version,summary,from_sha,to_sha,deployed_at,deployed_url")
  .eq("target",target).order("deployed_at",{ascending:false}).limit(35);
 if(error)throw Error("history_unavailable");return data||[];
}
async function activeJob(){
 const {data,error}=await db.from("beagu_site_release_jobs_v1")
  .select("*").in("status",["queued","running"]).order("created_at",{ascending:true}).limit(1).maybeSingle();
 if(error)throw Error("job_unavailable");return data;
}
async function enqueue(job:{action:string;target:string;to_sha:string|null;from_sha:string|null;
 version:string;summary:string;created_by:string}){
 if(await activeJob())return {error:"release_in_progress",status:409};
 const {data,error:e}=await db.from("beagu_site_release_jobs_v1").insert(job).select("id").single();
 if(e){if(e.code==="23505")return {error:"release_in_progress",status:409};
  throw Error("queue_unavailable");}
 return {id:data.id};
}
async function adminAction(input:Record<string,unknown>,userId:string,origin:string):Promise<Response>{
 const action=String(input.action||"");
 const s=await state();
 const current=await activeJob();
 if(action==="status"){
  const [stageHistory,prodHistory,recent]=await Promise.all([history("staging"),history("production"),db.from("beagu_site_release_jobs_v1").select("id,version,action,status,to_sha,from_sha,created_at,started_at,finished_at,error_code").eq("target","production").order("created_at",{ascending:false}).limit(8)]);
  if(recent.error)throw Error("job_unavailable");
  let ready:null|boolean=null, reason:string|null=null;
  if(input.check_latest===true){
   ready=false;
   if(s.draft_sha&&s.production_sha&&s.draft_sha!==s.production_sha){
    try{
     const candidate=await directCandidate(s.production_sha,s.draft_sha);
     if("error" in candidate)reason=candidate.error||"direct_candidate_invalid";
     else if(candidate.version===s.draft_version&&candidate.summary===s.draft_summary){
      if(candidate.backend_required)reason="backend_integrated_required";
      else ready=true;
     }
     else reason="direct_version_mismatch";
    }catch{reason="github_unavailable";}
   }
  }
  return respond({direct_release_v1:true,control_tower_v2:true,dispatch_configured:!!dispatchToken,recent_jobs:recent.data||[],direct_candidate_ready:ready,direct_candidate_reason:reason,state:s,job:current,head_sha:null,suggested_draft:null,staging_history:stageHistory,
    production_history:prodHistory,staging_url:null,production_url:"https://baeguindex.com/"},200,origin);
 }
 if(action==="wake_approved_job"){
  if(!current||current.id!==input.job_id||current.status!=="queued"||current.target!=="production"||current.from_sha!==s.production_sha||current.to_sha!==input.candidate_sha||!["prod_apply","prod_rollback"].includes(current.action))return error("direct_confirmation_required",409,origin);
  return respond({job_id:current.id,dispatch:await wakeDispatcher(current.id,current.to_sha)},200,origin);
 }
 if(current)return error("release_in_progress",409,origin);
 if(["register","stage_apply","stage_rollback","prod_apply"].includes(action))return error("direct_route_required",409,origin);
 if(!s.production_sha)return error("release_bootstrap_pending",409,origin);
 if(action==="register_direct"){
  const sha=String(input.candidate_sha||"");
  const candidate=await directCandidate(s.production_sha,sha);
  if("error" in candidate)return error(candidate.error!,candidate.status!,origin);
  if(candidate.version!==String(input.version||""))return error("direct_version_mismatch",409,origin);
  // Do not silently replace an unrelated registered draft.
  if(s.draft_sha&&s.draft_sha!==sha&&s.draft_sha!==s.production_sha&&input.replace_draft_sha!==s.draft_sha)
   return error("direct_draft_conflict",409,origin);
  const result=await transition("register",{base:s.production_sha,expected_draft:s.draft_sha,sha,version:candidate.version,summary:candidate.summary});
  if(result.error)return error(result.error,409,origin);
  if(result.draft_sha!==sha)return error("direct_draft_conflict",409,origin);
  await db.from("beagu_admin_audit_events").insert({actor_user_id:userId,event_type:"site_release_register_direct",outcome:"success",details:{sha,version:candidate.version,base:s.production_sha}});
  return respond({draft_sha:sha,version:candidate.version,summary:candidate.summary,changed_count:candidate.files.length,changed_files:candidate.files.slice(0,25),backend_required:candidate.backend_required,backend_files:candidate.backend_files},200,origin);
 }
 let job:null|{action:string;target:string;to_sha:string|null;from_sha:string|null;version:string;summary:string;created_by:string}=null;
 if(action==="prod_direct_apply"){
  const sha=String(input.candidate_sha||"");
  if(input.confirmed_direct!==true||!s.draft_sha||sha!==s.draft_sha||input.expected_production_sha!==s.production_sha)
   return error("direct_confirmation_required",409,origin);
  const candidate=await directCandidate(s.production_sha,sha);
  if("error" in candidate)return error(candidate.error!,candidate.status!,origin);
  if(candidate.version!==s.draft_version||candidate.summary!==s.draft_summary)return error("direct_version_mismatch",409,origin);
  if(candidate.backend_required)return error("backend_integrated_required",409,origin);
  // Keep the existing database action constraint and history format.
  job={action:"prod_apply",target:"production",from_sha:s.production_sha,to_sha:sha,version:candidate.version,summary:candidate.summary,created_by:userId};
 }else if(action==="prod_rollback"){
  const {data:recentRollbackTarget,error:previousError}=await db.from("beagu_site_release_history_v1")
   .select("from_sha,to_sha").eq("target","production").neq("action","data_refresh")
   .order("deployed_at",{ascending:false}).limit(1).maybeSingle();
  if(previousError)throw Error("history_unavailable");
  const prev=recentRollbackTarget;
  if(!prev||!prev.from_sha||prev.from_sha===s.production_sha)
   return error("no_production_rollback",409,origin);
  job={action,target:"production",from_sha:s.production_sha,to_sha:prev.from_sha,
   version:"이전 운영 버전",summary:"관리자 요청에 따라 직전 운영 배포 복원",created_by:userId};
  if(input.expected_production_sha!==undefined&&(input.expected_production_sha!==s.production_sha||input.expected_rollback_sha!==prev.from_sha||input.confirmed_direct!==true))return error("direct_confirmation_required",409,origin);
  // A web-only rollback is unsafe when the prior release changed backend files.
  if((await backendChangeBetween(prev.from_sha,s.production_sha)).length)return error("backend_integrated_required",409,origin);
  // Recover the exact restored version from the pinned historical manifest, not a generic label.
  try{const doc=await github("/contents/release-info.json?ref="+prev.from_sha);const meta=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(doc.content.replace(/\s/g,"")),ch=>ch.charCodeAt(0))));if(allowedVersion.test(meta.version))job.version=meta.version;}catch{/* Older pre-version history can lack metadata. */}
 }else return error("invalid_action",400,origin);
 const queued=await transition("enqueue",job);
 if(queued.error)return error(queued.error,409,origin);
 await db.from("beagu_admin_audit_events").insert({
  actor_user_id:userId,event_type:"site_release_"+action,outcome:"success",
  details:{job_id:queued.id,target:job.target,from_sha:job.from_sha,to_sha:job.to_sha,version:job.version}
 });
 const dispatch=await wakeDispatcher(queued.id,job.to_sha||'').catch(()=>"dispatch_unavailable");
 return respond({queued:true,job_id:queued.id,action,dispatch,service:"GitHub Actions"},202,origin);
}
async function workerAction(input:Record<string,unknown>,origin:string):Promise<Response>{
 const action=String(input.action||"");
 if(action==="worker_next"){
  const s=await state();
  // A timed-out worker might already have published Pages. Never automatically
  // clear a running job or claim a replacement; the owner must reconcile it.
  let job=await activeJob();
  const publicDataBlob=String(input.data_blob_sha||"");
  if(!SHA.test(publicDataBlob))return error("invalid_public_data_blob",400,origin);
  if(!job&&!s.production_sha){
   const initial=String(input.head_sha||"");
   if(!SHA.test(initial))return error("invalid_bootstrap_sha",400,origin);
   const {data, error:e}=await db.from("beagu_site_release_jobs_v1").insert({
    action:"bootstrap",target:"production",to_sha:initial,from_sha:null,
    version:"관리자 배포 시스템 1.0",summary:"관리자 업데이트 페이지 최초 설치",status:"queued",
    public_data_blob_sha:publicDataBlob
   }).select("*").single();
   if(e)throw Error("bootstrap_unavailable");job=data;
  }
  if(!job&&s.production_sha&&s.public_data_blob_sha!==publicDataBlob){
   const {data,error:e}=await db.from("beagu_site_release_jobs_v1").insert({
    action:"data_refresh",target:"production",to_sha:s.production_sha,from_sha:s.production_sha,
    version:s.production_version||"운영 데이터",summary:"공개 학교 목록 자동 갱신",
    status:"queued",public_data_blob_sha:publicDataBlob
   }).select("*").single();
   if(e)throw Error("auto_data_refresh_unavailable");
   job=data;
  }
  if(!job)return respond({has_job:false},200,origin);
  if(job.status!=="queued")return respond({has_job:false,already_running:true},200,origin);
  if(job.target==="staging"){
   await db.from("beagu_site_release_jobs_v1").update({status:"failed",error_code:"staging_route_retired",finished_at:new Date().toISOString()}).eq("id",job.id).eq("status","queued");
   return respond({has_job:false,staging_route_retired:true},200,origin);
  }
  if(job.target==="production"&&job.action!=="bootstrap"&&job.from_sha!==s.production_sha){
   await db.from("beagu_site_release_jobs_v1").update({status:"failed",error_code:"stale_production_base",finished_at:new Date().toISOString()}).eq("id",job.id).eq("status","queued");
   return respond({has_job:false,stale_production_base:true},200,origin);
  }
  // Recheck at claim time, including jobs queued by a pre-upgrade controller.
  if(job.action==="prod_apply"||job.action==="prod_rollback"){
   const paths=job.action==="prod_apply"?await backendChangeBetween(job.from_sha,job.to_sha):await backendChangeBetween(job.to_sha,job.from_sha);
   if(paths.length){
    const {error:blocked}=await db.from("beagu_site_release_jobs_v1").update({
     status:"failed",error_code:"backend_integrated_required",finished_at:new Date().toISOString()
    }).eq("id",job.id).eq("status","queued");
    if(blocked)throw Error("claim_unavailable");
    return respond({has_job:false,backend_integrated_required:true},200,origin);
   }
  }
  const {data:claimed,error:e}=await db.from("beagu_site_release_jobs_v1")
   .update({status:"running",started_at:new Date().toISOString(),
    public_data_blob_sha:publicDataBlob})
   .eq("id",job.id).eq("status","queued").select("*").maybeSingle();
  if(e)throw Error("claim_unavailable");
  if(!claimed)return respond({has_job:false},200,origin);
  const productionSha=claimed.target==="production"?claimed.to_sha:s.production_sha;
  const stagingSha=null; // No preview archive is produced. Retain old staging history in the database.
  if(!productionSha||!SHA.test(productionSha)||(stagingSha&&!SHA.test(stagingSha)))
   return error("invalid_release_pointer",503,origin);
  return respond({has_job:true,job_id:claimed.id,action:claimed.action,
   target:claimed.target,production_sha:productionSha,staging_sha:stagingSha||null,
   version:claimed.version},200,origin);
 }
 if(action==="worker_complete"||action==="worker_fail"){
  const id=String(input.job_id||"");
  if(!/^[0-9a-f-]{36}$/.test(id))return error("invalid_job_id",400,origin);
  const {data:job,error:e}=await db.from("beagu_site_release_jobs_v1")
    .select("*").eq("id",id).maybeSingle();
  if(e||!job)return error("job_not_found",404,origin);
  if(job.status==="deployed"&&action==="worker_complete")return respond({ok:true,version:job.version,url:job.deployed_url},200,origin);
  if(job.status!=="running")return error("job_not_running",409,origin);
  if(action==="worker_fail"){
   await db.from("beagu_site_release_jobs_v1").update({
    status:"failed",finished_at:new Date().toISOString(),error_code:"deployment_failed"
   }).eq("id",id).eq("status","running");
   return respond({ok:true},200,origin);
  }
  const result=await transition("complete",{job_id:id});
  if(result.error)return error(result.error,409,origin);
  return respond(result,200,origin);
 }
 return error("invalid_action",400,origin);
}
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get("Origin")||"";
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(origin)});
 if(req.method!=="POST")return error("method_not_allowed",405,origin);
 if(origin&&!trusted.has(origin))return error("origin_not_allowed",403,origin);
 const jwt=(req.headers.get("Authorization")||"").match(/^Bearer ([A-Za-z0-9._-]+)$/)?.[1];
 if(!jwt)return error("authentication_required",401,origin);
 const raw=await req.text();
 if(raw.length>14000)return error("body_too_large",413,origin);
 let input:Record<string,unknown>;
 try{input=JSON.parse(raw);if(!input||typeof input!=="object"||Array.isArray(input))throw Error();}
 catch{return error("invalid_json",400,origin);}
 const action=String(input.action||"");
 try{
  if(action.startsWith("worker_")){
   if(!(await githubWorker(jwt)))return error("worker_auth_denied",403,origin);
   return await workerAction(input,origin);
  }
  const userId=await owner(jwt);
  if(!userId)return error("admin_mfa_required",403,origin);
  return await adminAction(input,userId,origin);
 }catch(e){
  console.error("site_release_failure",e instanceof Error?e.message:"unknown");
  return error("release_service_unavailable",503,origin);
 }
});
