// Secure release command API. User-facing operations require owner Auth + active AAL2.
// GitHub Actions worker operations require a signed GitHub OIDC token restricted to this repo/workflow.
import {createClient} from "https://esm.sh/@supabase/supabase-js@2.58.0";
import {createRemoteJWKSet,jwtVerify} from "https://esm.sh/jose@5.10.0";

const db=createClient(Deno.env.get("SUPABASE_URL")||"",Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"",{
  auth:{persistSession:false,autoRefreshToken:false}
});
const repo="noam0127/beagu-index";
const mainApi="https://api.github.com/repos/"+repo;
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
  "Accept":"application/vnd.github+json","User-Agent":"beaguindex-release-v1"
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
  const [stageHistory,prodHistory]=await Promise.all([history("staging"),history("production")]);
  let head=null,suggested_draft=null;
  if(input.check_latest===true)try{
   const latest=await github("/commits/main");
   head=typeof latest.sha==="string"?latest.sha:null;
   if(head&&head!==s.production_sha){
    const proposal=await latestManifest();
    if(proposal)suggested_draft={...proposal,sha:head};
   }
  }catch{ /* The release state and history remain available during GitHub outages. */ }
  return respond({state:s,job:current,head_sha:head,suggested_draft,staging_history:stageHistory,
    production_history:prodHistory,staging_url:"https://baeguindex.com/_preview/",
    production_url:"https://baeguindex.com/"},200,origin);
 }
 if(current)return error("release_in_progress",409,origin);
 if(!s.production_sha)return error("release_bootstrap_pending",409,origin);
 if(action==="register"){
  const version=String(input.version||"").trim();
  const summary=String(input.summary||"").trim();
  if(!allowedVersion.test(version)||summary.length<3||summary.length>500)
   return error("invalid_release_metadata",400,origin);
  const main=await github("/commits/main");
  if(!SHA.test(String(main.sha||"")))return error("github_unavailable",503,origin);
  if(main.sha===s.production_sha)return error("no_changes_since_production",409,origin);
  const files=await changedFiles(s.production_sha,main.sha);
  if(!files.length)return error("no_changes_since_production",409,origin);
  const {error:e}=await db.from("beagu_site_release_state_v1").update({
    draft_sha:main.sha,draft_version:version,draft_summary:summary,updated_at:new Date().toISOString()
  }).eq("id",1);
  if(e)throw Error("save_unavailable");
  return respond({draft_sha:main.sha,version,summary,changed_count:files.length,
    changed_files:files.slice(0,25)},200,origin);
 }
 let job:null|{action:string;target:string;to_sha:string|null;from_sha:string|null;version:string;summary:string;created_by:string}=null;
 if(action==="stage_apply"&&input.mirror_production===true){
  if(!SHA.test(String(s.production_sha))||input.expected_production_sha!==s.production_sha)return error("production_changed",409,origin);
  if(s.staging_sha===s.production_sha)return error("already_on_staging",409,origin);
  job={action,target:"staging",from_sha:s.staging_sha,to_sha:s.production_sha,
   version:s.production_version||"운영 기준 동기화",summary:"현재 실제 웹의 승인된 코드만 시험 웹으로 복제",created_by:userId};
 }else if(action==="stage_apply"){
  let candidateSha=s.draft_sha,candidateVersion=s.draft_version,candidateSummary=s.draft_summary;
  // ChatGPT can commit a release-candidate.json alongside changes.
  // Clicking the stage button then registers that version automatically.
  const latest=await github("/commits/main");
  const proposed=await latestManifest();
  if(proposed&&SHA.test(String(latest?.sha||""))&&latest.sha!==s.production_sha
     &&latest.sha!==s.draft_sha){
   const files=await changedFiles(s.production_sha,latest.sha);
   if(!files.length)return error("no_changes_since_production",409,origin);
   candidateSha=latest.sha;candidateVersion=proposed.version;candidateSummary=proposed.summary;
   const {error:draftErr}=await db.from("beagu_site_release_state_v1").update({
    draft_sha:candidateSha,draft_version:candidateVersion,draft_summary:candidateSummary,
    updated_at:new Date().toISOString()
   }).eq("id",1);
   if(draftErr)throw Error("save_unavailable");
  }
  if(!candidateSha||!SHA.test(candidateSha)||!candidateVersion||!candidateSummary)
   return error("register_version_first",409,origin);
  if(candidateSha===s.staging_sha)return error("already_on_staging",409,origin);
  job={action,target:"staging",from_sha:s.staging_sha,to_sha:candidateSha,
   version:candidateVersion,summary:candidateSummary,created_by:userId};
 }else if(action==="stage_rollback"){
  const prev=(await history("staging"))[0];
  if(!prev||prev.from_sha===s.staging_sha)return error("no_staging_rollback",409,origin);
  job={action,target:"staging",from_sha:s.staging_sha,to_sha:prev.from_sha,
   version:"이전 시험 버전",summary:"시험 웹 이전 배포 복원",created_by:userId};
 }else if(action==="prod_apply"){
  if(!s.staging_sha||!SHA.test(s.staging_sha))return error("staging_required",409,origin);
  if(s.staging_sha===s.production_sha)return error("already_on_production",409,origin);
  const verifiedStage=(await history("staging"))[0];
  if(verifiedStage?.to_sha!==s.staging_sha||verifiedStage?.deployed_url!=="https://baegu-index-test.vercel.app/")return error("staging_proof_required",409,origin);
  // Only allow a staging build that contains all deployed production changes.
  if(s.production_sha&&SHA.test(s.production_sha)){
   const delta=await github("/compare/"+s.production_sha+"..."+s.staging_sha);
   if(!["ahead","identical"].includes(String(delta.status||"")))
    return error("staging_is_stale",409,origin);
  }
  if(input.confirmed_tested!==true)return error("test_confirmation_required",400,origin);
  job={action,target:"production",from_sha:s.production_sha,to_sha:s.staging_sha,
   version:s.staging_version||"시험 승인 버전",summary:"관리자 시험 웹 확인 후 운영 적용",created_by:userId};
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
 }else return error("invalid_action",400,origin);
 const queued=await enqueue(job);
 if("error" in queued)return error(queued.error,queued.status,origin);
 await db.from("beagu_admin_audit_events").insert({
  actor_user_id:userId,event_type:"site_release_"+action,outcome:"success",
  details:{job_id:queued.id,target:job.target,from_sha:job.from_sha,to_sha:job.to_sha,version:job.version}
 });
 return respond({queued:true,job_id:queued.id,action,service:"GitHub Actions (scheduled dispatcher)"},202,origin);
}
async function workerAction(input:Record<string,unknown>,origin:string):Promise<Response>{
 const action=String(input.action||"");
 if(action==="worker_next"){
  const s=await state();
  // Prevent a cancelled worker from blocking releases forever.
  const {data:stale}=await db.from("beagu_site_release_jobs_v1").select("id,started_at")
   .eq("status","running").lt("started_at",new Date(Date.now()-55*60000).toISOString());
  for(const row of stale||[]) await db.from("beagu_site_release_jobs_v1")
   .update({status:"failed",error_code:"worker_timeout",finished_at:new Date().toISOString()})
   .eq("id",row.id).eq("status","running");
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
  const {data:claimed,error:e}=await db.from("beagu_site_release_jobs_v1")
   .update({status:"running",started_at:new Date().toISOString(),
    public_data_blob_sha:publicDataBlob})
   .eq("id",job.id).eq("status","queued").select("*").maybeSingle();
  if(e)throw Error("claim_unavailable");
  if(!claimed)return respond({has_job:false},200,origin);
  const productionSha=claimed.target==="production"?claimed.to_sha:s.production_sha;
  const stagingSha=claimed.target==="staging"?claimed.to_sha:s.staging_sha;
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
  if(job.status!=="running")return error("job_not_running",409,origin);
  if(action==="worker_fail"){
   await db.from("beagu_site_release_jobs_v1").update({
    status:"failed",finished_at:new Date().toISOString(),error_code:"deployment_failed"
   }).eq("id",id).eq("status","running");
   return respond({ok:true},200,origin);
  }
  if(job.target==="staging"&&(input.verified_stage_sha!==job.to_sha||input.verified_stage_url!=="https://baegu-index-test.vercel.app/"||!/^dpl_[A-Za-z0-9]+$/.test(String(input.verified_deployment_id||""))))return error("staging_proof_required",409,origin);
  const current=await state();
  const update=job.action==="data_refresh"?
   {public_data_blob_sha:job.public_data_blob_sha,updated_at:new Date().toISOString()}:
   job.target==="staging"?
   {staging_sha:job.to_sha,staging_version:job.version,
    public_data_blob_sha:job.public_data_blob_sha||current.public_data_blob_sha,
    updated_at:new Date().toISOString()}:
   {production_sha:job.to_sha,production_version:job.version,
    public_data_blob_sha:job.public_data_blob_sha||current.public_data_blob_sha,
    updated_at:new Date().toISOString()};
  const {error:stErr}=await db.from("beagu_site_release_state_v1").update(update).eq("id",1);
  if(stErr)throw Error("commit_unavailable");
  const deployedUrl=job.target==="staging"?"https://baegu-index-test.vercel.app/":"https://baeguindex.com/";
  const {error:histErr}=await db.from("beagu_site_release_history_v1").insert({
   job_id:id,target:job.target,action:job.action,version:job.version,summary:job.summary,
   from_sha:job.from_sha,to_sha:job.to_sha,deployed_url:deployedUrl
  });
  if(histErr&&histErr.code!=="23505")throw Error("history_unavailable");
  const {error:jobErr}=await db.from("beagu_site_release_jobs_v1").update({
   status:"deployed",finished_at:new Date().toISOString(),deployed_url:deployedUrl
  }).eq("id",id).eq("status","running");
  if(jobErr)throw Error("finalize_unavailable");
  return respond({ok:true,version:job.version,url:deployedUrl},200,origin);
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
