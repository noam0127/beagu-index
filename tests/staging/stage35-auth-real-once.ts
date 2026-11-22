// STAGING-ONLY one-use fixture runner. NO request-controlled user identifiers.
// Deploy exclusively to ycwuugggqbunlbwuzvbx, then replace with HTTP 410.
// Generated passwords and access tokens never leave this Edge Function.
import { createClient } from "npm:@supabase/supabase-js@2.57.0";

const STAGE = "ycwuugggqbunlbwuzvbx";
const PROJECT_URL = "https://" + STAGE + ".supabase.co";
const URL = Deno.env.get("SUPABASE_URL") || "";
const SECRET = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const db = createClient(URL, SECRET, {
  auth:{persistSession:false,autoRefreshToken:false}
});
const enc=new TextEncoder();
const hex=bytes=>Array.from(bytes,x=>x.toString(16).padStart(2,"0")).join("");
const sha256=async value=>hex(new Uint8Array(
  await crypto.subtle.digest("SHA-256",enc.encode(value))));
async function authorUid(visitor){
 const key=await crypto.subtle.importKey("raw",enc.encode(SECRET),
      {name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const mac=new Uint8Array(await crypto.subtle.sign("HMAC",key,enc.encode("postit:"+visitor)));
 mac[6]=(mac[6]&15)|64;mac[8]=(mac[8]&63)|128;
 const h=hex(mac.slice(0,16));
 return h.slice(0,8)+"-"+h.slice(8,12)+"-"+h.slice(12,16)+"-"+h.slice(16,20)+"-"+h.slice(20,32);
}
function result(status,data){
 return new Response(JSON.stringify(data),{status,headers:{
  "Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",
  "X-Content-Type-Options":"nosniff"
 }});
}
Deno.serve(async(req)=>{
 if(req.method!=="POST")return result(405,{status:"METHOD_NOT_ALLOWED"});
 // The endpoint never accepts input or provides Auth credentials.
 if(URL!==PROJECT_URL||SECRET.length<30)
  return result(503,{status:"STAGING_ISOLATION_FAILED"});
 const lock=await db.rpc("stage35_claim_auth_once");
 if(lock.error||lock.data!==true)
   return result(409,{status:"STAGE35_ONE_TIME_ALREADY_USED"});
 const users=[], tokenDigests=[];
 let checks=0,blocked="NONE", cleaned=false;
 try {
  const nonce=crypto.randomUUID().replaceAll("-","");
  const actors=[];
  for(const label of ["a","b"]){
   const email="stage35-auth-qa-"+label+"-"+nonce+"@baeguindex.com";
   const password=hex(crypto.getRandomValues(new Uint8Array(36)))+"Aa1!";
   const created=await db.auth.admin.createUser({email,password,email_confirm:true});
   if(created.error||!created.data?.user?.id){
     blocked="AUTH_CREATE_"+(created.error?.code||"UNKNOWN");
     break;
   }
   const userId=created.data.user.id;
   users.push(userId);
   const login=await fetch(PROJECT_URL+"/auth/v1/token?grant_type=password",{
     method:"POST",headers:{"apikey":SECRET,"Content-Type":"application/json"},
     body:JSON.stringify({email,password})
   });
   const signed=await login.json().catch(()=>({}));
   if(!login.ok||typeof signed.access_token!=="string"){
     blocked="AUTH_LOGIN_"+(signed.error_code||login.status);
     break;
   }
   const visitor=crypto.randomUUID();
   const actor=await authorUid(visitor);
   const token=hex(crypto.getRandomValues(new Uint8Array(32)));
   const digest=await sha256(token);
   tokenDigests.push(digest);
   const session=await db.from("beagu_level_sessions").insert({
     token_sha256:digest,access_level:2,identity_visitor_id:visitor,
     identity_campaign:"stage35",created_at:new Date().toISOString(),
     expires_at:new Date(Date.now()+5*60*1000).toISOString()
   });
   if(session.error){blocked="STAGING_LEVEL_SESSION_FAILED";break}
   const member=await db.from("beagu_postit_member_accounts").insert({
     auth_user_id:userId,identity_visitor_id:visitor,
     author_uid:actor,status:"active"
   });
   if(member.error){blocked="STAGING_MEMBER_BIND_FAILED";break}
   actors.push({jwt:signed.access_token,token,userId});
  }
  if(actors.length===2){
    async function writerStatus(a,b){
      const res=await fetch(PROJECT_URL+"/functions/v1/beagu-postit-api-v1?action=writer_status",{
       method:"GET",headers:{"Authorization":"Bearer "+a.jwt,
        "x-beagu-level-session":b.token}
      });
      const data=await res.json().catch(()=>({}));
      return res.status===200&&typeof data.linked==="boolean" ? data.linked : null;
    }
    for(const [i,j,expected] of [[0,0,true],[1,1,true],[0,1,false],[1,0,false]]){
     const actual=await writerStatus(actors[i],actors[j]);
     if(actual!==expected){blocked="CROSS_ACCOUNT_WRITER_STATUS";break}
     checks++;
    }
    if(blocked==="NONE"){
      for(const [i,j] of [[0,1],[1,0]]){
       const res=await fetch(PROJECT_URL+"/functions/v1/beagu-postit-api-v1",{
        method:"POST",headers:{"Authorization":"Bearer "+actors[i].jwt,
         "x-beagu-level-session":actors[j].token,
         "Content-Type":"application/json"},
        body:JSON.stringify({action:"create_post",subject_type:"school",
         school_id:"TST0001",text:"qa-only"})
       });
       const body=await res.json().catch(()=>({}));
       if(res.status!==403||body.error!=="WRITER_IDENTITY_REQUIRED"){
         blocked="CROSS_ACCOUNT_WRITE_DENIAL";break;
       }
       checks++;
      }
    }
    if(blocked==="NONE"){
      for(const a of actors){
       const res=await fetch(PROJECT_URL+"/functions/v1/beagu-admin-members-v1",{
        method:"POST",headers:{"Authorization":"Bearer "+a.jwt,
        "Content-Type":"application/json"},body:JSON.stringify({action:"list"})
       });
       const body=await res.json().catch(()=>({}));
       if(res.status!==403||body.error!=="access_denied"){
         blocked="NONADMIN_MEMBERSHIP_DENIAL";break;
       }
       checks++;
      }
    }
  }
 }catch(error){
   blocked=blocked==="NONE" ? "TEST_RUN_EXCEPTION_"+(error instanceof Error?error.name:"UNKNOWN"):blocked;
 }finally{
  let cleanupOK=true;
  if(tokenDigests.length){
    const d=await db.from("beagu_level_sessions").delete().in("token_sha256",tokenDigests);
    if(d.error)cleanupOK=false;
  }
  if(users.length){
    const m=await db.from("beagu_postit_member_accounts").delete().in("auth_user_id",users);
    if(m.error)cleanupOK=false;
    for(const id of users){
      const del=await db.auth.admin.deleteUser(id);
      if(del.error)cleanupOK=false;
    }
  }
  cleaned=cleanupOK;
 }
 const status=blocked==="NONE"&&checks===8&&cleaned?"PASS":"BLOCKED";
 return result(status==="PASS"?200:503,{
  status,checks_passed:checks,reason:status==="PASS"?"NONE":blocked,cleanup_ok:cleaned,
  scope:"isolated staging Auth A/B binding; no production data; no Lv3 registration E2E"
 });
});
