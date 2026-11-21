// Stage22: code-only Lv3 official 2026 school facts and reviewed sorting.
// Do not deploy to live/staging until backups, original code attribution,
// source-based provenance and release-gate approvals are independently checked.
import {createClient} from "npm:@supabase/supabase-js@2.57.0";

const url=Deno.env.get("SUPABASE_URL")||"";
const roleKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const db=url&&roleKey?createClient(url,roleKey,{
 auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}
}):null;
const allowed=new Set(["https://baeguindex.com","https://www.baeguindex.com"]);
const opaque=/^[a-f0-9]{64}$/;
const schoolId=/^[A-Z0-9]{7}$/;
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const sortFields=new Set([
 "school_name","address","student_count","junior_teacher_ratio",
 "male_teacher_ratio","housing_price_won","beagu_percentile_2025","view_count"
]);
const table="beagu_lv3_2026_school_facts_v1";
const columns="school_id,school_name,sido_standard,support_office,address,establishment,school_kind,status,reference_year,neis_as_of,student_count,student_reference_date,junior_teacher_ratio,male_teacher_ratio,housing_price_won,housing_reference_date,beagu_percentile_2025,view_count";

function headers(origin:string):Record<string,string>{
 return {
  ...(allowed.has(origin)?{"Access-Control-Allow-Origin":origin}:{}),
  "Access-Control-Allow-Headers":"authorization,apikey,content-type,x-beagu-level-session,x-beagu-lv3-token",
  "Access-Control-Allow-Methods":"POST,OPTIONS",
  "Cache-Control":"private, no-store",
  "Referrer-Policy":"no-referrer",
  "X-Content-Type-Options":"nosniff",
  "Vary":"Origin"
 };
}
function reply(origin:string,status:number,payload:Record<string,unknown>){
 return new Response(JSON.stringify(payload),{status,headers:{
  ...headers(origin),"Content-Type":"application/json; charset=utf-8"
 }});
}
async function hash(s:string){
 const digest=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s)));
 return Array.from(digest,x=>x.toString(16).padStart(2,"0")).join("");
}
function getAuthSession(jwt:string){
 try{
  const p=jwt.split(".")[1]||"";
  if(p.length<10||p.length>8000)return null;
  const claims=JSON.parse(atob(p.replace(/-/g,"+").replace(/_/g,"/")
   .padEnd(Math.ceil(p.length/4)*4,"=")));
  return typeof claims.session_id==="string"&&uuid.test(claims.session_id)
   ?claims.session_id:null;
 }catch{return null}
}
async function currentLv3(req:Request):Promise<boolean>{
 if(!db)return false;
 const code=(req.headers.get("X-Beagu-Level-Session")||"").trim();
 const lv3Token=(req.headers.get("X-Beagu-Lv3-Token")||"").trim();
 const jwt=(req.headers.get("Authorization")||"").match(
  /^Bearer ([A-Za-z0-9_.-]{20,8000})$/);
 if(!opaque.test(code)||!opaque.test(lv3Token)||!jwt)return false;
 const {data:level,error:levelError}=await db.from("beagu_level_sessions")
  .select("identity_campaign,identity_visitor_id,access_level")
  .eq("token_sha256",await hash(code))
  .gt("expires_at",new Date().toISOString())
  .maybeSingle();
 const visitor=String(level?.identity_visitor_id||"");
 if(levelError||!level||level.identity_campaign!=="2026"||
    !uuid.test(visitor)||Number(level.access_level)!==2)return false;
 const {data:qualified,error:qualityError}=await db.rpc(
  "beagu_2026_verified_visitor_level_v1",{p_visitor:visitor});
 if(qualityError||Number(qualified)!==2)return false;
 const {data:account,error:authError}=await db.auth.getUser(jwt[1]);
 if(authError||!account?.user||account.user.is_anonymous||
   !account.user.email_confirmed_at)return false;
 const session=getAuthSession(jwt[1]);
 if(!session)return false;
 const {data:live,error:liveError}=await db.rpc(
  "beagu_member_live_session_v1",{
   p_user:account.user.id,p_session:session
  });
 if(liveError||live!==true)return false;
 // Stage19 checks global release OFF switch, original-device exclusive
 // Auth ownership, currently approved 2026 referral and token revocation.
 const {data:authorized,error:grantError}=await db.rpc(
  "beagu_lv3_verify_session_v1",{
   p_hash:await hash(lv3Token),
   p_user:account.user.id,
   p_auth_session:session,
   p_visitor:visitor
  });
 return !grantError&&authorized===true;
}
async function readBody(req:Request){
 if(!(req.headers.get("Content-Type")||"").toLowerCase()
   .startsWith("application/json"))return null;
 if(Number(req.headers.get("Content-Length")||0)>768)return null;
 const reader=req.body?.getReader();
 if(!reader)return null;
 const decoder=new TextDecoder();
 let size=0,text="";
 for(;;){
  const {value,done}=await reader.read();if(done)break;
  size+=value?.byteLength||0;
  if(size>768){await reader.cancel();return null}
  text+=decoder.decode(value,{stream:true});
 }
 try{
  const body=JSON.parse(text+decoder.decode());
  return body&&typeof body==="object"&&!Array.isArray(body)
   ?body as Record<string,unknown>:null;
 }catch{return null}
}
const cleaned=(v:unknown,max:number)=>typeof v==="string"&&v.length<=max
 &&!/[\x00-\x1f]/.test(v);
function projected(row:Record<string,unknown>){
 // Explicit stable fields only. Source evidence, PII, submitted forms,
 // raw denominators and review actors never leave the private ledger.
 const output:Record<string,unknown>={};
 for(const field of columns.split(","))output[field]=row[field]??null;
 return output;
}

Deno.serve(async(req:Request)=>{
 const origin=req.headers.get("Origin")||"";
 if(origin&&!allowed.has(origin))return reply(origin,403,{error:"ORIGIN_DENIED"});
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:headers(origin)});
 if(req.method!=="POST")return reply(origin,405,{error:"METHOD_NOT_ALLOWED"});
 if(!db)return reply(origin,503,{error:"UNAVAILABLE"});
 const input=await readBody(req).catch(()=>null);
 if(!input)return reply(origin,400,{error:"INVALID_BODY"});
 if(input.action==="school"){
  if(Object.keys(input).sort().join(",")!=="action,schoolId"||
     typeof input.schoolId!=="string"||!schoolId.test(input.schoolId))
   return reply(origin,400,{error:"INVALID_REQUEST"});
  if(!await currentLv3(req).catch(()=>false))
   return reply(origin,403,{error:"LV3_REQUIRED"});
  const {data,error}=await db.from(table).select(columns)
   .eq("school_id",input.schoolId).maybeSingle();
  if(error)return reply(origin,503,{error:"DATA_UNAVAILABLE"});
  if(!data)return reply(origin,200,{status:"not_verified",referenceYear:2026,school:null});
  return reply(origin,200,{status:"verified",referenceYear:2026,
   school:projected(data as Record<string,unknown>)});
 }
 if(input.action==="ranked"){
  const sort=typeof input.sort==="string"?input.sort:"school_name";
  const dir=typeof input.direction==="string"?input.direction:"asc";
  const region=String(input.region||"").trim();
  const office=String(input.office||"").trim();
  const search=String(input.searchText||"").trim();
  const page=Number(input.page);
  if(Object.keys(input).some(k=>!["action","sort","direction","region","office","searchText","page"].includes(k))||
     !sortFields.has(sort)||!["asc","desc"].includes(dir)||
     !Number.isSafeInteger(page)||page<0||page>500||
     !cleaned(region,30)||!cleaned(office,120)||!cleaned(search,80)||
     !/^[가-힣A-Za-z·\s]*$/.test(region)||(!region&&!search)||
     (!region&&office))
   return reply(origin,400,{error:"INVALID_FILTER"});
  if(!await currentLv3(req).catch(()=>false))
   return reply(origin,403,{error:"LV3_REQUIRED"});
  let query=db.from(table).select(columns,{count:"exact"});
  if(region)query=query.eq("sido_standard",region);
  if(office)query=query.eq("support_office",office);
  if(search)query=query.ilike("school_name","%"+search.replace(/[%_\\]/g,"")+"%");
  query=query.order(sort,{ascending:dir==="asc",nullsFirst:false});
  if(sort!=="school_name")query=query.order("school_name",{ascending:true});
  query=query.order("school_id",{ascending:true}).range(page*20,page*20+19);
  const {data,count,error}=await query;
  if(error)return reply(origin,503,{error:"DATA_UNAVAILABLE"});
  return reply(origin,200,{status:"verified",referenceYear:2026,
   schools:(data||[]).map(x=>projected(x as Record<string,unknown>)),
   total:count||0,page,sort,direction:dir});
 }
 return reply(origin,400,{error:"INVALID_ACTION"});
});
