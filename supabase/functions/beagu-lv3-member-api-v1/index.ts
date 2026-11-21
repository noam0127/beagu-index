// Stage 19: server-only Lv3 session issuance/verification, disabled by default.
// DO NOT deploy until encrypted backup, original 2026 survey evidence and
// device ownership have been independently verified and approved.
// Lv0-2 participation-code API is unchanged; Lv3 is NEVER a code-only tier.
import {createClient} from "npm:@supabase/supabase-js@2.57.0";

const url=Deno.env.get("SUPABASE_URL")||"";
const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const db=url&&key?createClient(url,key,{
 auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}
}):null;
const allowed=new Set([
 "https://baeguindex.com","https://www.baeguindex.com"
]);
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const tokenHex=/^[a-f0-9]{64}$/;
const encoder=new TextEncoder();

function headers(origin:string):Record<string,string>{
 const h:Record<string,string>={
  "Content-Type":"application/json; charset=utf-8",
  "Cache-Control":"private, no-store",
  "Referrer-Policy":"no-referrer",
  "X-Content-Type-Options":"nosniff",
  "Vary":"Origin",
  "Access-Control-Allow-Methods":"POST,OPTIONS",
  "Access-Control-Allow-Headers":"authorization,apikey,content-type,x-beagu-level-session"
 };
 if(allowed.has(origin))h["Access-Control-Allow-Origin"]=origin;
 return h;
}
function respond(origin:string,status:number,body:Record<string,unknown>){
 return new Response(JSON.stringify(body),{status,headers:headers(origin)});
}
function fail(origin:string,status:number,error:string){
 return respond(origin,status,{ok:false,error});
}
async function sha256(token:string){
 const hashed=new Uint8Array(await crypto.subtle.digest("SHA-256",encoder.encode(token)));
 return Array.from(hashed,b=>b.toString(16).padStart(2,"0")).join("");
}
function parseSessionId(jwt:string){
 try{
  const raw=jwt.split(".")[1]||"";
  if(raw.length<10||raw.length>8000)return null;
  const base=raw.replace(/-/g,"+").replace(/_/g,"/");
  const claims=JSON.parse(atob(base.padEnd(Math.ceil(base.length/4)*4,"=")));
  return typeof claims.session_id==="string"&&uuid.test(claims.session_id)
   ?claims.session_id:null;
 }catch{return null}
}
async function verifiedAuth(req:Request){
 if(!db)return null;
 const match=/^Bearer ([A-Za-z0-9_.-]{20,8000})$/.exec(
   req.headers.get("Authorization")||"");
 if(!match)return null;
 // getUser() validates the signature and expiry. A session_id extracted
 // from the JWT only becomes trusted AFTER getUser() passes.
 const {data,error}=await db.auth.getUser(match[1]);
 if(error||!data?.user||data.user.is_anonymous||
   !data.user.email_confirmed_at)return null;
 const sid=parseSessionId(match[1]);
 if(!sid)return null;
 const {data:live,error:sessionError}=await db.rpc("beagu_member_live_session_v1",{
  p_user:data.user.id,p_session:sid
 });
 if(sessionError||live!==true)return null;
 return {userId:data.user.id,sessionId:sid};
}
async function verifiedLv2(req:Request){
 if(!db)return null;
 const raw=(req.headers.get("X-Beagu-Level-Session")||"").trim();
 if(!tokenHex.test(raw))return null;
 const {data,error}=await db.from("beagu_level_sessions")
  .select("identity_campaign,identity_visitor_id,access_level")
  .eq("token_sha256",await sha256(raw))
  .gt("expires_at",new Date().toISOString()).maybeSingle();
 if(error||!data||data.identity_campaign!=="2026"||
    !uuid.test(String(data.identity_visitor_id||""))||
    Number(data.access_level)<2)return null;
 // Stage 17 canonical verifier re-evaluates own Google Form evidence,
 // quality-reviewed credited referral, and disqualified referral revocation.
 const visitorId=String(data.identity_visitor_id);
 const {data:level,error:levelError}=await db.rpc(
  "beagu_2026_verified_visitor_level_v1",{p_visitor:visitorId});
 if(levelError||level!==2)return null;
 return visitorId;
}
async function boundedBody(req:Request){
 if(!(req.headers.get("Content-Type")||"").toLowerCase()
   .startsWith("application/json"))return null;
 if(Number(req.headers.get("Content-Length")||0)>512)return null;
 if(!req.body)return null;
 const reader=req.body.getReader();
 const decoder=new TextDecoder();
 let body="",size=0;
 for(;;){
  const {value,done}=await reader.read();if(done)break;
  size+=value?.byteLength||0;
  if(size>512){await reader.cancel();return null}
  body+=decoder.decode(value,{stream:true});
 }
 try{
  const parsed=JSON.parse(body+decoder.decode());
  return parsed&&typeof parsed==="object"&&!Array.isArray(parsed)
   ?parsed as Record<string,unknown>:null;
 }catch{return null}
}
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get("Origin")||"";
 if(origin&&!allowed.has(origin))return fail(origin,403,"ORIGIN_DENIED");
 if(req.method==="OPTIONS"){
  return new Response(null,{status:204,headers:headers(origin)});
 }
 if(req.method!=="POST")return fail(origin,405,"METHOD_NOT_ALLOWED");
 if(!db)return fail(origin,503,"UNAVAILABLE");
 const auth=await verifiedAuth(req).catch(()=>null);
 if(!auth)return fail(origin,401,"AUTH_REQUIRED");
 const body=await boundedBody(req);
 if(!body)return fail(origin,400,"INVALID_BODY");
 const action=body.action;
 if(!["issue","verify","logout"].includes(String(action)))
  return fail(origin,400,"INVALID_ACTION");
 const visitor=await verifiedLv2(req).catch(()=>null);
 if(!visitor)return fail(origin,403,"LV2_REQUIRED");

 if(action==="issue"){
  const secret=Array.from(crypto.getRandomValues(new Uint8Array(32)),
   n=>n.toString(16).padStart(2,"0")).join("");
  const {data,error}=await db.rpc("beagu_lv3_issue_session_v1",{
   p_hash:await sha256(secret),p_user:auth.userId,
   p_auth_session:auth.sessionId,p_visitor:visitor
  });
  if(error)return fail(origin,503,"ISSUE_UNAVAILABLE");
  if(data?.ok!==true){
   if(data?.reason==="NOT_RELEASED")return fail(origin,403,"LV3_NOT_RELEASED");
   if(data?.reason==="RATE_LIMITED")return fail(origin,429,"RATE_LIMITED");
   return fail(origin,403,"MEMBERSHIP_NOT_VERIFIED");
  }
  // The random opaque token is returned ONCE; only SHA-256 stored server-side.
  // The browser must not use this flag alone to unlock protected data.
  return respond(origin,200,{ok:true,level:3,
   token:secret,expiresAt:data.expiresAt});
 }
 const issuedToken=typeof body.token==="string"?body.token:"";
 if(!tokenHex.test(issuedToken))return fail(origin,403,"TOKEN_REQUIRED");
 const digest=await sha256(issuedToken);
 if(action==="verify"){
  const {data,error}=await db.rpc("beagu_lv3_verify_session_v1",{
   p_hash:digest,p_user:auth.userId,
   p_auth_session:auth.sessionId,p_visitor:visitor
  });
  if(error)return fail(origin,503,"VERIFY_UNAVAILABLE");
  return data===true
   ?respond(origin,200,{ok:true,level:3,verified:true})
   :fail(origin,403,"LV3_NOT_VERIFIED");
 }
 if(action==="logout"){
  const {error}=await db.rpc("beagu_lv3_revoke_session_v1",{
   p_hash:digest,p_user:auth.userId,p_auth_session:auth.sessionId
  });
  if(error)return fail(origin,503,"LOGOUT_UNAVAILABLE");
  return respond(origin,200,{ok:true,revoked:true});
 }
 return fail(origin,400,"INVALID_ACTION");
});
