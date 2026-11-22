// Stage38 once-only real Chromium UI fixture endpoint. STAGING PROJECT ONLY.
// All browser credentials are disposable, returned only over GitHub OIDC-authenticated
// HTTPS to a dedicated same-repository PR #244 CI job, never committed or logged.
// This endpoint must be replaced with HTTP 410 after verified cleanup.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { createRemoteJWKSet, jwtVerify } from "https://esm.sh/jose@5.10.0";
const REF = "ycwuugggqbunlbwuzvbx";
const AUD = "beagu-stage38-browser-e2e";
const REPO = "noam0127/beagu-index";
const WF = REPO+"/.github/workflows/stage38-real-browser-auth-e2e.yml@refs/pull/244/merge";
const JWKS = createRemoteJWKSet(new URL("https://token.actions.githubusercontent.com/.well-known/jwks"));
const answer=(status:number,body:object)=>new Response(JSON.stringify(body),{
 status, headers:{"Content-Type":"application/json; charset=utf-8",
 "Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}
});
const pass=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),
 b=>b.toString(16).padStart(2,"0")).join("");
Deno.serve(async(request:Request)=>{
 if(request.method!=="POST")return answer(405,{error:"method_not_allowed"});
 if(request.headers.has("Origin"))return answer(403,{error:"browser_origin_denied"});
 const jwt=request.headers.get("Authorization")?.match(/^Bearer ([A-Za-z0-9._-]+)$/)?.[1];
 if(!jwt)return answer(401,{error:"signed_ci_token_required"});
 let runId="";
 try{
   const {payload}=await jwtVerify(jwt,JWKS,{
     issuer:"https://token.actions.githubusercontent.com",audience:AUD
   });
   const expected = payload.repository===REPO &&
     payload.event_name==="pull_request" &&
     payload.ref==="refs/pull/244/merge" &&
     payload.workflow_ref===WF &&
     payload.head_ref==="hotfix/v1.1.0-preview-backend-isolation" &&
     payload.base_ref==="main";
   if(!expected)return answer(403,{error:"untrusted_ci_context"});
   runId=String(payload.run_id||"");
   if(!/^\d{8,20}$/.test(runId))return answer(403,{error:"invalid_ci_run"});
 }catch{return answer(403,{error:"untrusted_ci_token"});}
 const url=Deno.env.get("SUPABASE_URL")||"";
 const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 if(url!=="https://"+REF+".supabase.co"||!key)return answer(503,{error:"isolated_staging_only"});
 const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 let input:Record<string,unknown>;
 try{
   const raw=await request.text();if(raw.length>1000)throw Error();
   const value:unknown=JSON.parse(raw);
   if(!value||typeof value!=="object"||Array.isArray(value))throw Error();
   input=value as Record<string,unknown>;
 }catch{return answer(400,{error:"invalid_request"});}
 if(input.action!=="create"&&input.action!=="cleanup")return answer(403,{error:"unsupported_action"});
 const {data:users,error:listError}=await client.auth.admin.listUsers({page:1,perPage:200});
 if(listError)return answer(503,{error:"auth_inventory_unavailable"});
 // Staging-only synthetic test account is selected by immutable OIDC run claim.
 const matching=(users?.users||[]).filter(u=>
   u.app_metadata?.stage38_browser_qa===true &&
   String(u.app_metadata?.stage38_run_id||"")===runId);
 if(input.action==="cleanup"){
   let deleted=0,failures=0;
   for(const user of matching){
     const a=await client.from("beagu_admin_accounts").delete().eq("user_id",user.id);
     const b=await client.auth.admin.deleteUser(user.id);
     if(a.error||b.error)failures++;else deleted++;
   }
   return answer(failures?503:200,{ok:failures===0,deleted,failures});
 }
 if(matching.length)return answer(409,{error:"fixture_already_exists"});
 const {count,error:countError}=await client.from("beagu_admin_accounts")
    .select("user_id",{head:true,count:"exact"});
 if(countError||count!==0)return answer(409,{error:"admin_test_baseline_not_empty"});
 if((users?.users||[]).length!==0)return answer(409,{error:"auth_users_baseline_not_empty"});
 const email="stage38-browser-"+runId+"-"+crypto.randomUUID().slice(0,8)+"@example.invalid";
 const password=pass();
 const result=await client.auth.admin.createUser({email,password,email_confirm:true,
   app_metadata:{stage38_browser_qa:true,stage38_run_id:runId}});
 if(result.error||!result.data.user?.id)return answer(503,{error:"create_auth_fixture_failed"});
 const id=result.data.user.id;
 const owner=await client.from("beagu_admin_accounts").insert({user_id:id,role:"owner",enabled:true});
 if(owner.error){
   await client.auth.admin.deleteUser(id);
   return answer(503,{error:"create_owner_fixture_failed"});
 }
 // The sole intentional output of ephemeral credentials; never print in CI logs.
 return answer(200,{ok:true,email,password});
});
