// Stage 16 DRAFT — not deployable until DB backup/restore & FK/privacy
// cleanup checklist completed. This endpoint NEVER deletes auth.users.
import {createClient} from "npm:@supabase/supabase-js@2.57.0";

const url=Deno.env.get("SUPABASE_URL")||"";
const secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const db=url&&secret?createClient(url,secret,{
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}
}):null;
const allowed=new Set(["https://baeguindex.com","https://www.baeguindex.com"]);
const jwtPattern=/^Bearer ([A-Za-z0-9_.-]{20,8000})$/;
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

function headers(origin:string){
 const h:Record<string,string>={
  "Content-Type":"application/json; charset=utf-8",
  "Cache-Control":"private, no-store",
  "Referrer-Policy":"no-referrer",
  "X-Content-Type-Options":"nosniff",
  "Vary":"Origin",
  "Access-Control-Allow-Methods":"POST,OPTIONS",
  "Access-Control-Allow-Headers":"authorization,apikey,content-type"
 };
 if(allowed.has(origin))h["Access-Control-Allow-Origin"]=origin;
 return h;
}
function respond(origin:string,status:number,result:Record<string,unknown>){
 return new Response(JSON.stringify(result),{status,headers:headers(origin)});
}
function error(origin:string,status:number,code:string){
 return respond(origin,status,{ok:false,error:code});
}
async function parseBoundedJSON(req:Request){
 if(!req.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
  return null;
 if(Number(req.headers.get("content-length")||0)>1024)return null;
 if(!req.body)return null;
 const reader=req.body.getReader(),decoder=new TextDecoder();
 let bytes=0,raw="";
 for(;;){
  const {value,done}=await reader.read();
  if(done)break;
  bytes+=value?.byteLength||0;
  if(bytes>1024){await reader.cancel();return null}
  raw+=decoder.decode(value,{stream:true});
 }
 raw+=decoder.decode();
 try{
  const v=JSON.parse(raw);
  return v&&typeof v==="object"&&!Array.isArray(v)
   ?v as Record<string,unknown>:null;
 }catch{return null}
}
function jwtSession(token:string):string|null{
 try{
  const part=token.split(".")[1];if(!part)return null;
  const base=part.replace(/-/g,"+").replace(/_/g,"/");
  const claims=JSON.parse(atob(base.padEnd(Math.ceil(base.length/4)*4,"=")));
  return typeof claims.session_id==="string"&&uuid.test(claims.session_id)
   ?claims.session_id:null;
 }catch{return null}
}
async function auth(req:Request){
 if(!db)return null;
 const match=jwtPattern.exec(req.headers.get("authorization")||"");
 if(!match)return null;
 // Auth server verifies signature and expiry. Parsed session_id is *only*
 // consulted after getUser verifies the token; it cannot grant access itself.
 const {data,error:authError}=await db.auth.getUser(match[1]);
 const user=data?.user;
 if(authError||!user||user.is_anonymous||!user.email_confirmed_at)
  return null;
 const sid=jwtSession(match[1]);if(!sid)return null;
 const {data:live,error:sessionError}=await db.rpc("beagu_member_live_session_v1",{
  p_user:user.id,p_session:sid
 });
 if(sessionError||live!==true)return null;
 return user;
}
Deno.serve(async req=>{
 const origin=req.headers.get("origin")||"";
 if(origin&&!allowed.has(origin))return error(origin,403,"ORIGIN_DENIED");
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:headers(origin)});
 if(req.method!=="POST")return error(origin,405,"METHOD_NOT_ALLOWED");
 if(!db)return error(origin,503,"UNAVAILABLE");
 const user=await auth(req).catch(()=>null);
 if(!user)return error(origin,401,"AUTH_REQUIRED");
 const body=await parseBoundedJSON(req);
 if(!body)return error(origin,400,"INVALID_REQUEST");
 const action=body.action;
 if(action==="status"){
  const [requests,sms]=await Promise.all([
   db.rpc("beagu_member_privacy_status_v1",{p_user:user.id}),
   db.rpc("beagu_member_sms_status_v2",{p_user:user.id})
  ]);
  if(requests.error||sms.error)return error(origin,503,"UNAVAILABLE");
  return respond(origin,200,{ok:true,profile:{
   email:user.email||"",
   emailVerified:true,
   createdAt:user.created_at||null,
   lastSignInAt:user.last_sign_in_at||null
  },requests:requests.data||{},
   sms:{
    consented:sms.data?.consented===true,
    phoneVerified:sms.data?.phone_verified===true
   }
  });
 }
 if(action==="request_access"||action==="request_deletion"){
  const kind=action==="request_deletion"?"deletion":"access";
  if(kind==="deletion"){
   // Meaningful, explicit confirmation: typing exact registered email
   // and a fixed Korean phrase; NEVER a destructive delete operation.
   if(body.confirm!=="계정 탈퇴 요청"||
      typeof body.confirmEmail!=="string"||
      body.confirmEmail.trim().toLowerCase()!==(user.email||"").toLowerCase())
    return error(origin,400,"CONFIRMATION_REQUIRED");
  }
  const {data, error:dbError}=await db.rpc("beagu_member_privacy_request_v1",{
   p_user:user.id,p_kind:kind,p_request:crypto.randomUUID()
  });
  if(dbError||data?.ok!==true){
   if(data?.code==="ADMIN_REVIEW_REQUIRED")return error(origin,403,"ADMIN_REVIEW_REQUIRED");
   if(data?.code==="TOO_MANY_REQUESTS")return error(origin,429,"RATE_LIMITED");
   return error(origin,503,"UNAVAILABLE");
  }
  return respond(origin,200,{ok:true,requestType:kind,status:data.status,
   deleted:false,notice:"request_only"});
 }
 if(action==="cancel_access"||action==="cancel_deletion"){
  const kind=action==="cancel_deletion"?"deletion":"access";
  const {data,error:dbError}=await db.rpc("beagu_member_privacy_cancel_v1",{
   p_user:user.id,p_kind:kind
  });
  if(dbError)return error(origin,503,"UNAVAILABLE");
  if(data?.ok!==true){
   if(data?.code==="PROCESSING")return error(origin,409,"ALREADY_PROCESSING");
   return error(origin,409,"NOT_PENDING");
  }
  return respond(origin,200,{ok:true,requestType:kind,status:"cancelled",deleted:false});
 }
 return error(origin,400,"INVALID_ACTION");
});
