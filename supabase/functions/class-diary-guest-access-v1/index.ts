// Class Diary beta gate: retain server-side developer PIN and add distinct Lv.2 session entry.
// Both branches issue a signed short-lived handoff; neither puts codes in URLs.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';
const url = Deno.env.get('SUPABASE_URL') || '';
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const admin = createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
// Intentionally fail closed if the private server setting has not been configured.
const previewPin = Deno.env.get('CLASS_DIARY_PREVIEW_PIN') || '';
const PREVIEW_SUBJECT = '8a61e133-2afd-469c-b611-f409b4197d61';
const allowed = new Set([
 'https://baeguindex.com','https://www.baeguindex.com','https://noam0127.github.io',
 'http://localhost:8000','http://127.0.0.1:8000','http://127.0.0.1:8123'
]);
function cors(origin:string) {return {
 'Access-Control-Allow-Origin':allowed.has(origin)?origin:'https://baeguindex.com',
 'Access-Control-Allow-Methods':'POST, OPTIONS',
 'Access-Control-Allow-Headers':'content-type,x-beagu-session',
 'Access-Control-Max-Age':'3600','Vary':'Origin'
};}
function respond(data:unknown,status:number,origin:string){
 return new Response(JSON.stringify(data),{status,headers:{
  ...cors(origin),'Content-Type':'application/json; charset=utf-8',
  'Cache-Control':'no-store, private','Pragma':'no-cache',
  'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'
 }});
}
// A short-lived, HMAC-signed handoff ticket. Contains no identity code or school data.
// The signing key remains server-side. A ticket is not a Level 2 session.
const ticketKeyPromise=crypto.subtle.importKey(
 'raw',new TextEncoder().encode('class-diary-preview-ticket-v2:'+key),
 {name:'HMAC',hash:'SHA-256'},false,['sign','verify']
);
const progressKeyPromise=crypto.subtle.importKey(
 'raw',new TextEncoder().encode('class-diary-progress-v1:'+key),
 {name:'HMAC',hash:'SHA-256'},false,['sign','verify']
);
const encode=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
function decode(value:string){
 if(!/^[A-Za-z0-9_-]{1,512}$/.test(value))throw Error('BAD_ENCODING');
 const bytes=atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4));
 return Uint8Array.from(bytes,c=>c.charCodeAt(0));
}
async function issueProgressToken(sub:string){
 const payload={v:1,scope:'class-diary-progress',campaign:'2026',sub,
  exp:Date.now()+12*60*60_000,nonce:encode(crypto.getRandomValues(new Uint8Array(12)))};
 const body=encode(new TextEncoder().encode(JSON.stringify(payload)));
 const sig=await crypto.subtle.sign('HMAC',await progressKeyPromise,new TextEncoder().encode('progress.v1.'+body));
 return 'p1.'+body+'.'+encode(new Uint8Array(sig));
}
async function issueTicket(sub:string,schoolId:string|null=null){
 const payload={v:1,scope:'class-diary-fictional-guest',exp:Date.now()+10*60_000,
  nonce:encode(crypto.getRandomValues(new Uint8Array(12))),sub,
  ...(schoolId?{kind:'lv2',schoolId}:{})};
 const body=encode(new TextEncoder().encode(JSON.stringify(payload)));
 const sig=await crypto.subtle.sign('HMAC',await ticketKeyPromise,new TextEncoder().encode('v1.'+body));
 return 'v1.'+body+'.'+encode(new Uint8Array(sig));
}
async function validateTicket(ticket:unknown){
 if(typeof ticket!=='string'||ticket.length>480||!/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(ticket))return false;
 const [,body,signature]=ticket.split('.');
 try{
  const parsed=JSON.parse(new TextDecoder().decode(decode(body)));
  if(parsed?.v!==1||parsed?.scope!=='class-diary-fictional-guest'||
   !(parsed.sub===PREVIEW_SUBJECT&&!parsed.kind||parsed.kind==='lv2'&&
     /^[0-9a-f-]{36}$/i.test(parsed.sub)&&/^[A-Z0-9]{7}$/.test(parsed.schoolId))||
     !Number.isSafeInteger(parsed.exp)||parsed.exp<Date.now()||parsed.exp>Date.now()+10*60_000||
     !/^[A-Za-z0-9_-]{16}$/.test(parsed.nonce))return false;
  const valid=await crypto.subtle.verify('HMAC',await ticketKeyPromise,decode(signature),new TextEncoder().encode('v1.'+body));
  return valid?parsed:false;
 }catch{return false}
}

const sha256=async(value:string)=>{
 const raw=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));
 return [...raw].map(v=>v.toString(16).padStart(2,'0')).join('');
};
async function verifiedLv2(req:Request){
 const token=(req.headers.get('X-Beagu-Session')||'').trim();
 if(!/^[a-f0-9]{64}$/.test(token))return null;
 const hashed=await sha256(token);
 const {data,error}=await admin.from('beagu_level_sessions')
  .select('access_level,expires_at,identity_visitor_id,identity_campaign')
  .eq('token_sha256',hashed).maybeSingle();
 if(error||!data||Number(data.access_level)<2||
  !Number.isFinite(Date.parse(data.expires_at))||Date.parse(data.expires_at)<=Date.now())return null;
 // The same server-side earned-visitor revocation policy as beagu-level-api.
 if(data.identity_campaign==='2026'&&data.identity_visitor_id){
  const {data:earned,error:earnedError}=await admin.rpc('beagu_has_earned_challenge_visitor',{
   p_visitor:data.identity_visitor_id
  });
  if(earnedError||earned!==true)return null;
 }
 let sub=String(data.identity_visitor_id||'');
 // A privileged Lv.2 session without a challenge identity cannot inherit the
 // shared developer preview save. Make its ticket subject session-isolated.
 if(!/^[0-9a-f-]{36}$/i.test(sub)){
  const digest=await sha256('class-diary-lv2:'+hashed);
  sub=[digest.slice(0,8),digest.slice(8,12),'4'+digest.slice(13,16),
    '8'+digest.slice(17,20),digest.slice(20,32)].join('-');
 }
 return {sub};
}
async function eligiblePublicSchool(id:string){
 if(!/^[A-Z0-9]{7}$/.test(id))return false;
 try{
  const response=await fetch(url+'/functions/v1/arcade-leaderboard?school_id='+encodeURIComponent(id),{
   headers:{Accept:'application/json'},signal:AbortSignal.timeout(8000)
  });
  if(!response.ok)return false;
  const data=await response.json();
  return data?.school?.eligible===true&&data.school.school_id===id;
 }catch{return false}
}

Deno.serve(async req=>{
 const origin=req.headers.get('Origin')||'';
 if(origin&&!allowed.has(origin))return respond({error:'ORIGIN_DENIED'},403,origin);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors(origin)});
 if(req.method!=='POST')return respond({error:'METHOD_NOT_ALLOWED'},405,origin);
 if(!url||!key)return respond({error:'SERVICE_UNAVAILABLE'},503,origin);
 const length=Number(req.headers.get('Content-Length')||0);
 if(length>512)return respond({error:'BODY_TOO_LARGE'},413,origin);
 let body:unknown;
 try{
  const reader=req.body?.getReader();
  if(!reader)return respond({error:'INVALID_JSON'},400,origin);
  const decoder=new TextDecoder();
  let size=0,raw='';
  while(true){
   const piece=await reader.read();
   if(piece.done)break;
   size+=piece.value.byteLength;
   if(size>512){await reader.cancel();return respond({error:'BODY_TOO_LARGE'},413,origin);}
   raw+=decoder.decode(piece.value,{stream:true});
  }
  body=JSON.parse(raw+decoder.decode());
 }catch{return respond({error:'INVALID_JSON'},400,origin);}
 if(!body||typeof body!=='object'||Array.isArray(body))
   return respond({error:'INVALID_REQUEST'},400,origin);
 const action='action' in body&&typeof body.action==='string'?body.action:'';
 if(!['verify-ticket','verify-code','verify-lv2'].includes(action))return respond({error:'INVALID_REQUEST'},400,origin);
 if(action==='verify-ticket'){
  const valid=await validateTicket('ticket' in body?body.ticket:null);
  if(!valid)return respond({error:'INVALID_TICKET'},401,origin);
  if(valid.kind==='lv2'){
   const session=await verifiedLv2(req);
   if(!session||session.sub!==valid.sub)return respond({error:'AUTH_REQUIRED'},403,origin);
  }
  return respond({ok:true,scope:'class-diary-fictional-guest',
   ...(valid.kind==='lv2'?{entryKind:'lv2',schoolId:valid.schoolId}:{}),
   ...(valid.kind==='lv2'?{}:
     {progressToken:await issueProgressToken(valid.sub),progressExpiresInSeconds:43200})},200,origin);
 }
 if(action==='verify-lv2'){
  const id='schoolId' in body&&typeof body.schoolId==='string'?body.schoolId:'';
  if(!/^[A-Z0-9]{7}$/.test(id))return respond({error:'INVALID_SCHOOL'},400,origin);
  const session=await verifiedLv2(req);
  if(!session)return respond({error:'LV2_REQUIRED'},403,origin);
  if(!await eligiblePublicSchool(id))return respond({error:'SCHOOL_NOT_ELIGIBLE'},403,origin);
  return respond({ok:true,scope:'class-diary-fictional-guest',
   ticket:await issueTicket(session.sub,id),expiresInSeconds:600},200,origin);
 }
 try{
  // Share the protected global login attempt budget; do not reveal code guesses.
  const {data:permitted,error:budgetError}=await admin.rpc('beagu_consume_login_budget');
  if(budgetError)return respond({error:'AUTH_UNAVAILABLE'},503,origin);
  if(!permitted)return respond({error:'RATE_LIMITED'},429,origin);
  // Additional strict global rate limit for a low-entropy preview PIN.
  const {data:pinBudget,error:pinBudgetError}=await admin.rpc('beagu_consume_class_diary_preview_budget');
  if(pinBudgetError)return respond({error:'AUTH_UNAVAILABLE'},503,origin);
  if(!pinBudget)return respond({error:'RATE_LIMITED'},429,origin);
  const code='code' in body&&typeof body.code==='string'?body.code.trim():'';
  if(!/^[0-9]{4}$/.test(code)||!/^[0-9]{4}$/.test(previewPin)||code!==previewPin)
    return respond({error:'INVALID_CODE'},401,origin);
  // Legacy PIN preview grants no Lv.1/Lv.2; Lv.2 is checked only via its independent session branch.
  const ticket=await issueTicket(PREVIEW_SUBJECT);
  return respond({ok:true,scope:'class-diary-fictional-guest',ticket,expiresInSeconds:600},200,origin);
 }catch{return respond({error:'AUTH_UNAVAILABLE'},503,origin);}
});
