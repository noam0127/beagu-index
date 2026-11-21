import { createClient } from "npm:@supabase/supabase-js@2.57.0";

// v1.1.0 stage-14 DRAFT. Deploy only AFTER approved database migration,
// encrypted DB backup and isolated restore verification. No SMS is sent here.
const SUPABASE_URL=Deno.env.get("SUPABASE_URL")||"";
const SERVICE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const ALLOWED=new Set(["https://baeguindex.com"]);
const db=SUPABASE_URL&&SERVICE_KEY
 ?createClient(SUPABASE_URL,SERVICE_KEY,{
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}
 }):null;
const AUTH= /^Bearer [A-Za-z0-9_.-]{20,8000}$/;
const PHONE=/^010[0-9]{8}$/;

function headers(req:Request){
 const origin=req.headers.get("origin")||"";
 const cors:Record<string,string>={
  "Content-Type":"application/json; charset=utf-8",
  "Cache-Control":"no-store",
  "Referrer-Policy":"no-referrer",
  "X-Content-Type-Options":"nosniff",
  "Vary":"Origin",
  "Access-Control-Allow-Methods":"POST,OPTIONS",
  "Access-Control-Allow-Headers":"authorization,apikey,content-type"
 };
 if(ALLOWED.has(origin))cors["Access-Control-Allow-Origin"]=origin;
 return cors;
}
function json(req:Request,body:Record<string,unknown>,status=200){
 return new Response(JSON.stringify(body),{status,headers:headers(req)});
}
function fail(req:Request,code:string,status:number){
 return json(req,{ok:false,error:code},status);
}
async function boundedJson(req:Request):Promise<Record<string,unknown>|null>{
 if(!req.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
  return null;
 if(Number(req.headers.get("content-length")||0)>1024)return null;
 const reader=req.body?.getReader();if(!reader)return null;
 let size=0;let text="";const decoder=new TextDecoder();
 for(;;){
  const {value,done}=await reader.read();
  if(done)break;
  size+=(value?.byteLength||0);
  if(size>1024){await reader.cancel();return null}
  text+=decoder.decode(value,{stream:true});
 }
 text+=decoder.decode();
 try{
  const body=JSON.parse(text);
  return body&&typeof body==="object"&&!Array.isArray(body)?body:null;
 }catch{return null}
}
async function userFromToken(req:Request){
 const bearer=req.headers.get("authorization")||"";
 if(!AUTH.test(bearer)||!db)return null;
 const jwt=bearer.slice(7);
 const {data,error}=await db.auth.getUser(jwt);
 const user=data?.user;
 if(error||!user||user.is_anonymous||!user.email_confirmed_at)return null;
 return user;
}
// Drop old metadata phone, if any. This is a PRIVACY cleanup, not proof of consent.
// Failure MUST NOT be silently reported as full deletion; operators must reconcile.
async function scrubOldAuthMetadata(id:string){
 if(!db)return false;
 const {error}=await db.auth.admin.updateUserById(id,{
  user_metadata:{
   beagu_sms_phone:null,
   beagu_sms_opt_in:false,
   beagu_phone_collection_opt_in:false
  }
 });
 return !error;
}
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get("origin")||"";
 if(origin&&!ALLOWED.has(origin))return fail(req,"ORIGIN_NOT_ALLOWED",403);
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:headers(req)});
 if(req.method!=="POST")return fail(req,"METHOD_NOT_ALLOWED",405);
 if(!db)return fail(req,"UNAVAILABLE",503);
 const user=await userFromToken(req).catch(()=>null);
 if(!user)return fail(req,"AUTH_REQUIRED",401);
 const body=await boundedJson(req);
 if(!body)return fail(req,"INVALID_REQUEST",400);
 const action=body.action;
 if(action!=="status"&&action!=="opt_in"&&action!=="withdraw")
  return fail(req,"INVALID_ACTION",400);
 if(action==="status"){
  const {data,error}=await db.rpc("beagu_member_sms_status_v2",{p_user:user.id});
  if(error)return fail(req,"UNAVAILABLE",503);
  // No phone, email or other personally identifying fields in the response.
  return json(req,{
   ok:true,
   consented:data?.consented===true,
   phoneVerified:data?.phone_verified===true,
   sendEligible:data?.send_eligible===true
  });
 }
 if(action==="opt_in"){
  if(body.collectionConsent!==true||body.smsConsent!==true)
   return fail(req,"BOTH_CONSENTS_REQUIRED",400);
  if(typeof body.phone!=="string")return fail(req,"INVALID_PHONE",400);
  const phone=body.phone.replace(/[^0-9]/g,"");
  if(!PHONE.test(phone))return fail(req,"INVALID_PHONE",400);
  // Never trust a user_id, role, timestamp, phone_verified or version sent by client.
  const {data,error}=await db.rpc("beagu_member_sms_grant_v2",{
   p_user:user.id,p_phone:phone,p_collection:true,p_marketing:true,
   p_request_id:crypto.randomUUID()
  });
  if(error||data?.ok!==true)return fail(req,"UNAVAILABLE",503);
  // If a legacy signup stored phone in user_metadata, purge it too.
  if(!await scrubOldAuthMetadata(user.id))
   return fail(req,"METADATA_CLEANUP_PENDING",503);
  return json(req,{ok:true,consented:true,phoneVerified:false,sendEligible:false});
 }
 const {data,error}=await db.rpc("beagu_member_sms_withdraw_v2",{
  p_user:user.id,p_request_id:crypto.randomUUID()
 });
 if(error||data?.ok!==true)return fail(req,"UNAVAILABLE",503);
 if(!await scrubOldAuthMetadata(user.id))
  return fail(req,"METADATA_CLEANUP_PENDING",503);
 // Private database phone and historical Auth metadata have both been cleared.
 return json(req,{ok:true,consented:false,phoneVerified:false,sendEligible:false});
});
