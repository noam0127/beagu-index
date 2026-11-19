import { createClient } from "npm:@supabase/supabase-js@2.57.0";

// Post-it's data and author identities never become directly queryable with
// the browser's publishable key. Public requests receive curated projections.
const URL = Deno.env.get("SUPABASE_URL") || "";
const ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const db = createClient(URL, ROLE_KEY, { auth: { persistSession:false, autoRefreshToken:false }});
const origins = new Set(["https://baeguindex.com","https://www.baeguindex.com",
  "http://localhost:8788","http://localhost:8000","http://127.0.0.1:8000"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SCHOOL_ID = /^[A-Z0-9]{7}$/;
function cors(req:Request){
 const origin=req.headers.get("origin")||"";
 return { "Access-Control-Allow-Origin":origins.has(origin)?origin:"https://baeguindex.com",
 "Access-Control-Allow-Headers":"authorization,apikey,content-type,x-beagu-level-session",
 "Access-Control-Allow-Methods":"GET,POST,OPTIONS", "Vary":"Origin" };
}
function respond(req:Request,value:unknown,status=200){
 return new Response(JSON.stringify(value),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",...cors(req)}});
}
function fail(req:Request,code:string,status=400){return respond(req,{error:code},status);}
function textCheck(v:unknown,max:number){
 if(typeof v!=="string")return "";
 const s=v.trim();
 if(!s||[...s].length>max || /(?:https?:\/\/|www\.|[\w+.-]+@[\w.-]+\.[a-z]{2,})/i.test(s) ||
 /(?:01[016789])[- ]?\d{3,4}[- ]?\d{4}/.test(s))return "";
 return s;
}
async function userFrom(req:Request){
 const token=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"").trim();
 if(!token||token===ROLE_KEY)return null;
 const {data,error}=await db.auth.getUser(token);
 if(error||!data?.user?.id)return null;
 return data.user;
}
async function minimumLevel(){
 const {data,error}=await db.from("beagu_postit_settings").select("minimum_write_level,max_daily_posts,max_daily_comments").eq("id",1).single();
 if(error)throw error;
 return data;
}
async function tierFrom(req:Request){
 const session=(req.headers.get("x-beagu-level-session")||"").trim();
 if(session.length<20||session.length>250)return 0;
 const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(session));
 const hash=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,"0")).join("");
 const {data}=await db.from("beagu_level_sessions")
  .select("access_level").eq("token_sha256",hash).gt("expires_at",new Date().toISOString()).maybeSingle();
 return Math.max(0,Math.min(2,Number(data?.access_level)||0));
}
async function schoolInfo(ids:string[]){
 const unique=[...new Set(ids)].filter(x=>SCHOOL_ID.test(x));
 if(!unique.length)return {};
 const [s,m,p]=await Promise.all([
   db.from("schools").select("school_id,school_name,sido_standard,sido").in("school_id",unique),
   db.from("beagu_lv1_school_sort_index").select("school_id,student_count,student_reference_year").in("school_id",unique),
   db.from("beagu_school_report_yearly").select("school_id,survey_year,percentile")
    .in("school_id",unique).eq("publication_status","PUBLISHED").eq("privacy_reviewed",true)
    .order("survey_year",{ascending:false})
 ]);
 if(s.error)throw s.error;
 const map:Record<string,Record<string,unknown>>={};
 for(const row of s.data||[])map[row.school_id]={school_id:row.school_id,name:row.school_name,region:row.sido_standard||row.sido||""};
 for(const row of m.data||[])if(map[row.school_id]){
  const n=Number(row.student_count);
  map[row.school_id].students=Number.isFinite(n)&&n>=0?n:null;
  map[row.school_id].student_year=Number(row.student_reference_year)||null;
 }
 for(const row of p.data||[])if(map[row.school_id] && map[row.school_id].percentile_year===undefined){
  const value=row.percentile==null?NaN:Number(row.percentile);
  if(Number.isFinite(value)&&value>=0&&value<=100){
   map[row.school_id].percentile=Number(value.toFixed(1));
   map[row.school_id].percentile_year=Number(row.survey_year);
  }
 }
 return map;
}
async function enrich(items:any[],type:"post"|"comment",self:string|null){
 if(!items.length)return [];
 const ids=items.map(x=>x.id);
 const table=type==="post"?"beagu_postit_posts":"beagu_postit_comments";
 const {data:reactions,error}=await db.from("beagu_postit_reactions").select("target_id,kind,author_uid")
  .eq("target_type",type).in("target_id",ids).limit(10000);
 if(error)throw error;
 const counts:Record<string,{likes:number,reports:number,liked:boolean,reported:boolean}>={};
 for(const id of ids)counts[id]={likes:0,reports:0,liked:false,reported:false};
 for(const r of reactions||[]){
  const v=counts[r.target_id];if(!v)continue;
  if(r.kind==="like"){v.likes++;if(self&&r.author_uid===self)v.liked=true;}
  if(r.kind==="report"){v.reports++;if(self&&r.author_uid===self)v.reported=true;}
 }
 const commentCounts:Record<string,number>={};
 if(type==="post"){
  const {data:comments}=await db.from("beagu_postit_comments").select("post_id")
   .in("post_id",ids).eq("status","published").limit(10000);
  for(const c of comments||[])commentCounts[c.post_id]=(commentCounts[c.post_id]||0)+1;
 }
 const schools=type==="post"?await schoolInfo(items.map(x=>x.school_id)):{};
 return items.map(x=>({
  id:x.id,body:x.body,created_at:x.created_at,
  ...(type==="post"?{school:schools[x.school_id]||null,comments:commentCounts[x.id]||0}:{}),
  ...{likes:counts[x.id].likes,liked:counts[x.id].liked,reported:counts[x.id].reported,
   mine:Boolean(self&&self===x.author_uid)}
 }));
}
async function countToday(table:string,userId:string,limit:number){
 const kstDay=new Date(Date.now()+9*3600000).toISOString().slice(0,10);
 const start=new Date(kstDay+"T00:00:00+09:00").toISOString();
 const {count,error}=await db.from(table).select("id",{count:"exact",head:true}).eq("author_uid",userId).gte("created_at",start);
 if(error)throw error;
 return (count||0)<limit;
}
async function tooSoon(table:string,userId:string,seconds:number){
 const {data,error}=await db.from(table).select("created_at").eq("author_uid",userId).order("created_at",{ascending:false}).limit(1);
 if(error)throw error;
 return Boolean(data?.length&&Date.now()-new Date(data[0].created_at).getTime()<seconds*1000);
}
async function target(type:string,id:string){
 if(!["post","comment"].includes(type)||!UUID.test(id))return null;
 const table=type==="post"?"beagu_postit_posts":"beagu_postit_comments";
 const {data}=await db.from(table).select("id,author_uid,status,post_id").eq("id",id).maybeSingle();
 if(!data||data.status!=="published")return null;
 if(type==="comment"){
  const {data:p}=await db.from("beagu_postit_posts").select("status").eq("id",data.post_id).maybeSingle();
  if(p?.status!=="published")return null;
 }
 return data;
}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(req)});
 if(req.method!=="GET"&&req.method!=="POST")return fail(req,"METHOD_NOT_ALLOWED",405);
 if(!URL||!ROLE_KEY)return fail(req,"SERVER_NOT_CONFIGURED",503);
 try{
  const url=new URL(req.url);
  const body=req.method==="POST"?await req.json().catch(()=>null):null;
  const action=req.method==="GET"?(url.searchParams.get("action")||"posts"):String(body?.action||"");
  if(req.method==="GET"){
   if(action==="settings"){
    const settings=await minimumLevel();
    return respond(req,{minimum_write_level:settings.minimum_write_level});
   }
   if(action==="schools"){
    const q=(url.searchParams.get("q")||"").replace(/[%_\\]/g,"").trim().slice(0,25);
    if(q.length<2)return respond(req,{schools:[]});
    const {data,error}=await db.from("schools").select("school_id").ilike("school_name",`%${q}%`).limit(12);
    if(error)throw error;
    const schools=await schoolInfo((data||[]).map(x=>x.school_id));
    return respond(req,{schools:(data||[]).map(x=>schools[x.school_id]).filter(Boolean)});
   }
   if(action==="posts"){
    const schoolId=url.searchParams.get("school_id")||"";
    const sort=url.searchParams.get("sort")==="popular"?"popular":"recent";
    if(schoolId&&!SCHOOL_ID.test(schoolId))return fail(req,"INVALID_SCHOOL");
    let query=db.from("beagu_postit_posts").select("id,school_id,body,author_uid,created_at")
     .eq("status","published").order("created_at",{ascending:false}).limit(sort==="popular"?100:30);
    if(schoolId)query=query.eq("school_id",schoolId);
    const {data,error}=await query;if(error)throw error;
    const self=(await userFrom(req))?.id||null;
    let posts=await enrich(data||[],"post",self);
    if(sort==="popular")posts=posts.sort((a,b)=>b.likes-a.likes||b.created_at.localeCompare(a.created_at)).slice(0,30);
    return respond(req,{posts});
   }
   if(action==="comments"){
    const id=url.searchParams.get("post_id")||"";
    if(!UUID.test(id))return fail(req,"INVALID_POST");
    const exists=await target("post",id);
    if(!exists)return fail(req,"POST_UNAVAILABLE",404);
    const {data,error}=await db.from("beagu_postit_comments").select("id,body,author_uid,created_at")
     .eq("post_id",id).eq("status","published").order("created_at",{ascending:true}).limit(80);
    if(error)throw error;
    const comments=await enrich(data||[],"comment",(await userFrom(req))?.id||null);
    return respond(req,{comments});
   }
   return fail(req,"UNKNOWN_ACTION");
  }
  // Mutations require real Supabase Auth, including supported anonymous Auth.
  const user=await userFrom(req);if(!user)return fail(req,"LOGIN_REQUIRED",401);
  const settings=await minimumLevel();
  // Read is public at Lv.0. Every user-created interaction is Lv.2 only;
  // authors may still remove their own content if their level later changes.
  if(action!=="remove" && (await tierFrom(req))<Number(settings.minimum_write_level))
    return fail(req,"LEVEL_REQUIRED",403);
  if(action==="create_post"){
   const schoolId=String(body?.school_id||"");
   const content=textCheck(body?.text,200);
   if(!SCHOOL_ID.test(schoolId)||!content)return fail(req,"INVALID_POST");
   const {data:school}=await db.from("schools").select("school_id").eq("school_id",schoolId).maybeSingle();
   if(!school)return fail(req,"SCHOOL_NOT_FOUND",404);
   if(!await countToday("beagu_postit_posts",user.id,settings.max_daily_posts)||await tooSoon("beagu_postit_posts",user.id,90))
     return fail(req,"POST_RATE_LIMIT",429);
   const {data,error}=await db.from("beagu_postit_posts").insert({school_id:schoolId,author_uid:user.id,body:content}).select("id").single();
   if(error)throw error;return respond(req,{id:data.id},201);
  }
  if(action==="create_comment"){
   const postId=String(body?.post_id||"");
   const content=textCheck(body?.text,150);
   if(!UUID.test(postId)||!content)return fail(req,"INVALID_COMMENT");
   if(!await target("post",postId))return fail(req,"POST_UNAVAILABLE",404);
   if(!await countToday("beagu_postit_comments",user.id,settings.max_daily_comments)||await tooSoon("beagu_postit_comments",user.id,30))
     return fail(req,"COMMENT_RATE_LIMIT",429);
   const {data,error}=await db.from("beagu_postit_comments").insert({post_id:postId,author_uid:user.id,body:content}).select("id").single();
   if(error)throw error;return respond(req,{id:data.id},201);
  }
  if(action==="toggle_like"||action==="report"||action==="remove"){
   const type=String(body?.target_type||""),id=String(body?.target_id||"");
   const t=await target(type,id);if(!t)return fail(req,"TARGET_UNAVAILABLE",404);
   const table=type==="post"?"beagu_postit_posts":"beagu_postit_comments";
   if(action==="remove"){
    if(t.author_uid!==user.id)return fail(req,"NOT_OWNER",403);
    const {error}=await db.from(table).update({status:"removed"}).eq("id",id).eq("author_uid",user.id);
    if(error)throw error;return respond(req,{removed:true});
   }
   if(action==="report"&&t.author_uid===user.id)return fail(req,"CANNOT_REPORT_OWN");
   const kind=action==="toggle_like"?"like":"report";
   const filter=()=>db.from("beagu_postit_reactions").select("id").eq("author_uid",user.id)
     .eq("target_type",type).eq("target_id",id).eq("kind",kind).maybeSingle();
   const {data:existing}=await filter();
   if(existing){
    if(kind==="report")return respond(req,{already_reported:true});
    const {error}=await db.from("beagu_postit_reactions").delete().eq("id",existing.id).eq("author_uid",user.id);
    if(error)throw error;
   }else{
    const {error}=await db.from("beagu_postit_reactions").insert({author_uid:user.id,target_type:type,target_id:id,kind});
    if(error&&error.code!=="23505")throw error;
   }
   // Temporary hidden status, not deletion. Manual restoration is possible.
   const {data:all,error:rerr}=await db.from("beagu_postit_reactions").select("kind")
     .eq("target_type",type).eq("target_id",id).limit(10000);
   if(rerr)throw rerr;
   const likes=(all||[]).filter(x=>x.kind==="like").length;
   const reports=(all||[]).filter(x=>x.kind==="report").length;
   if(reports>=3&&reports/(likes+reports)>=0.5){
    const {error}=await db.from(table).update({status:"hidden"}).eq("id",id).eq("status","published");
    if(error)throw error;
   }
   return respond(req,{likes,reported:kind==="report",hidden:reports>=3&&reports/(likes+reports)>=0.5});
  }
  return fail(req,"UNKNOWN_ACTION");
 }catch(err){console.error("beagu-postit-api-v1",String(err));return fail(req,"TEMPORARY_ERROR",500);}
});