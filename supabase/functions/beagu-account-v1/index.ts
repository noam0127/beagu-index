import {createClient} from "https://esm.sh/@supabase/supabase-js@2.58.0";
const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false,autoRefreshToken:false}});
const pepper=Deno.env.get("BEAGU_ACCOUNT_PASSWORD_PEPPER_V1")||"";
const allowed=new Set(["https://baeguindex.com","https://www.baeguindex.com"]);
const enc=new TextEncoder(),hex=(a:Uint8Array)=>Array.from(a,b=>b.toString(16).padStart(2,"0")).join("");
const sha=async(s:string)=>hex(new Uint8Array(await crypto.subtle.digest("SHA-256",enc.encode(s))));
const recoveryCode=/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{13}$/, secret=/^[a-f0-9]{64}$/;
const code=/^[A-Za-z0-9-]{8,120}$/;
async function proof(p:string){
 const key=await crypto.subtle.importKey("raw",enc.encode(pepper),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 return hex(new Uint8Array(await crypto.subtle.sign("HMAC",key,enc.encode("BEAGU_ACCOUNT_PASSWORD_V1|"+p))));
}
async function recoveryProof(p:string){
 const key=await crypto.subtle.importKey("raw",enc.encode(pepper),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 return hex(new Uint8Array(await crypto.subtle.sign("HMAC",key,enc.encode("BEAGU_ACCOUNT_RECOVERY_V1|"+p))));
}
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get("Origin")||"";
 const headers={"Access-Control-Allow-Origin":allowed.has(origin)?origin:"https://baeguindex.com","Access-Control-Allow-Methods":"POST,OPTIONS","Access-Control-Allow-Headers":"content-type,authorization,apikey,x-beagu-session","Cache-Control":"no-store","Vary":"Origin","Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff"};
 const send=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:{...headers,"Content-Type":"application/json"}});
 if(!allowed.has(origin))return send(403,{error:"ORIGIN_DENIED"});
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers});
 if(req.method!=="POST")return send(405,{error:"METHOD_DENIED"});
 if(pepper.length<32)return send(503,{error:"ACCOUNT_NOT_READY"});
 try{
 const reader=req.body?.getReader();if(!reader)return send(400,{error:"INVALID_REQUEST"});
 let size=0,raw="";const decoder=new TextDecoder();
 while(true){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;if(size>2048){await reader.cancel();return send(413,{error:"TOO_LARGE"});}raw+=decoder.decode(next.value,{stream:true});}
 const b=JSON.parse(raw+decoder.decode());
 if(!b||typeof b!=="object"||Array.isArray(b))return send(400,{error:"INVALID_REQUEST"});
 const action=b.action;
 const session=(req.headers.get("X-Beagu-Session")||"").trim();
 const validPassword=typeof b.password==="string"&&b.password.length>=12&&enc.encode(b.password).byteLength<=256;
 const accountOk=typeof b.account_id==="string"&&code.test(b.account_id);
 const recoveryOk=typeof b.new_recovery==="string"&&recoveryCode.test(b.new_recovery);
 if(action==="signup"){
  if(!validPassword||!accountOk||b.account_id!==b.code||!recoveryOk||typeof b.code!=="string"||!code.test(b.code)||typeof b.deviceSecret!=="string"||!secret.test(b.deviceSecret))return send(400,{error:"INVALID_REQUEST"});
  const {data,error}=await db.rpc("beagu_account_signup_v1",{p_code:b.code,p_device_hash:await sha(b.deviceSecret),p_password_proof:await proof(b.password),p_recovery_hash:await recoveryProof(b.new_recovery)});
  return !error&&data?.account_id===b.account_id&&[1,2].includes(data.level)?send(201,{account_id:data.account_id,level:data.level,lv2_active:data.lv2_active===true}):send(403,{error:"ACCOUNT_VERIFICATION_FAILED"});
 }
 if(action==="password_login"){
  if(!validPassword||!accountOk)return send(401,{error:"LOGIN_FAILED"});
  const token=hex(crypto.getRandomValues(new Uint8Array(32)));
  const result=await db.rpc("beagu_account_password_login_v1",{p_account:b.account_id,p_password_proof:await proof(b.password),p_token_sha:await sha(token)});
  return !result.error&&result.data?.account_id===b.account_id&&[1,2].includes(result.data.level)?send(200,{account_id:result.data.account_id,level:result.data.level,lv2_active:result.data.lv2_active===true,nickname:result.data.nickname,expires_at:result.data.expires_at,token}):send(401,{error:"LOGIN_FAILED"});
 }
 if(action==="recover"){
  if(!validPassword||!accountOk||!recoveryOk||typeof b.recovery!=="string"||!recoveryCode.test(b.recovery)||b.recovery===b.new_recovery)return send(400,{error:"INVALID_REQUEST"});
  const {data,error}=await db.rpc("beagu_account_recover_v1",{p_account:b.account_id,p_old_recovery_hash:await recoveryProof(b.recovery),p_new_recovery_hash:await recoveryProof(b.new_recovery),p_password_proof:await proof(b.password)});
  return !error&&data?.account_id===b.account_id&&[1,2].includes(data.level)?send(200,{account_id:data.account_id,level:data.level,lv2_active:data.lv2_active===true}):send(403,{error:"RECOVERY_FAILED"});
 }
 if(action==="status"||action==="logout"){
  if(!secret.test(session))return send(401,{error:"LOGIN_FAILED"});
  const {data,error}=await db.rpc(action==="status"?"beagu_account_session_status_v1":"beagu_account_logout_v1",{p_token_sha:await sha(session)});
  return !error&&data?send(200,action==="logout"?{ok:true}:{account_id:data.account_id,level:data.level,lv2_active:data.lv2_active===true,nickname:data.nickname,expires_at:data.expires_at}):send(401,{error:"LOGIN_FAILED"});
 }
 return send(400,{error:"INVALID_REQUEST"});
 }catch{return send(400,{error:"REQUEST_FAILED"});}
});
