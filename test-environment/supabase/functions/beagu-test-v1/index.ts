import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

// Staging-only. Every invocation verifies the project reference and origin.
// DO NOT deploy to production. No school or survey production sources are accessed.
const PROD = 'snvzwrexuqavnfvzgxqj';
const url = Deno.env.get('SUPABASE_URL') || '';
const expected = Deno.env.get('BEAGU_TEST_PROJECT_REF') || '';
const site = Deno.env.get('BEAGU_TEST_SITE_ORIGIN') || '';
const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const anon = Deno.env.get('SUPABASE_ANON_KEY') || '';
const rateSecret = Deno.env.get('BEAGU_TEST_RATE_SECRET') || '';
const referralSecret = Deno.env.get('BEAGU_TEST_REFERRAL_SECRET') || '';
const commonCode = Deno.env.get('BEAGU_TEST_LEVEL1_CODE') || '';
const ready = Deno.env.get('BEAGU_TEST_ENABLED') === 'true';
const captchaReady = Deno.env.get('BEAGU_TEST_CAPTCHA_CONFIRMED') === 'true';
const validProject = /^[a-z]{20}$/.test(expected) && expected !== PROD
  && url === 'https://' + expected + '.supabase.co'
  && /^https:\/\/[a-z0-9.-]+$/.test(site)
  && !/^https:\/\/(www\.)?baeguindex\.com$/.test(site)
  && service.length >= 60 && anon.length >= 60
  && rateSecret.length >= 32 && referralSecret.length >= 32
  && commonCode.length >= 8 && ready;
const admin = validProject ? createClient(url,service,{
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}
}) : null;
const auth = () => createClient(url,anon,{
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}
});
const enc = new TextEncoder();
const rxName = /^[a-z][a-z0-9_]{3,19}$/;
const rxToken = /^[A-Za-z0-9_-]{43}$/;
function originHeaders(origin:string){
 return {
  ...(origin===site?{'Access-Control-Allow-Origin':site}:{}),
  'Access-Control-Allow-Headers':'authorization,content-type',
  'Access-Control-Allow-Methods':'POST,OPTIONS',
  'Access-Control-Max-Age':'300','Cache-Control':'no-store',
  'Vary':'Origin','Referrer-Policy':'no-referrer',
  'X-Content-Type-Options':'nosniff'
 };
}
function reply(origin:string,status:number,data:unknown){
 return Response.json(data,{status,headers:originHeaders(origin)});
}
function hex(bytes:Uint8Array){
 return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
}
async function sha(s:string){
 return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(s))));
}
async function hmac(keyValue:string,message:string){
 const key=await crypto.subtle.importKey('raw',enc.encode(keyValue),
 {name:'HMAC',hash:'SHA-256'},false,['sign']);
 return new Uint8Array(await crypto.subtle.sign('HMAC',key,enc.encode(message)));
}
function base64url(bytes:Uint8Array){
 return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-')
   .replace(/\//g,'_').replace(/=+$/,'');
}
async function rate(scope:string,subject:string,max:number){
 const digest=hex(await hmac(rateSecret,scope+':'+subject));
 const {data,error}=await admin!.rpc('beagu_stage_rate',{p_hash:digest,p_max:max});
 return !error && data===true;
}
async function member(uid:string){
 const {data,error}=await admin!.rpc('beagu_stage_member',{p_uid:uid});
 if(error)throw Error('DB_UNAVAILABLE');
 return data||null;
}
async function currentUser(req:Request){
 const token=/^Bearer ([A-Za-z0-9._~-]{50,8000})$/.exec(req.headers.get('Authorization')||'')?.[1];
 if(!token)return null;
 const {data,error}=await admin!.auth.getUser(token);
 return !error && data.user?.id && data.user.email_confirmed_at
   ?{user:data.user,token}:null;
}
function validPassword(p:unknown){return typeof p==='string' && p.length>=12 && p.length<=128;}
function captcha(p:unknown){return typeof p==='string' && /^[A-Za-z0-9._~-]{20,2048}$/.test(p);}
function accountResponse(result:any,m:any){
 const session=result?.session;
 if(!session?.access_token || !session?.refresh_token)return null;
 return {ok:true,accessToken:session.access_token,refreshToken:session.refresh_token,
   username:m?.username||null,registered:!!m,level:Number(m?.level||0),
   upgradeUnseen:m?.upgradeUnseen===true};
}
function asText(v:unknown){return typeof v==='string'?v.trim():'';}
function safeCodeEqual(a:string,b:string){
 // Compare SHA-256 digests in constant work rather than short-circuit plaintext.
 return Promise.all([sha('code:'+a),sha('code:'+b)]).then(([x,y])=>{
  let diff=0;for(let i=0;i<x.length;i++)diff|=x.charCodeAt(i)^y.charCodeAt(i);return diff===0;
 });
}
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get('Origin')||'';
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:originHeaders(origin)});
 if(req.method!=='POST')return reply(origin,405,{error:'METHOD_NOT_ALLOWED'});
 if(!validProject)return reply(origin,503,{error:'TEST_PROJECT_NOT_CONFIGURED'});
 if(origin!==site)return reply(origin,403,{error:'STAGING_ORIGIN_REQUIRED'});
 let input:Record<string,unknown>;
 try{
  const raw=await req.text();
  if(enc.encode(raw).length>4096)return reply(origin,413,{error:'TOO_LARGE'});
  const data=JSON.parse(raw);
  if(!data||typeof data!=='object'||Array.isArray(data))throw Error();
  input=data;
 }catch{return reply(origin,400,{error:'INVALID_REQUEST'});}
 const action=asText(input.action);
 if(['signup','login','bootstrap','recovery-request','delete'].includes(action)&&
    !captchaReady)return reply(origin,423,{error:'CAPTCHA_NOT_CONFIGURED'});
 try{
  if(action==='signup'){
   const email=asText(input.email).toLowerCase();
   const username=asText(input.username).toLowerCase();
   if(!rxName.test(username)||!/^\S+@\S+\.\S+$/.test(email)||
      !validPassword(input.password)||!captcha(input.captchaToken))
    return reply(origin,400,{error:'INVALID_SIGNUP'});
   if(!await rate('signup',email,4))return reply(origin,429,{error:'RATE_LIMITED'});
   await auth().auth.signUp({email,password:input.password as string,
     options:{emailRedirectTo:site+'/index.html',
       captchaToken:input.captchaToken as string,
       data:{preferred_username:username}}});
   return reply(origin,200,{ok:true,confirmationRequired:true});
  }
  if(action==='login'||action==='bootstrap'){
   const name=asText(input.username).toLowerCase();
   let email=asText(input.email).toLowerCase();
   if(!validPassword(input.password)||!captcha(input.captchaToken))
    return reply(origin,401,{error:'INVALID_CREDENTIALS'});
   const key=action==='login'?name:email;
   if(!await rate('login',key,6))return reply(origin,429,{error:'RATE_LIMITED'});
   let owner:string|null=null;
   if(action==='login'){
    if(!rxName.test(name))return reply(origin,401,{error:'INVALID_CREDENTIALS'});
    const result=await admin!.rpc('beagu_stage_owner',{p_username:name});
    if(result.error)return reply(origin,503,{error:'DB_UNAVAILABLE'});
    owner=result.data;
    if(owner){
     const {data}=await admin!.auth.admin.getUserById(owner);
     email=data?.user?.email||'';
    }
   }
   if(!email)email='unregistered@invalid.invalid';
   const {data,error}=await auth().auth.signInWithPassword({
    email,password:input.password as string,
    options:{captchaToken:input.captchaToken as string}
   });
   if(error||!data.user?.email_confirmed_at||
      (action==='login'&&(!owner||data.user.id!==owner)))
    return reply(origin,401,{error:'INVALID_CREDENTIALS'});
   const m=await member(data.user.id);
   if(action==='login'&&!m)return reply(origin,401,{error:'INVALID_CREDENTIALS'});
   return reply(origin,200,accountResponse(data,m));
  }
  if(action==='recovery-request'){
   const email=asText(input.email).toLowerCase();
   if(!/^\S+@\S+\.\S+$/.test(email)||!captcha(input.captchaToken))
    return reply(origin,400,{error:'INVALID_RECOVERY'});
   if(!await rate('recovery',email,3))return reply(origin,429,{error:'RATE_LIMITED'});
   await auth().auth.resetPasswordForEmail(email,{
    redirectTo:site+'/recover.html',captchaToken:input.captchaToken as string
   });
   return reply(origin,200,{ok:true});
  }
  if(action==='recover'){
   const token=asText(input.tokenHash);
   if(!/^[a-f0-9]{64}$/.test(token)||!validPassword(input.password))
    return reply(origin,400,{error:'INVALID_RECOVERY'});
   if(!await rate('recovery-token',token,4))return reply(origin,429,{error:'RATE_LIMITED'});
   const client=auth();
   const {data,error}=await client.auth.verifyOtp({type:'recovery',token_hash:token});
   if(error||!data.session?.access_token)return reply(origin,401,{error:'EXPIRED_OR_USED'});
   const done=await client.auth.updateUser({password:input.password as string});
   await client.auth.signOut({scope:'global'});
   return done.error?reply(origin,503,{error:'UPDATE_FAILED'}):reply(origin,200,{ok:true});
  }
  // All remaining account operations validate the live, confirmed Auth user.
  const verified=await currentUser(req);
  if(action==='level1'&&!verified){
   if(!await rate('level1','anonymous',25))return reply(origin,429,{error:'RATE_LIMITED'});
   const code=asText(input.code);
   if(!await safeCodeEqual(code,commonCode))return reply(origin,401,{error:'INVALID_LEVEL_CODE'});
   const proof=base64url(crypto.getRandomValues(new Uint8Array(32)));
   const {error}=await admin!.rpc('beagu_stage_issue_proof',{p_hash:await sha(proof)});
   return error?reply(origin,503,{error:'PROOF_FAILED'}):reply(origin,200,{ok:true,level:1,proof});
  }
  if(!verified)return reply(origin,401,{error:'AUTH_REQUIRED'});
  const uid=verified.user.id;
  if(action==='register'){
   const username=asText(input.username).toLowerCase();
   if(!rxName.test(username)||!await rate('register',uid,6))
    return reply(origin,400,{error:'INVALID_USERNAME'});
   const {data,error}=await admin!.rpc('beagu_stage_register',{p_uid:uid,p_username:username});
   return error?reply(origin,409,{error:'USERNAME_UNAVAILABLE'}):reply(origin,200,{ok:true,...data});
  }
  if(action==='me'){
   const m=await member(uid);
   return reply(origin,200,{ok:true,registered:!!m,...m});
  }
  if(action==='level1'){
   if(!await rate('level1',uid,10))return reply(origin,429,{error:'RATE_LIMITED'});
   if(!await safeCodeEqual(asText(input.code),commonCode))
    return reply(origin,401,{error:'INVALID_LEVEL_CODE'});
   const {data,error}=await admin!.rpc('beagu_stage_level1',{p_uid:uid});
   return error?reply(origin,403,{error:'ACCOUNT_REQUIRED'}):reply(origin,200,{ok:true,level:data});
  }
  if(action==='claim-level1'){
   const proof=asText(input.proof);
   if(!rxToken.test(proof))return reply(origin,400,{error:'INVALID_PROOF'});
   const {data,error}=await admin!.rpc('beagu_stage_claim',{p_uid:uid,p_hash:await sha(proof)});
   return error?reply(origin,403,{error:'EXPIRED_OR_USED'}):reply(origin,200,{ok:true,level:data});
  }
  if(action==='referral'){
   const m=await member(uid);
   if(!m||m.level<1)return reply(origin,403,{error:'LEVEL1_REQUIRED'});
   const token=base64url(await hmac(referralSecret,'referral-v1:'+uid));
   const {data,error}=await admin!.rpc('beagu_stage_register_referral',{
    p_uid:uid,p_hash:await sha(token)
   });
   return error||!data?reply(origin,503,{error:'REFERRAL_UNAVAILABLE'})
    :reply(origin,200,{ok:true,referralToken:token});
  }
  if(action==='survey-submit'){
   const token=asText(input.referralToken);
   if(!rxToken.test(token))return reply(origin,400,{error:'INVALID_REFERRAL'});
   if(!await rate('survey',uid,6))return reply(origin,429,{error:'RATE_LIMITED'});
   const {data,error}=await admin!.rpc('beagu_stage_credit',{
     p_respondent:uid,p_hash:await sha(token)
   });
   return error?reply(origin,503,{error:'CREDIT_UNAVAILABLE'})
     :reply(origin,200,{ok:true,...data});
  }
  if(action==='ack-upgrade'){
   const {error}=await admin!.rpc('beagu_stage_ack',{p_uid:uid});
   return error?reply(origin,503,{error:'ACK_FAILED'}):reply(origin,200,{ok:true});
  }
  if(action==='schools'){
   const m=await member(uid);
   if(!m||m.level<2)return reply(origin,403,{error:'LEVEL2_REQUIRED'});
   const {data,error}=await admin!.rpc('beagu_stage_schools');
   return error?reply(origin,503,{error:'DATA_UNAVAILABLE'})
    :reply(origin,200,{ok:true,schools:data||[]});
  }
  if(action==='logout'){
   const {error}=await admin!.auth.admin.signOut(verified.token,'local');
   return error?reply(origin,503,{error:'LOGOUT_FAILED'}):reply(origin,200,{ok:true});
  }
  if(action==='delete'){
   const m=await member(uid);
   if(!m||input.confirm!=='DELETE_MY_ACCOUNT'||!validPassword(input.password)||
       !captcha(input.captchaToken))
    return reply(origin,400,{error:'CONFIRMATION_REQUIRED'});
   if(!await rate('delete',uid,3))return reply(origin,429,{error:'RATE_LIMITED'});
   const client=auth();
   const {data,error}=await client.auth.signInWithPassword({
    email:verified.user.email!,password:input.password as string,
    options:{captchaToken:input.captchaToken as string}
   });
   if(error||data.user?.id!==uid)return reply(origin,401,{error:'INVALID_CREDENTIALS'});
   const revoked=await admin!.auth.admin.signOut(verified.token,'global');
   if(revoked.error)return reply(origin,503,{error:'REVOCATION_FAILED'});
   const deleted=await admin!.auth.admin.deleteUser(uid);
   return deleted.error?reply(origin,503,{error:'DELETE_FAILED'})
    :reply(origin,200,{ok:true,deleted:true});
  }
  return reply(origin,400,{error:'UNKNOWN_ACTION'});
 }catch{
  // Do not log credentials, tokens, names, email addresses, or survey data.
  return reply(origin,503,{error:'STAGING_SERVICE_UNAVAILABLE'});
 }
});