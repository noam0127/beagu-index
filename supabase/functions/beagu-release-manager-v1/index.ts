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
// Integrated fixture authentication is separate from the legacy Pages publisher.
// No fixture configuration is accepted from the browser or candidate repository.
const fixtureEnabled=Deno.env.get("BEAGU_INTEGRATED_FIXTURE_MODE")==="isolated_fixture_only";
const fixtureWorkerSha=Deno.env.get("BEAGU_INTEGRATED_FIXTURE_WORKFLOW_SHA")||"";
const fixtureRegistry=Deno.env.get("BEAGU_INTEGRATED_FIXTURE_TRUSTED_REGISTRY")||"";
const HEX64=/^[a-f0-9]{64}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
async function fixtureWorker(token:string){
 if(!fixtureEnabled||!SHA.test(fixtureWorkerSha))return null;
 try{
  const {payload:p}=await jwtVerify(token,jwks,{issuer:"https://token.actions.githubusercontent.com",audience:"beagu-integrated-fixture-worker"});
  if(p.repository!==repo||p.ref!=="refs/heads/main"||
     p.workflow_ref!==repo+"/.github/workflows/beagu-release-controller.yml@refs/heads/main"||
     p.workflow_sha!==fixtureWorkerSha||p.sha!==fixtureWorkerSha||p.event_name!=="workflow_dispatch"||
     !/^[0-9]{1,24}$/.test(String(p.run_id||""))||!/^[0-9]{1,8}$/.test(String(p.run_attempt||"")))return null;
  return String(p.run_id)+":"+String(p.run_attempt);
 }catch{return null;}
}
function sortedJson(v:any):string{
 if(Array.isArray(v))return "["+v.map(sortedJson).join(",")+"]";
 if(v!==null&&typeof v==="object")return "{"+Object.keys(v).sort().map(k=>JSON.stringify(k)+":"+sortedJson(v[k])).join(",")+"}";
 return JSON.stringify(v);
}
async function fixtureHash(v:any){
 return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(sortedJson(v)))),b=>b.toString(16).padStart(2,"0")).join("");
}
function fixtureRecipe(plan:any,planSha:string,registryRaw=fixtureRegistry){
 const registry=JSON.parse(registryRaw);
 if(registry?.schema!==1||!Array.isArray(registry.recipes))throw Error("fixture_registry_invalid");
 const matches=registry.recipes.filter((r:any)=>r?.plan_sha256===planSha);
 if(matches.length!==1)throw Error("fixture_recipe_unavailable");
 const r=matches[0];
 if(r.base_sha!==plan.base_sha||r.candidate_sha!==plan.candidate_sha||
    Object.keys(r).sort().join(",")!=="base_sha,candidate_sha,plan_sha256,tasks"||
    !Array.isArray(r.tasks)||r.tasks.length<2||r.tasks.length>100)throw Error("fixture_recipe_invalid");
 const order=["backup","apply_sql","apply_scheduler","deploy_edge","verify_backend","publish_pages","verify_live"];
 const expected=new Map<string,any>(plan.inventory.filter((f:any)=>f.backend).map((f:any)=>[f.path,f]));
 if([...expected.values()].some(f=>f.manual_review_required||!["added","modified"].includes(f.status)))throw Error("manual_backend_review_required");
 const used=new Set<string>(),edges=new Set<string>(),ops:string[]=[];
 for(const t of r.tasks){
  if(!t||Object.keys(t).sort().join(",")!=="edge_function,files,op"||!order.includes(t.op)||!Array.isArray(t.files))throw Error("fixture_recipe_invalid");
  if(ops.length&&order.indexOf(ops[ops.length-1])>order.indexOf(t.op))throw Error("fixture_recipe_order");
  ops.push(t.op);
  const kind=({apply_sql:"db_review",apply_scheduler:"scheduler_review",deploy_edge:"edge_review"} as Record<string,string>)[t.op];
  if(kind){
   if(!t.files.length||(t.op!=="deploy_edge"&&(t.files.length!==1||t.edge_function!==null)))throw Error("fixture_recipe_files");
   if(t.op==="deploy_edge"){
    if(typeof t.edge_function!=="string"||!plan.edge_functions.includes(t.edge_function)||edges.has(t.edge_function))throw Error("fixture_recipe_edge");
    edges.add(t.edge_function);
   }
   for(const pin of t.files){
    const f=expected.get(pin?.path);
    if(!pin||Object.keys(pin).sort().join(",")!=="path,sha256"||!f||used.has(pin.path)||
      f.review_kinds.length!==1||f.review_kinds[0]!==kind||typeof pin.sha256!=="string"||!HEX64.test(pin.sha256)||
      (t.op==="deploy_edge"&&!pin.path.startsWith("supabase/functions/"+t.edge_function+"/")))throw Error("fixture_recipe_pin");
    used.add(pin.path);
   }
  }else if(t.files.length||t.edge_function!==null)throw Error("fixture_recipe_parameters");
 }
 const checkpoints=ops.filter(op=>["backup","verify_backend","publish_pages","verify_live"].includes(op));
 if(JSON.stringify(checkpoints)!==JSON.stringify(expected.size?["backup","verify_backend","publish_pages","verify_live"]:["publish_pages","verify_live"])||
    used.size!==expected.size||edges.size!==plan.edge_functions.length)throw Error("fixture_recipe_incomplete");
 return r;
}
async function fixtureRpc(action:string,payload:Record<string,unknown>,origin:string){
 const {data,error:e}=await db.rpc("beagu_integrated_fixture_transition_v1",{p_action:action,p:{...payload,scope:"isolated_fixture_only"}});
 if(e||!data)return error("fixture_control_unavailable",503,origin);
 if(data.error)return error(String(data.error),409,origin);
 return respond({...data,scope:"isolated_fixture_only",execution_enabled:false},200,origin);
}
async function fixtureAdmin(input:Record<string,unknown>,userId:string,origin:string){
 if(!fixtureEnabled)return error("integrated_fixture_disabled",409,origin);
 if(input.action==="integrated_fixture_status"){
  if(typeof input.job_id!=="string"||!UUID.test(input.job_id))return error("invalid_job_id",400,origin);
  return fixtureRpc("status",{job_id:input.job_id},origin);
 }
 if(input.action!=="integrated_fixture_create")return error("invalid_action",400,origin);
 const s=await state(),sha=String(input.candidate_sha||"");
 if(input.confirmed!==true||input.expected_production_sha!==s.production_sha||sha!==s.draft_sha||
    !s.production_sha||typeof input.plan_sha256!=="string"||!HEX64.test(input.plan_sha256)||
    typeof input.recipe_sha256!=="string"||!HEX64.test(input.recipe_sha256))return error("direct_confirmation_required",409,origin);
 const candidate=await directCandidate(s.production_sha,sha);
 if("error" in candidate)return error(candidate.error!,candidate.status!,origin);
 if(candidate.version!==s.draft_version||candidate.summary!==s.draft_summary)return error("direct_version_mismatch",409,origin);
 const result=await makeReviewPlan(s.production_sha,sha,candidate.version,candidate.summary,candidate.delta_files);
 if(result.plan_sha256!==input.plan_sha256)return error("integrated_plan_changed",409,origin);
 let recipe;
 try{recipe=fixtureRecipe(result.plan,result.plan_sha256);}catch{return error("fixture_recipe_unavailable",409,origin);}
 const recipeSha=await fixtureHash(recipe);
 if(recipeSha!==input.recipe_sha256)return error("fixture_recipe_changed",409,origin);
 const pins={base_sha:s.production_sha,candidate_sha:sha,plan_sha256:result.plan_sha256,recipe_sha256:recipeSha};
 const approvalSha=await fixtureHash({scope:"isolated_fixture_only",...pins,confirmed:true,approved_by:userId});
 // RPC rechecks release state under lock. Client cannot submit tasks, evidence or actor.
 return fixtureRpc("create",{...pins,approval_sha256:approvalSha,confirmed:true,tasks:recipe.tasks},origin);
}
async function fixtureWorkerAction(input:Record<string,unknown>,run:string,origin:string){
 if(typeof input.job_id!=="string"||!UUID.test(input.job_id))return error("invalid_job_id",400,origin);
 if(input.action==="worker_integrated_fixture_claim"){
  for(const key of ["observed_base","candidate_sha"])if(typeof input[key]!=="string"||!SHA.test(String(input[key])))return error("invalid_fixture_pin",400,origin);
  for(const key of ["plan_sha256","recipe_sha256"])if(typeof input[key]!=="string"||!HEX64.test(String(input[key])))return error("invalid_fixture_pin",400,origin);
  return fixtureRpc("claim",{job_id:input.job_id,observed_base:input.observed_base,candidate_sha:input.candidate_sha,
   plan_sha256:input.plan_sha256,recipe_sha256:input.recipe_sha256,worker_run:run},origin);
 }
 if(input.action==="worker_integrated_fixture_finish"){
  if(!Number.isInteger(input.idx)||Number(input.idx)<0||Number(input.idx)>=100||typeof input.lease!=="string"||!UUID.test(input.lease)||
    !input.task||typeof input.task!=="object"||Array.isArray(input.task)||
    !(input.evidence===null||(typeof input.evidence==="string"&&HEX64.test(input.evidence))))return error("invalid_step_receipt",400,origin);
  return fixtureRpc("finish",{job_id:input.job_id,idx:input.idx,lease:input.lease,task:input.task,evidence:input.evidence,worker_run:run},origin);
 }
 return error("invalid_action",400,origin);
}
// Production control route is separate from fixture and legacy identities.
// Deployment requires both independently configured Edge and database gates.
const productionControlEnabled=Deno.env.get("BEAGU_INTEGRATED_PRODUCTION_CONTROL")==="approved_v1";
const productionWorkerSha=Deno.env.get("BEAGU_INTEGRATED_PRODUCTION_WORKFLOW_SHA")||"";
const productionRegistry=Deno.env.get("BEAGU_INTEGRATED_PRODUCTION_TRUSTED_REGISTRY")||"";
const productionScope="production_integrated_v1";
async function productionWorker(token:string){
 if(!productionControlEnabled||!SHA.test(productionWorkerSha))return null;
 try{
  const {payload:p}=await jwtVerify(token,jwks,{issuer:"https://token.actions.githubusercontent.com",audience:"beagu-integrated-production-worker"});
  if(p.repository!==repo||p.ref!=="refs/heads/main"||p.workflow_ref!==repo+"/.github/workflows/beagu-release-controller.yml@refs/heads/main"||
   p.workflow_sha!==productionWorkerSha||p.sha!==productionWorkerSha||p.event_name!=="workflow_dispatch"||
   !/^[0-9]{1,24}$/.test(String(p.run_id||""))||!/^[0-9]{1,8}$/.test(String(p.run_attempt||"")))return null;
  return String(p.run_id)+":"+String(p.run_attempt);
 }catch{return null;}
}
async function productionRpc(action:string,payload:Record<string,unknown>,origin:string){
 const {data,error:e}=await db.rpc("beagu_integrated_production_transition_v1",{p_action:action,p:{...payload,scope:productionScope}});
 if(e||!data)return error("production_control_unavailable",503,origin);
 if(data.error)return error(String(data.error),409,origin);
 return respond({...data,scope:productionScope,execution_enabled:true},200,origin);
}
async function productionAdmin(input:Record<string,unknown>,userId:string,origin:string){
 if(!productionControlEnabled)return error("production_execution_disabled",409,origin);
 if(input.action==="integrated_production_status"){
  if(typeof input.job_id!=="string"||!UUID.test(input.job_id))return error("invalid_job_id",400,origin);
  return productionRpc("status",{job_id:input.job_id},origin);
 }
 if(input.action!=="integrated_production_create")return error("invalid_action",400,origin);
 const s=await state(),sha=String(input.candidate_sha||"");
 if(input.confirmed!==true||input.expected_production_sha!==s.production_sha||sha!==s.draft_sha||
    !s.production_sha||typeof input.plan_sha256!=="string"||!HEX64.test(input.plan_sha256)||
    typeof input.recipe_sha256!=="string"||!HEX64.test(input.recipe_sha256))return error("direct_confirmation_required",409,origin);
 const candidate=await directCandidate(s.production_sha,sha);
 if("error" in candidate)return error(candidate.error!,candidate.status!,origin);
 if(candidate.version!==s.draft_version||candidate.summary!==s.draft_summary)return error("direct_version_mismatch",409,origin);
 const result=await makeReviewPlan(s.production_sha,sha,candidate.version,candidate.summary,candidate.delta_files);
 if(!result.plan.backend_required||result.plan_sha256!==input.plan_sha256)return error("integrated_plan_changed",409,origin);
 let recipe;
 try{recipe=fixtureRecipe(result.plan,result.plan_sha256,productionRegistry);}catch{return error("production_recipe_unavailable",409,origin);}
 const recipeSha=await fixtureHash(recipe);
 if(recipeSha!==input.recipe_sha256)return error("production_recipe_changed",409,origin);
 const pins={base_sha:s.production_sha,candidate_sha:sha,plan_sha256:result.plan_sha256,recipe_sha256:recipeSha};
 const approvalSha=await fixtureHash({scope:productionScope,...pins,confirmed:true,approved_by:userId});
 return productionRpc("create",{...pins,approval_sha256:approvalSha,confirmed:true,tasks:recipe.tasks},origin);
}
// Final observation is independently signed and bound to a reviewed served-file
// inventory. The executor's success flag or its own hash is never sufficient.
const productionFinalKey=Deno.env.get("BEAGU_INTEGRATED_PRODUCTION_OBSERVER_KEY")||"";
const productionFinalPins=Deno.env.get("BEAGU_INTEGRATED_PRODUCTION_FINAL_PINS")||"";
async function productionFinalize(input:Record<string,unknown>,origin:string){
 const proof=input.proof as any;
 if(!HEX64.test(productionFinalKey)||!productionFinalPins)return error("production_final_observer_not_connected",409,origin);
 const q=proof?.statement;
 if(!proof||Object.keys(proof).sort().join(",")!=="signature,statement"||!q||typeof q!=="object"||
  Object.keys(q).sort().join(",")!=="base_sha,candidate_sha,final_evidence,job_id,plan_sha256,public_data_blob_sha,recipe_sha256,schema,scope,served_file_set_sha256,target,version"||
  q.schema!==1||q.scope!==productionScope||q.target!=="https://baeguindex.com/"||q.job_id!==input.job_id||!UUID.test(q.job_id)||
  !SHA.test(q.base_sha)||!SHA.test(q.candidate_sha)||q.base_sha===q.candidate_sha||!SHA.test(q.public_data_blob_sha)||
  !HEX64.test(q.plan_sha256)||!HEX64.test(q.recipe_sha256)||!HEX64.test(q.final_evidence)||!HEX64.test(q.served_file_set_sha256)||
  typeof q.version!=="string"||!allowedVersion.test(q.version)||typeof proof.signature!=="string"||!/^[A-Za-z0-9+/]{86}==$/.test(proof.signature))return error("invalid_final_observation",400,origin);
 try{
  const pins=JSON.parse(productionFinalPins);
  const expected={base_sha:q.base_sha,candidate_sha:q.candidate_sha,plan_sha256:q.plan_sha256,recipe_sha256:q.recipe_sha256,public_data_blob_sha:q.public_data_blob_sha,served_file_set_sha256:q.served_file_set_sha256,version:q.version};
  if(pins?.schema!==1||!Array.isArray(pins.pins)||pins.pins.filter((p:any)=>sortedJson(p)===sortedJson(expected)).length!==1)return error("final_observation_unapproved",409,origin);
  const key=await crypto.subtle.importKey("raw",Uint8Array.from(productionFinalKey.match(/../g)!,x=>parseInt(x,16)),{name:"Ed25519"},false,["verify"]);
  const signature=Uint8Array.from(atob(proof.signature),x=>x.charCodeAt(0));
  if(signature.length!==64||!(await crypto.subtle.verify({name:"Ed25519"},key,signature,new TextEncoder().encode(sortedJson(q)))))return error("final_observer_signature_invalid",403,origin);
  return productionRpc("finalize",{job_id:q.job_id,base_sha:q.base_sha,candidate_sha:q.candidate_sha,plan_sha256:q.plan_sha256,recipe_sha256:q.recipe_sha256,public_data_blob_sha:q.public_data_blob_sha,version:q.version,final_evidence:q.final_evidence,observer_proof_sha256:await fixtureHash(proof)},origin);
 }catch{return error("final_observation_invalid",409,origin);}
}

async function productionWorkerAction(input:Record<string,unknown>,run:string,origin:string){
 if(typeof input.job_id!=="string"||!UUID.test(input.job_id))return error("invalid_job_id",400,origin);
 if(input.action==="worker_integrated_production_status")return productionRpc("status",{job_id:input.job_id},origin);
 if(input.action==="worker_integrated_production_finalize")return productionFinalize(input,origin);
 if(input.action==="worker_integrated_production_claim"){
  for(const key of ["observed_base","candidate_sha"])if(typeof input[key]!=="string"||!SHA.test(String(input[key])))return error("invalid_production_pin",400,origin);
  for(const key of ["plan_sha256","recipe_sha256"])if(typeof input[key]!=="string"||!HEX64.test(String(input[key])))return error("invalid_production_pin",400,origin);
  return productionRpc("claim",{job_id:input.job_id,observed_base:input.observed_base,candidate_sha:input.candidate_sha,plan_sha256:input.plan_sha256,recipe_sha256:input.recipe_sha256,worker_run:run},origin);
 }
 if(input.action==="worker_integrated_production_finish"){
  if(!Number.isInteger(input.idx)||Number(input.idx)<0||Number(input.idx)>=100||typeof input.lease!=="string"||!UUID.test(input.lease)||
   !input.task||typeof input.task!=="object"||Array.isArray(input.task)||!(input.evidence===null||(typeof input.evidence==="string"&&HEX64.test(input.evidence))))return error("invalid_step_receipt",400,origin);
  return productionRpc("finish",{job_id:input.job_id,idx:input.idx,lease:input.lease,task:input.task,evidence:input.evidence,worker_run:run},origin);
 }
 return error("invalid_action",400,origin);
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
// Phase 2: a server-derived, deterministic review plan. No candidate-supplied commands,
// SQL execution, endpoint URLs, secrets, or execution permissions are accepted here.
const planPath=(p:unknown):p is string=>typeof p==="string"&&p.length>0&&p.length<=1024&&
 !/[\x00-\x1f\x7f\\]/.test(p)&&p.split("/").every(s=>s!==""&&s!=="."&&s!=="..");
const reviewKinds=new Set(["db_review","scheduler_review","edge_review","edge_shared_review","server_config_review","controller_review","ci_review","web_review","manual_review"]);
function reviewKind(path:string){
 if(/^supabase\/(?:[^/]*cron[^/]*\.sql|[^/]*scheduler[^/]*\.sql)$/.test(path))return "scheduler_review";
 if(/^supabase\/(?:migrations\/[^/]+\.sql|[^/]+\.sql)$/.test(path))return "db_review";
 if(/^supabase\/functions\/_shared\//.test(path))return "edge_shared_review";
 if(/^supabase\/functions\/[a-z0-9][a-z0-9-]*\/.+/.test(path))return "edge_review";
 if(/^supabase\/config\.toml$/.test(path))return "server_config_review";
 if(/^scripts\/release-manager\//.test(path)||/^\.github\/workflows\/(?:beagu-release-controller|deploy-github-pages-direct)\.ya?ml$/.test(path))return "controller_review";
 if(/^supabase\//.test(path))return "manual_review";
 if(/^\.github\/workflows\//.test(path))return "ci_review";
 return "web_review";
}
function reviewInventory(files:any[]){
 if(!Array.isArray(files)||!files.length||files.length>=300)throw Error("invalid_plan_inventory");
 const seen=new Set<string>();
 return files.map(f=>{
  const path=f?.filename,status=f?.status,blob=f?.sha,prior=f?.previous_filename??null;
  if(!planPath(path)||seen.has(path)||typeof blob!=="string"||!SHA.test(blob)||!/^(added|modified|removed|renamed|copied|changed|unchanged)$/.test(status)||
    ((status==="renamed"||status==="copied")?(!planPath(prior)||prior===path):prior!==null))
   throw Error("invalid_plan_inventory");
  seen.add(path);
  const kinds=[...new Set([reviewKind(path),...(prior?[reviewKind(prior)]:[])])].sort();
  if(kinds.some(k=>!reviewKinds.has(k)))throw Error("invalid_plan_inventory");
  const backend=backendPaths([{filename:path,previous_filename:prior}]).length>0;
  const manual=backend&&(status==="removed"||status==="renamed"||status==="copied"||status==="changed"||
    kinds.some(k=>["manual_review","controller_review","edge_shared_review","server_config_review"].includes(k)));
  return {path,status,blob_sha:blob,blob_ref:status==="removed"?"base":"candidate",previous_path:prior,review_kinds:kinds,backend,manual_review_required:manual};
 }).sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
}
async function makeReviewPlan(base:string,sha:string,version:string,summary:string,files:any[]){
 if(!SHA.test(base)||!SHA.test(sha)||base===sha)throw Error("invalid_plan_sha");
 const inventory=reviewInventory(files);
 const backend=inventory.filter(f=>f.backend);
 const edge_functions=[...new Set(inventory.flatMap(f=>[f.path,f.previous_path]).flatMap(p=>{
  const m=p?.match(/^supabase\/functions\/([a-z0-9][a-z0-9-]*)\//);
  return m?[m[1]]:[];
 }))].sort();
 const plan={schema:1,policy:"integrated-review-v1",repository:repo,base_sha:base,candidate_sha:sha,version,summary,
  backend_required:backend.length>0,execution_enabled:false,
  inventory,edge_functions,
  requires_shared_dependency_review:backend.some(f=>f.review_kinds.includes("edge_shared_review")),
  requires_manual_review:backend.some(f=>f.manual_review_required),
  required_checks:backend.length?["backup_review","database_review","edge_review","server_verification","pages_verification","post_release_verification"]:["pages_verification","post_release_verification"]};
 const hash=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(plan)));
 const plan_sha256=Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,"0")).join("");
 return {plan,plan_sha256};
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
 return {version,summary,files:delta.files.map((f:any)=>String(f.filename||"")).filter(Boolean),backend_required:backend_files.length>0,backend_files,delta_files:delta.files};
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
 // MFA-gated inspection only. The plan is not an approval, stored job, or authorization.
 if(action==="inspect_integrated_plan"){
  const sha=String(input.candidate_sha||"");
  if(current)return error("release_in_progress",409,origin);
  if(!s.production_sha||!s.draft_sha||sha!==s.draft_sha||input.expected_production_sha!==s.production_sha)
   return error("direct_confirmation_required",409,origin);
  const candidate=await directCandidate(s.production_sha,sha);
  if("error" in candidate)return error(candidate.error!,candidate.status!,origin);
  if(candidate.version!==s.draft_version||candidate.summary!==s.draft_summary)return error("direct_version_mismatch",409,origin);
  let result;
  try{result=await makeReviewPlan(s.production_sha,sha,candidate.version,candidate.summary,candidate.delta_files);}
  catch{return error("integrated_inventory_invalid",409,origin);}
  if(input.expected_plan_sha256!==undefined&&input.expected_plan_sha256!==result.plan_sha256)
   return error("integrated_plan_changed",409,origin);
  const latest=await state();
  if(latest.production_sha!==s.production_sha||latest.draft_sha!==sha||latest.draft_version!==candidate.version||
     latest.draft_summary!==candidate.summary||await activeJob())return error("direct_confirmation_required",409,origin);
  return respond({...result,approved:false,execution_enabled:false},200,origin);
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
  if(action.startsWith("worker_integrated_production_")){
   const run=await productionWorker(jwt);
   if(!run)return error("worker_auth_denied",403,origin);
   return await productionWorkerAction(input,run,origin);
  }
  if(action.startsWith("worker_integrated_fixture_")){
   const run=await fixtureWorker(jwt);
   if(!run)return error("worker_auth_denied",403,origin);
   return await fixtureWorkerAction(input,run,origin);
  }
  if(action.startsWith("worker_")){
   if(!(await githubWorker(jwt)))return error("worker_auth_denied",403,origin);
   return await workerAction(input,origin);
  }
  const userId=await owner(jwt);
  if(!userId)return error("admin_mfa_required",403,origin);
  if(action.startsWith("integrated_production_"))return await productionAdmin(input,userId,origin);
  if(action.startsWith("integrated_fixture_"))return await fixtureAdmin(input,userId,origin);
  return await adminAction(input,userId,origin);
 }catch(e){
  console.error("site_release_failure",e instanceof Error?e.message:"unknown");
  return error("release_service_unavailable",503,origin);
 }
});
