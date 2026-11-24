import{createClient}from"https://esm.sh/@supabase/supabase-js@2.58.0";
const url=Deno.env.get("SUPABASE_URL")||"",secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
const origins=new Set(["https://baeguindex.com","https://www.baeguindex.com"]);
const enc=new TextEncoder();
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hex=(a:Uint8Array)=>Array.from(a,b=>b.toString(16).padStart(2,"0")).join("");
const hash=async(s:string)=>hex(new Uint8Array(await crypto.subtle.digest("SHA-256",enc.encode(s))));
const headers=(origin:string)=>({"Access-Control-Allow-Origin":origins.has(origin)?origin:"https://baeguindex.com",
"Access-Control-Allow-Headers":"authorization,apikey,content-type,x-beagu-session,x-beagu-client",
"Access-Control-Allow-Methods":"POST,OPTIONS","Vary":"Origin","Cache-Control":"no-store",
"X-Content-Type-Options":"nosniff"});
const send=(origin:string,status:number,body:unknown)=>new Response(JSON.stringify(body),
{status,headers:{...headers(origin),"Content-Type":"application/json;charset=utf-8"}});
async function actorHash(req:Request){
 const ip=(req.headers.get("cf-connecting-ip")||"unknown").slice(0,100);
 const device=(req.headers.get("x-beagu-client")||"").slice(0,40);
 const key=await crypto.subtle.importKey("raw",enc.encode(secret),"HMAC",false,["sign"]);
 return hex(new Uint8Array(await crypto.subtle.sign("HMAC",key,
 enc.encode("CIVIC_2026|"+ip+"|"+device+"|"+(req.headers.get("user-agent")||"").slice(0,90)))));
}
async function corrector(req:Request){
 const token=(req.headers.get("x-beagu-session")||"").trim();
 if(!/^[a-f0-9]{64}$/.test(token))return null;
 const {data:s,error}=await db.from("beagu_level_sessions")
 .select("access_level,identity_campaign,identity_visitor_id,expires_at")
 .eq("token_sha256",await hash(token)).maybeSingle();
 if(error||!s||Number(s.access_level)<2||s.identity_campaign!=="2026"||
 !uuid.test(s.identity_visitor_id||"")||!Number.isFinite(Date.parse(s.expires_at))||
 Date.parse(s.expires_at)<=Date.now())return null;
 const {data:account,error:accountError}=await db.rpc("beagu_account_session_status_v1",{p_token_sha:await hash(token)});
 if(accountError||account?.level!==2||account.lv2_active!==true)return null;
 const {data:earned,error:e}=await db.rpc("beagu_has_earned_challenge_visitor",{p_visitor:s.identity_visitor_id});
 return !e&&earned===true?s.identity_visitor_id:null;
}
async function adminSession(req:Request){
 const m=/^Bearer ([A-Za-z0-9._-]+)$/.exec(req.headers.get("authorization")||"");
 if(!m)return null;
 const jwt=m[1],{data:user,error}=await db.auth.getUser(jwt);
 if(error||!user?.user?.id)return null;
 try{
 const raw=jwt.split(".")[1];const claims=JSON.parse(atob(raw.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(raw.length/4)*4,"=")));
 if(claims.sub!==user.user.id||claims.aal!=="aal2"||!uuid.test(claims.session_id||""))return null;
 const {data:acc}=await db.from("beagu_admin_accounts").select("role,enabled").eq("user_id",user.user.id).maybeSingle();
 if(!acc?.enabled||acc.role!=="owner")return null;
 const {data:ok}=await db.rpc("beagu_admin_active_mfa_session",{p_user:user.user.id,p_session:claims.session_id});
 return ok===true?{actor:user.user.id,session:claims.session_id}:null;
 }catch{return null;}
}
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get("origin")||"";
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:headers(origin)});
 if(req.method!=="POST")return send(origin,405,{error:"METHOD_NOT_ALLOWED"});
 if(!origins.has(origin))return send(origin,403,{error:"ORIGIN_NOT_ALLOWED"});
 let body:Record<string,unknown>;
 try{const raw=await req.text();if(raw.length>1800)throw Error();body=JSON.parse(raw);
 if(!body||typeof body!=="object"||Array.isArray(body))throw Error();}
 catch{return send(origin,400,{error:"INVALID_REQUEST"});}
 const action=String(body.action||"");
 if(["admin_hold_context","admin_hold","admin_resume"].includes(action)){
 const a=await adminSession(req);if(!a)return send(origin,403,{error:"OWNER_MFA_REQUIRED"});
 const id=typeof body.id==="string"?body.id:"";
 if(!uuid.test(id))return send(origin,400,{error:"INVALID_REQUEST"});
 const params={p_actor:a.actor,p_session:a.session,p_feedback:id};
 let result;
 if(action==="admin_hold_context")result=await db.rpc("beagu_2026_civic_hold_context",params);
 else {
 const sha=typeof body.snapshot_sha==="string"?body.snapshot_sha:"",reason=typeof body.reason==="string"?body.reason.trim():"";
 if(!/^[a-f0-9]{64}$/.test(sha)||reason.length<12||reason.length>500||/[<>\u0000-\u001f]/.test(reason))return send(origin,400,{error:"INVALID_REQUEST"});
 result=await db.rpc(action==="admin_hold"?"beagu_2026_civic_hold_school":"beagu_2026_civic_resume_school",{...params,p_expected_sha:sha,p_reason:reason});
 }
 return result.error?send(origin,409,{error:"HOLD_REVIEW_REQUIRED"}):send(origin,200,result.data);
 }
 if(action==="admin_list"||action==="admin_decide"){
 const a=await adminSession(req);if(!a)return send(origin,403,{error:"OWNER_MFA_REQUIRED"});
 const query=action==="admin_list"?
 db.rpc("beagu_2026_civic_admin_list",{p_actor:a.actor,p_session:a.session,p_status:String(body.status||"PENDING")}):
 db.rpc("beagu_2026_civic_admin_decide",{p_actor:a.actor,p_session:a.session,
  p_id:String(body.id||""),p_action:String(body.decision||""),p_reason:String(body.reason||"")});
 const {data,error}=await query;
 return error?send(origin,409,{error:"ADMIN_FEEDBACK_REJECTED"}):send(origin,200,data);
 }
 const school=String(body.school_id||"");
 if(!/^[A-Z0-9]{7}$/.test(school))return send(origin,400,{error:"INVALID_SCHOOL"});
 if(action==="status"){
 // Publication approval—not merely the existence of one response—controls
 // what the public may learn about a particular school's 2026 survey.
 // This existing RPC enforces school approval, tier-0 release delay,
 // source-hash revalidation and the owner's final publication decision.
 const {data,error}=await db.rpc("beagu_2026_level_released_school_ids",
  {p_ids:[school],p_level:0});
 return error||!Array.isArray(data)?send(origin,503,{error:"PUBLICATION_GATE_UNAVAILABLE"}):
  send(origin,200,{participation_confirmed:data.includes(school)});
 }
 if(action!=="report"&&action!=="correct")return send(origin,400,{error:"INVALID_ACTION"});
 const category=action==="correct"?"CORRECTION":String(body.category||"");
 const question=body.question_id===null||body.question_id===undefined||body.question_id===""?null:String(body.question_id);
 const detail=String(body.detail||"").trim();
 if(!["SCHOOL","AGGREGATE","SUSPECT","PRIVACY","OTHER","CORRECTION"].includes(category)||
 (action==="report"&&category==="CORRECTION")||
 (question!==null&&!/^Q(0[1-9]|[1-4][0-9]|5[01])$/.test(question))||
 detail.length<12||detail.length>500||/[<>\u0000-\u001F]/.test(detail))
 return send(origin,400,{error:"INVALID_FEEDBACK"});
 const visitor=action==="correct"?await corrector(req):null;
 if(action==="correct"&&(!visitor||!question))return send(origin,403,{error:"LV2_INDIVIDUAL_CODE_REQUIRED"});
 const {data,error}=await db.rpc("beagu_2026_civic_submit",{
 p_school_id:school,p_kind:action==="correct"?"CORRECTION_REQUEST":"REPORT",
 p_category:category,p_question_id:question,p_detail:detail,
 p_actor_hash:await actorHash(req),p_visitor:visitor});
 return error?send(origin,409,{error:"NOT_ELIGIBLE_OR_RATE_LIMITED"}):
 send(origin,202,{ok:true,request_id:data});
});
