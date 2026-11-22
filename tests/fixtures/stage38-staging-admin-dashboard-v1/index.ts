// No admin dashboard data is sent unless live Supabase Auth MFA (AAL2) and
// a server-managed allowlist are BOTH verified for every request.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
const url=Deno.env.get("SUPABASE_URL")||"";
const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
// Stage38 isolated QA: only local test origins. Never authorize production CORS.
const allowed=new Set(["http://localhost:8000","http://127.0.0.1:8000","http://127.0.0.1:38738"]);
const headers=(origin:string)=>({
 ...(allowed.has(origin)?{"Access-Control-Allow-Origin":origin}:{}),
 "Access-Control-Allow-Methods":"POST,OPTIONS",
 "Access-Control-Allow-Headers":"authorization,apikey,content-type",
 "Access-Control-Max-Age":"3600",
 "Cache-Control":"no-store,private",
 "X-Content-Type-Options":"nosniff",
 "Vary":"Origin"
});
const send=(body:Record<string,unknown>,status:number,origin:string)=>new Response(JSON.stringify(body),{
 status,headers:{...headers(origin),"Content-Type":"application/json;charset=utf-8"}
});
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function trustedClaims(jwt:string):{sub?:string;session_id?:string;aal?:string}|null {
 try{
  const part=jwt.split(".")[1]; if(!part)return null;
  return JSON.parse(atob(part.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(part.length/4)*4,"=")));
 }catch{return null;}
}
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get("origin")||"";
 if(origin&&!allowed.has(origin))return send({error:"origin_not_allowed"},403,origin);
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:headers(origin)});
 if(req.method!=="POST")return send({error:"method_not_allowed"},405,origin);
 if(Number(req.headers.get("content-length")||"0")>2048)return send({error:"invalid_request"},413,origin);
 const bearer=/^Bearer ([A-Za-z0-9._-]+)$/.exec(req.headers.get("authorization")||"");
 if(!bearer)return send({error:"authentication_required"},401,origin);
 const jwt=bearer[1];
 const {data:userData,error:userError}=await admin.auth.getUser(jwt);
 const actor=userData?.user?.id||"";
 const claims=trustedClaims(jwt);
 if(userError||!actor||claims?.sub!==actor||!claims.session_id||!uuid.test(claims.session_id))
  return send({error:"authentication_required"},401,origin);
 let input:Record<string,unknown>;
 try{input=await req.json()}catch{return send({error:"invalid_request"},400,origin);}
 if(input?.action!=="dashboard" && input?.action!=="live_traffic")return send({error:"invalid_action"},400,origin);
 const period=input?.period;
 if(typeof period!=="string"||!["today","7d","30d","all"].includes(period))
  return send({error:"invalid_period"},400,origin);
 try{
  const {data:account,error:accountError}=await admin.from("beagu_admin_accounts")
   .select("role,enabled").eq("user_id",actor).maybeSingle();
  if(accountError)return send({error:"authorization_unavailable"},503,origin);
  if(!account?.enabled)return send({error:"access_denied"},403,origin);
  if(claims.aal!=="aal2")return send({error:"mfa_required"},403,origin);
  const {data:live,error:liveError}=await admin.rpc("beagu_admin_active_mfa_session",
   {p_user:actor,p_session:claims.session_id});
  if(liveError)return send({error:"authorization_unavailable"},503,origin);
  if(live!==true)return send({error:"session_expired"},401,origin);
  // Lightweight, MFA-gated polling endpoint: no raw visitor data is returned.
  if(input.action==="live_traffic"){
   const [trafficResult,performanceResult,telemetryResult]=await Promise.all([
    admin.rpc("beagu_admin_live_traffic_v1",{p_period:period}),
    admin.rpc("beagu_admin_page_perf_v1",{p_period:period}),
    admin.rpc("beagu_admin_telemetry_health_v2")
   ]);
   const {data:traffic,error:trafficError}=trafficResult;
   if(trafficError||!traffic){
    console.error("admin_live_traffic_error",trafficError?.code||"unknown");
    return send({error:"metrics_unavailable"},503,origin);
   }
   if(performanceResult.error)
    console.error("admin_page_perf_error",performanceResult.error.code||"unknown");
   if(telemetryResult.error)
    console.error("admin_telemetry_health_error",telemetryResult.error.code||"unknown");
   return send({traffic,performance:performanceResult.error?null:performanceResult.data,
    telemetry_health:telemetryResult.error?null:telemetryResult.data},200,origin);
  }
  const {data,error}=await admin.rpc("beagu_admin_dashboard_v1",{p_period:period});
  if(error||!data){console.error("dashboard_aggregate_error",error?.code||"unknown");
   return send({error:"metrics_unavailable"},503,origin);}
  // Private, aggregated referral funnel; the MFA+allowlist gate above is mandatory.
  // If funnel telemetry is unavailable, other administrator statistics still render.
  const {data:referralFunnel,error:referralError}=await admin.rpc(
    "beagu_admin_referral_funnel_v1",{p_period:period}
  );
  if(referralError)console.error("admin_referral_funnel_unavailable",referralError.code||"unknown");
  // Only retained Top-100-ranked anonymous score rows, no session/IP hash or player identity.
  const {data:recentScores,error:scoresError}=await admin.from("arcade_game_scores")
    .select("game,score,created_at,school_name,difficulty").order("created_at",{ascending:false}).limit(100);
  if(scoresError)return send({error:"metrics_unavailable"},503,origin);
  const {error:auditError}=await admin.from("beagu_admin_audit_events").insert({
    actor_user_id:actor,event_type:"admin_dashboard_read",outcome:"success",
    details:{period}
  });
  if(auditError){console.error("admin_dashboard_audit_error",auditError.code);
   return send({error:"audit_unavailable"},503,origin);}
  return send({analytics:{...data,retained_game_scores:recentScores||[],referral_funnel:referralError?null:referralFunnel}},200,origin);
 }catch(e){
  console.error("admin_dashboard_unavailable",e instanceof Error?e.name:"unknown");
  return send({error:"service_unavailable"},503,origin);
 }
});