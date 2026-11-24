import { createClient } from "npm:@supabase/supabase-js@2.57.0";

// Post-it's data and author identities never become directly queryable with
// the browser's publishable key. Even curated projections require Lv2 authorization.
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
 const {data,error}=await db.from("beagu_level_sessions").select("access_level,identity_visitor_id,identity_campaign")
   .eq("token_sha256",hash).gt("expires_at",new Date().toISOString()).maybeSingle();
 if(error||!data||Number(data.access_level)<minLevel)return null;
 const {data:allowed,error:gateError}=await db.rpc('beagu_account_level_session_allowed_v1',{p_token_sha:hash});
 if(gateError||allowed!==true)return null;
 // An earned challenge identity is revocable: each request must still have
 // an active, verified referral credit. Never trust the client-side badge.
 if(data.identity_campaign==="2026"&&data.identity_visitor_id){
  const {data:earned,error:earnedError}=await db.rpc("beagu_has_earned_challenge_visitor",{
   p_visitor:data.identity_visitor_id
  });
  if(earnedError||earned!==true)return null;
 }
 return {level:Number(data.access_level),hash};
}
async function verifiedMember(req:Request,viewer:any){
 if(!viewer||viewer.level!==2||!viewer.hash)return null;
 const {data,error}=await db.rpc("beagu_account_postit_writer_v1",{p_token_sha:viewer.hash});
 if(error||typeof data!=="string"||!UUID.test(data))return null;
 return {level:2,id:data};
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
 const allowed2026=new Set<string>();
 for(let i=0;i<unique.length;i+=20){
  const {data,error}=await db.rpc("beagu_2026_level_released_school_ids",{p_ids:unique.slice(i,i+20),p_level:0});
  if(!error&&Array.isArray(data))for(const id of data)if(typeof id==="string")allowed2026.add(id);
 }
 for(const row of p.data||[]){
  if(!map[row.school_id]||map[row.school_id].percentile_year!==undefined)continue;
  // Service-role reads bypass RLS: reproduce the public annual release guard.
  if(Number(row.survey_year)===2026){
    if(!allowed2026.has(row.school_id))continue;
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
 const {data:aliases,error:aliasError}=await db.rpc("beagu_account_postit_current_aliases_v1",{p_items:items.map(x=>({item_id:x.id,author_uid:x.author_uid,created_at:x.created_at}))});
 // Fail closed: old content and unavailable alias data remain anonymous.
 const names=new Map<string,string>();
 if(!aliasError&&Array.isArray(aliases))for(const a of aliases)if(typeof a.item_id==="string"&&typeof a.nickname==="string"&&/^[Il|ǀ❘ı∣│]{10}$/.test(a.nickname))names.set(a.item_id,a.nickname);
 return items.map(x=>({
  id:x.id,body:x.body,created_at:x.created_at,nickname:names.get(x.id)||"익명",
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
// Quotas and duplicate handling are serialized inside Postgres RPCs, not
// in independent client-side count/insert queries that race across tabs.
async function boundedJSON(req:Request){
 const reader=req.body?.getReader();
 if(!reader)throw Error("INVALID_BODY");
 const decoder=new TextDecoder();
 let raw="",bytes=0;
 for(;;){
  const chunk=await reader.read();
  if(chunk.done)break;
  bytes+=chunk.value.byteLength;
  if(bytes>2048){await reader.cancel();throw Error("BODY_TOO_LARGE");}
  raw+=decoder.decode(chunk.value,{stream:true});
 }
 raw+=decoder.decode();
 let parsed:unknown;
 try{parsed=JSON.parse(raw)}catch{throw Error("INVALID_BODY")}
 if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))throw Error("INVALID_BODY");
 return parsed as Record<string,unknown>;
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
  let body:Record<string,unknown>|null=null;
  if(req.method==="POST"){
   try{body=await boundedJSON(req)}
   catch(error){return fail(req,error instanceof Error&&error.message==="BODY_TOO_LARGE"
      ?"BODY_TOO_LARGE":"INVALID_BODY",error instanceof Error&&error.message==="BODY_TOO_LARGE"?413:400)}
  }
  const action=req.method==="GET"?(url.searchParams.get("action")||"posts"):String(body?.action||"");
  if(req.method==="GET"){
   if(action==="settings"){
    const settings=await minimumLevel();
    return respond(req,{minimum_write_level:settings.minimum_write_level});
   }
   // All Post-it reads (including search, comments, and school previews) are Lv2-only.
   const viewer=await identity(req,2);
   if(!viewer)return fail(req,"LEVEL_REQUIRED",403);
   const member=await verifiedMember(req,viewer);
   if(action==="writer_status")return respond(req,{linked:Boolean(member)});
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
    const rawTerm=(url.searchParams.get("q")||"").trim().slice(0,40);
    // Restrict syntax before passing a value into PostgREST's OR filter.
    const term=rawTerm.normalize("NFC").replace(/[^\p{L}\p{N}\s]/gu," ").replace(/\s+/g," ").trim();
    if(rawTerm&&term.length<2)return respond(req,{posts:[]});
    let matchedComments=new Set<string>();
    let query=db.from("beagu_postit_posts").select("id,school_id,subject_type,game_slug,comparison_selection,body,author_uid,created_at")
     .eq("status","published").order("created_at",{ascending:false}).limit(sort==="popular"?100:30);
    if(schoolId)query=query.eq("school_id",schoolId);
    if(gameSlug)query=query.eq("game_slug",gameSlug);
    if(term){
      const [schoolMatches,commentMatches]=await Promise.all([
        db.from("schools").select("school_id").ilike("school_name",`%${term}%`).limit(25),
        db.from("beagu_postit_comments").select("post_id").eq("status","published")
          .ilike("body",`%${term}%`).limit(100)
      ]);
      if(schoolMatches.error)throw schoolMatches.error;
      if(commentMatches.error)throw commentMatches.error;
      const ids=[...new Set((schoolMatches.data||[]).map(x=>x.school_id).filter(x=>SCHOOL_ID.test(x)))];
      matchedComments=new Set((commentMatches.data||[]).map(x=>x.post_id));
      const filters=[`body.ilike.%${term}%`];
      if(ids.length){
        filters.push(`school_id.in.(${ids.join(",")})`);
        for(const id of ids)filters.push(`comparison_selection.ilike.%${id}%`);
      }
      if(matchedComments.size)filters.push(`id.in.(${[...matchedComments].join(",")})`);
      const gameMatches=Object.entries(GAMES).filter(([slug,name])=>
        name.toLowerCase().includes(term.toLowerCase())||slug.includes(term.toLowerCase())).map(([slug])=>slug);
      if(gameMatches.length)filters.push(`game_slug.in.(${gameMatches.join(",")})`);
      query=query.or(filters.join(","));
    }
    const {data,error}=await query;if(error)throw error;
    let posts=await enrich(data||[],"post",member?.id||null);
    if(term)posts=posts.map(p=>({...p,comment_match:matchedComments.has(p.id)}));
    if(sort==="popular")posts=posts.sort((a,b)=>b.likes-a.likes||b.created_at.localeCompare(a.created_at)).slice(0,30);
    return respond(req,{posts});
   }
   if(action==="comments"){
    // The Lv2 check above also guards comment reads before post lookup.
    const id=url.searchParams.get("post_id")||"";
    if(!UUID.test(id))return fail(req,"INVALID_POST");
    const exists=await target("post",id);
    if(!exists)return fail(req,"POST_UNAVAILABLE",404);
    const {data,error}=await db.from("beagu_postit_comments").select("id,body,author_uid,created_at")
     .eq("post_id",id).eq("status","published").order("created_at",{ascending:true}).limit(80);
    if(error)throw error;
    const comments=await enrich(data||[],"comment",member?.id||null);
    return respond(req,{comments});
   }
   return fail(req,"UNKNOWN_ACTION");
  }
  // Anonymous account session plus earned referral; participation code alone cannot write.
  const viewer=await identity(req,2);
  if(!viewer)return fail(req,"LEVEL_REQUIRED",403);
  const user=await verifiedMember(req,viewer);
  if(!user)return fail(req,"WRITER_IDENTITY_REQUIRED",403);
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
   // Requests from updated clients include a stable per-submission nonce.
   // Legacy cached clients are accepted; the database still enforces quotas.
   const suppliedId=typeof body?.request_id==="string"?body.request_id:"";
   if(suppliedId&&!UUID.test(suppliedId))return fail(req,"INVALID_REQUEST_ID");
   const {data:created,error}=await db.rpc("beagu_postit_create_post_v2",{
     p_actor:user.id,p_request_id:suppliedId||crypto.randomUUID(),
     p_subject_type:subject,p_school_id:subject==="comparison"||!schoolId?null:schoolId,
     p_game_slug:subject==="game"?gameSlug:null,
     p_comparison_selection:subject==="comparison"?compare:null,p_body:content
   });
   if(error)throw error;
   if(created?.error){const code=String(created.error);return fail(req,["INVALID_POST","POST_RATE_LIMIT"].includes(code)?code:"TEMPORARY_ERROR",code==="POST_RATE_LIMIT"?429:code==="INVALID_POST"?400:500); }
   if(!UUID.test(String(created?.id||"")))throw Error("INVALID_POST_CREATE_RESULT");
   return respond(req,{id:created.id,replayed:created.replayed===true},created.replayed?200:201);
  }
  if(action==="create_comment"){
   const postId=String(body?.post_id||"");
   const content=textCheck(body?.text,150);
   if(!UUID.test(postId)||!content)return fail(req,"INVALID_COMMENT");
   const suppliedId=typeof body?.request_id==="string"?body.request_id:"";
   if(suppliedId&&!UUID.test(suppliedId))return fail(req,"INVALID_REQUEST_ID");
   const {data:created,error}=await db.rpc("beagu_postit_create_comment_v2",{
     p_actor:user.id,p_request_id:suppliedId||crypto.randomUUID(),
     p_post_id:postId,p_body:content
   });
   if(error)throw error;
   if(created?.error){const code=String(created.error);return fail(req,["INVALID_COMMENT","COMMENT_RATE_LIMIT","POST_UNAVAILABLE"].includes(code)?code:"TEMPORARY_ERROR",code==="COMMENT_RATE_LIMIT"?429:code==="POST_UNAVAILABLE"?404:code==="INVALID_COMMENT"?400:500); }
   if(!UUID.test(String(created?.id||"")))throw Error("INVALID_COMMENT_CREATE_RESULT");
   return respond(req,{id:created.id,replayed:created.replayed===true},created.replayed?200:201);
  }
  if(action==="toggle_like"||action==="set_like"||action==="report"||action==="remove"){
   const type=String(body?.target_type||""),id=String(body?.target_id||"");
   const t=await target(type,id);if(!t)return fail(req,"TARGET_UNAVAILABLE",404);
   const table=type==="post"?"beagu_postit_posts":"beagu_postit_comments";
   if(action==="remove"){
    if(t.author_uid!==user.id)return fail(req,"NOT_OWNER",403);
    const {error}=await db.from(table).update({status:"removed"}).eq("id",id).eq("author_uid",user.id);
    if(error)throw error;return respond(req,{removed:true});
   }
   if(action==="report"&&t.author_uid===user.id)return fail(req,"CANNOT_REPORT_OWN");
   if(action==="set_like"&&typeof body?.liked!=="boolean")
     return fail(req,"INVALID_LIKE_STATE");
   const kind=action==="report"?"report":"like";
   const filter=()=>db.from("beagu_postit_reactions").select("id").eq("author_uid",user.id)
     .eq("target_type",type).eq("target_id",id).eq("kind",kind).maybeSingle();
   const {data:existing}=await filter();
   if(existing){
    if(kind==="report")return respond(req,{already_reported:true});
    if(action!=="set_like"||body?.liked===false){
     const {error}=await db.from("beagu_postit_reactions").delete()
       .eq("id",existing.id).eq("author_uid",user.id);
     if(error)throw error;
    }
   }else if(action!=="set_like"||body?.liked===true){
    const {error}=await db.from("beagu_postit_reactions")
      .insert({author_uid:user.id,target_type:type,target_id:id,kind});
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
 }catch{console.error("beagu-postit-api-v1: request failed");return fail(req,"TEMPORARY_ERROR",500);}
});