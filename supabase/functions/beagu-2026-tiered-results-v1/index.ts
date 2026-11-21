// Stage21 release reader — code-only, NOT deployed to any Supabase project.
// Requires independent 2026 exact-snapshot approval + verified legal/privacy
// basis AND real server-level membership; never trust a browser badge or tier.
import {createClient} from "npm:@supabase/supabase-js@2.57.0";
import {publicQuestionResults} from "../_shared/results-2026.mjs";

const dbUrl=Deno.env.get("SUPABASE_URL")||"";
const roleKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const db=dbUrl&&roleKey?createClient(dbUrl,roleKey,{
 auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}
}):null;
const allowed=new Set(["https://baeguindex.com","https://www.baeguindex.com"]);
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const opaque=/^[a-f0-9]{64}$/;
const school=/^[A-Z0-9]{7}$/;
function cors(origin:string):Record<string,string>{
 return {
  ...(allowed.has(origin)?{"Access-Control-Allow-Origin":origin}:{}),
  "Access-Control-Allow-Methods":"POST,OPTIONS",
  "Access-Control-Allow-Headers":"content-type,apikey,authorization,x-beagu-level-session,x-beagu-lv3-token",
  "Vary":"Origin",
  "Cache-Control":"private,no-store",
  "X-Content-Type-Options":"nosniff",
  "Referrer-Policy":"no-referrer"
 };
}
function answer(origin:string,status:number,value:Record<string,unknown>){
 return new Response(JSON.stringify(value),{status,headers:{
  ...cors(origin),"Content-Type":"application/json; charset=utf-8"
 }});
}
async function hash(secret:string){
 const b=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(secret)));
 return Array.from(b,x=>x.toString(16).padStart(2,"0")).join("");
}
function jwtSessionId(jwt:string){
 try{
  const p=jwt.split(".")[1]||"";
  if(p.length<10||p.length>8000)return null;
  const s=atob(p.replace(/-/g,"+").replace(/_/g,"/")
    .padEnd(Math.ceil(p.length/4)*4,"="));
  const c=JSON.parse(s);
  return typeof c.session_id==="string"&&uuid.test(c.session_id)?c.session_id:null;
 }catch{return null}
}
async function resolve2026Level(req:Request){
 if(!db)return null;
 const token=(req.headers.get("X-Beagu-Level-Session")||"").trim();
 if(!opaque.test(token))return null;
 const {data:session,error}=await db.from("beagu_level_sessions")
  .select("access_level,identity_campaign,identity_visitor_id,expires_at")
  .eq("token_sha256",await hash(token))
  .gt("expires_at",new Date().toISOString()).maybeSingle();
 const visitor=String(session?.identity_visitor_id||"");
 if(error||!session||session.identity_campaign!=="2026"||
   !uuid.test(visitor)||Number(session.access_level)<1)return null;
 const {data:actual,error:levelError}=await db.rpc(
  "beagu_2026_verified_visitor_level_v1",{p_visitor:visitor});
 const level=Number(actual);
 if(levelError||![1,2].includes(level))return null;
 return {visitor,level};
}
async function verifyLv3(req:Request,visitor:string){
 if(!db)return false;
 const access=(req.headers.get("Authorization")||"").match(
  /^Bearer ([A-Za-z0-9_.-]{20,8000})$/);
 const bearer=(req.headers.get("X-Beagu-Lv3-Token")||"").trim();
 if(!access||!opaque.test(bearer))return false;
 // JWT payload is decoded ONLY after getUser verifies its signature/expiry.
 const {data:identity,error:authError}=await db.auth.getUser(access[1]);
 if(authError||!identity?.user||identity.user.is_anonymous||
   !identity.user.email_confirmed_at)return false;
 const sessionId=jwtSessionId(access[1]);
 if(!sessionId)return false;
 const {data:live,error:liveError}=await db.rpc(
  "beagu_member_live_session_v1",{
   p_user:identity.user.id,p_session:sessionId
  });
 if(liveError||live!==true)return false;
 // Stage19 RPC validates the live Auth session, original device + owner,
 // 2026 own survey, approved referral and emergency OFF switch AGAIN.
 const {data:verified,error:verifyError}=await db.rpc(
  "beagu_lv3_verify_session_v1",{
   p_hash:await hash(bearer),p_user:identity.user.id,
   p_auth_session:sessionId,p_visitor:visitor
  });
 return !verifyError&&verified===true;
}
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get("Origin")||"";
 if(origin&&!allowed.has(origin))return answer(origin,403,{error:"ORIGIN_DENIED"});
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(origin)});
 if(req.method!=="POST")return answer(origin,405,{error:"METHOD_NOT_ALLOWED"});
 if(!db)return answer(origin,503,{error:"UNAVAILABLE"});
 if(!(req.headers.get("Content-Type")||"").toLowerCase().startsWith("application/json"))
  return answer(origin,400,{error:"INVALID_BODY"});
 if(Number(req.headers.get("Content-Length")||0)>512)
  return answer(origin,413,{error:"TOO_LARGE"});
 let raw="";
 try{
  const body=await req.body?.getReader();if(!body)throw Error();
  const decoder=new TextDecoder();let length=0;
  for(;;){
   const {value,done}=await body.read();if(done)break;
   length+=value?.byteLength||0;
   if(length>512){await body.cancel();return answer(origin,413,{error:"TOO_LARGE"})}
   raw+=decoder.decode(value,{stream:true});
  }
  raw+=decoder.decode();
 }catch{return answer(origin,400,{error:"INVALID_BODY"})}
 let input:Record<string,unknown>;
 try{
  const decoded=JSON.parse(raw);
  if(!decoded||typeof decoded!=="object"||Array.isArray(decoded))throw Error();
  input=decoded as Record<string,unknown>;
 }catch{return answer(origin,400,{error:"INVALID_JSON"})}
 if(input.action!=="read_school"||typeof input.schoolId!=="string"||
    !school.test(input.schoolId)||Object.keys(input).sort().join(",")!=="action,schoolId")
  return answer(origin,400,{error:"INVALID_REQUEST"});
 const member=await resolve2026Level(req).catch(()=>null);
 if(!member)return answer(origin,401,{error:"LEVEL_REQUIRED"});
 let tier=member.level;
 if(tier===2&&await verifyLv3(req,member.visitor).catch(()=>false))tier=3;
 // This RPC ONLY returns exact-snapshot independently reviewed aggregates;
 // submitted passwords, raw source rows, respondents and count metadata
 // never leave the service-role boundary. NULL means withheld at ALL tiers.
 const {data,error}=await db.rpc("beagu_2026_tiered_released_question_results_v1",{
  p_school_id:input.schoolId,p_level:tier
 });
 if(error)return answer(origin,503,{error:"RELEASE_UNAVAILABLE"});
 if(!Array.isArray(data))
  return answer(origin,200,{status:"not_published",year:2026,level:tier,questions:[]});
 // The RPC returns internal aggregates. Only pre-registered questionnaire
 // response labels are serialized into the public output.
 const safe=publicQuestionResults(data);
 return answer(origin,200,{status:"published",year:2026,level:tier,
  questions:safe});
});
