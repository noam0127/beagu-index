import { createClient } from "npm:@supabase/supabase-js@2.57.0";

// Post-it's data and author identities never become directly queryable with
// the browser's publishable key. Public requests receive curated projections.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const db = createClient(SUPABASE_URL, ROLE_KEY, { auth: { persistSession:false, autoRefreshToken:false }});
const origins = new Set(["https://baeguindex.com","https://www.baeguindex.com","https://noam0127.github.io",
  "http://localhost:8788","http://localhost:8000","http://127.0.0.1:8000"]);
const GAMES:Record<string,string>={
 "teacher-volleyball":"선생님배구",
 "teacher-run":"험난한 교직생활",
 "teacher-class-diary-play":"나의 OO한 학급일지"
};
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
// Authorization is verified against the site's existing server-issued level sessions.
async function identity(req:Request,minLevel=2){
 const token=(req.headers.get("x-beagu-level-session")||"").trim();
 if(!/^[a-f0-9]{64}$/.test(token))return null;
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token))),v=>v.toString(16).padStart(2,"0")).join("");
 const {data,error}=await db.from("beagu_level_sessions").select("access_level,identity_visitor_id")
   .eq("token_sha256",hash).gt("expires_at",new Date().toISOString()).maybeSingle();
 if(error||!data||Number(data.access_level)<minLevel)return null;
 // A session token is a rotating credential, not an enduring person ID.
 // Readers may use Lv1 sessions without a bound identity, but writers must not
 // gain a new author persona on every login or regain like/report quotas.
 if(!data.identity_visitor_id)return {level:Number(data.access_level),id:null};
 const seed=String(data.identity_visitor_id);
 const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(ROLE_KEY),
   {name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const mac=new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode("postit:"+seed)));
 mac[6]=(mac[6]&15)|64;mac[8]=(mac[8]&63)|128;
 const h=Array.from(mac.slice(0,16),v=>v.toString(16).padStart(2,"0")).join("");
 return {level:Number(data.access_level),id:h.slice(0,8)+"-"+h.slice(8,12)+"-"+h.slice(12,16)+"-"+h.slice(16,20)+"-"+h.slice(20,32)};
}
async function minimumLevel(){
 const {data,error}=await db.from("beagu_postit_settings").select("minimum_write_level,max_daily_posts,max_daily_comments").eq("id",1).single();
 if(error)throw error;
 return data;
}
async function schoolInfo(ids:string[]){
 const unique=[...new Set(ids)].filter(x=>SCHOOL_ID.test(x));
 if(!unique.length)return {};
 const [s,m,p]=await Promise.all([
   db.from("schools").select("school_id,school_name,sido_standard,sido").in("school_id",unique),
   db.from("beagu_lv1_school_sort_index").select("school_id,student_count,student_reference_year").in("school_id",unique),
   db.from("beagu_school_report_yearly").select("school_id,survey_year,percentile,valid_observation_count,unique_respondents_reviewed,school_identity_reviewed,small_cell_reviewed,differencing_reviewed,manual_release_approved,manual_release_at,manual_release_by,release_evidence,source_status,updated_at")
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
 for(const row of p.data||[]){
  if(!map[row.school_id]||map[row.school_id].percentile_year!==undefined)continue;
  // Service-role reads bypass RLS: reproduce the public annual release guard.
  if(Number(row.survey_year)===2026){
    const before=Date.now()-24*3600000;
    if(!(Number(row.valid_observation_count)>=1 && row.unique_respondents_reviewed===true &&
      row.school_identity_reviewed===true && row.small_cell_reviewed===true &&
      row.differencing_reviewed===true && row.manual_release_approved===true &&
      row.manual_release_at && row.manual_release_by && row.release_evidence &&
      row.source_status==="VETTED_2026_RELEASE" &&
      new Date(row.manual_release_at).getTime()<=before &&
      new Date(row.updated_at).getTime()<=before))continue;
  }else if(![2023,2024,2025].includes(Number(row.survey_year)))continue;
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
 const compareIds=type==="post"?items.flatMap(x=>
   typeof x.comparison_selection==="string"?x.comparison_selection.split(",").map((z:string)=>z.split(":")[0]):[]):[];
 const schools=type==="post"?await schoolInfo([...items.map(x=>x.school_id).filter(Boolean),...compareIds]):{};
 return items.map(x=>({
  id:x.id,body:x.body,created_at:x.created_at,
  ...(type==="post"?{
   subject_type:x.subject_type||"school",
   school:schools[x.school_id]||null,
   game:x.game_slug?{slug:x.game_slug,name:GAMES[x.game_slug]||"게임"}:null,
   comparison:x.comparison_selection?{selection:x.comparison_selection,
     schools:x.comparison_selection.split(",").map((part:string)=>schools[part.split(":")[0]]?.name).filter(Boolean)}:null,
   comments:commentCounts[x.id]||0
  }:{}),
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
 const fields=type==="comment"?"id,author_uid,status,post_id":"id,author_uid,status";
 const {data}=await db.from(table).select(fields).eq("id",id).maybeSingle();
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
 const origin=req.headers.get("origin")||"";
 if(origin&&!origins.has(origin))return fail(req,"ORIGIN_NOT_ALLOWED",403);
 if(Number(req.headers.get("content-length")||0)>2048)return fail(req,"BODY_TOO_LARGE",413);
 if(!SUPABASE_URL||!ROLE_KEY)return fail(req,"SERVER_NOT_CONFIGURED",503);
 try{
  const url=new URL(req.url);
  const body=req.method==="POST"?await req.json().catch(()=>null):null;
  const action=req.method==="GET"?(url.searchParams.get("action")||"posts"):String(body?.action||"");
  if(req.method==="GET"){
   if(action==="settings"){
    const settings=await minimumLevel();
    return respond(req,{minimum_write_level:settings.minimum_write_level});
   }
   if(action==="school_info"){
    const ids=(url.searchParams.get("school_ids")||"").split(",").filter(Boolean);
    if(ids.length<1||ids.length>5||ids.some(x=>!SCHOOL_ID.test(x)))
      return fail(req,"INVALID_SCHOOLS");
    const schools=await schoolInfo(ids);
    return respond(req,{schools});
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
    const gameSlug=url.searchParams.get("game_slug")||"";
    if(gameSlug&&!GAMES[gameSlug])return fail(req,"INVALID_GAME");
    const sort=url.searchParams.get("sort")==="popular"?"popular":"recent";
    if(schoolId&&!SCHOOL_ID.test(schoolId))return fail(req,"INVALID_SCHOOL");
    let query=db.from("beagu_postit_posts").select("id,school_id,subject_type,game_slug,comparison_selection,body,author_uid,created_at")
     .eq("status","published").order("created_at",{ascending:false}).limit(sort==="popular"?100:30);
    if(schoolId)query=query.eq("school_id",schoolId);
    if(gameSlug)query=query.eq("game_slug",gameSlug);
    const {data,error}=await query;if(error)throw error;
    const self=(await identity(req))?.id||null;
    let posts=await enrich(data||[],"post",self);
    if(sort==="popular")posts=posts.sort((a,b)=>b.likes-a.likes||b.created_at.localeCompare(a.created_at)).slice(0,30);
    return respond(req,{posts});
   }
   if(action==="comments"){
    // A valid server-issued Lv1+ session is required to read any comment.
    // This check precedes even the post existence check to avoid disclosure.
    const viewer=await identity(req,1);
    if(!viewer)return fail(req,"COMMENT_READ_LEVEL_REQUIRED",403);
    const id=url.searchParams.get("post_id")||"";
    if(!UUID.test(id))return fail(req,"INVALID_POST");
    const exists=await target("post",id);
    if(!exists)return fail(req,"POST_UNAVAILABLE",404);
    const {data,error}=await db.from("beagu_postit_comments").select("id,body,author_uid,created_at")
     .eq("post_id",id).eq("status","published").order("created_at",{ascending:true}).limit(80);
    if(error)throw error;
    const comments=await enrich(data||[],"comment",viewer.id);
    return respond(req,{comments});
   }
   return fail(req,"UNKNOWN_ACTION");
  }
  // All mutations require an active server-issued Lv2 session.
  const user=await identity(req);if(!user)return fail(req,"LEVEL_REQUIRED",403);
  if(!user.id)return fail(req,"WRITER_IDENTITY_REQUIRED",403);
  const settings=await minimumLevel();
  if(user.level<Math.max(2,Number(settings.minimum_write_level)))
    return fail(req,"LEVEL_REQUIRED",403);
  if(action==="create_post"){
   const subject=String(body?.subject_type||"school");
   const schoolId=String(body?.school_id||"");
   const gameSlug=String(body?.game_slug||"");
   const compare=String(body?.comparison_selection||"");
   const content=textCheck(body?.text,200);
   if(!content||!["school","game","comparison"].includes(subject))
     return fail(req,"INVALID_POST");
   if(subject==="school"&&!SCHOOL_ID.test(schoolId))return fail(req,"INVALID_SCHOOL");
   if(subject==="game"&&!GAMES[gameSlug])return fail(req,"INVALID_GAME");
   if(subject==="game"&&schoolId&&!SCHOOL_ID.test(schoolId))return fail(req,"INVALID_SCHOOL");
   if(subject==="comparison"){
     const parts=compare.split(",");
     if(!parts.length||parts.length>5||compare.length>120||
        parts.some(x=>!/^[A-Z0-9]{7}:202[3-6]$/.test(x)) ||
        new Set(parts).size!==parts.length)return fail(req,"INVALID_COMPARISON");
   }
   const ids=subject==="comparison"?compare.split(",").map(x=>x.split(":")[0]):schoolId?[schoolId]:[];
   if(ids.length){
     const {data,error}=await db.from("schools").select("school_id").in("school_id",[...new Set(ids)]);
     if(error)throw error;
     if(new Set((data||[]).map(x=>x.school_id)).size!==new Set(ids).size)
       return fail(req,"SCHOOL_NOT_FOUND",404);
   }
   if(!await countToday("beagu_postit_posts",user.id,settings.max_daily_posts)||await tooSoon("beagu_postit_posts",user.id,90))
     return fail(req,"POST_RATE_LIMIT",429);
   const {data,error}=await db.from("beagu_postit_posts").insert({
     school_id:subject==="comparison"||!schoolId?null:schoolId,
     subject_type:subject,
     game_slug:subject==="game"?gameSlug:null,
     comparison_selection:subject==="comparison"?compare:null,
     author_uid:user.id,body:content
   }).select("id").single();
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