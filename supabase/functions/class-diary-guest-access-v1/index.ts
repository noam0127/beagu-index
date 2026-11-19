// Private Class Diary preview gate: only the configured server-side PIN is accepted.
// No challenge identity codes, Level 2 elevation, or real-school data access.
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
 'Access-Control-Allow-Headers':'content-type',
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
async function issueTicket(sub:string){
 const payload={v:1,scope:'class-diary-fictional-guest',exp:Date.now()+10*60_000,
  nonce:encode(crypto.getRandomValues(new Uint8Array(12))),sub};
 const body=encode(new TextEncoder().encode(JSON.stringify(payload)));
 const sig=await crypto.subtle.sign('HMAC',await ticketKeyPromise,new TextEncoder().encode('v1.'+body));
 return 'v1.'+body+'.'+encode(new Uint8Array(sig));
}
async function validateTicket(ticket:unknown){
 if(typeof ticket!=='string'||ticket.length>480||!/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(ticket))return false;
 const [,body,signature]=ticket.split('.');
 try{
  const parsed=JSON.parse(new TextDecoder().decode(decode(body)));
  if(parsed?.v!==1||parsed?.scope!=='class-diary-fictional-guest'||parsed?.sub!==PREVIEW_SUBJECT||
     !Number.isSafeInteger(parsed.exp)||parsed.exp<Date.now()||parsed.exp>Date.now()+10*60_000||
     !/^[A-Za-z0-9_-]{16}$/.test(parsed.nonce))return false;
  const valid=await crypto.subtle.verify('HMAC',await ticketKeyPromise,decode(signature),new TextEncoder().encode('v1.'+body));
  return valid?parsed:false;
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
 const action='action' in body&&body.action==='verify-ticket'?'verify-ticket':'verify-code';
 if('action' in body&&body.action!==action)return respond({error:'INVALID_REQUEST'},400,origin);
 if(action==='verify-ticket'){
  const valid=await validateTicket('ticket' in body?body.ticket:null);
  return valid
   ?respond({ok:true,scope:'class-diary-fictional-guest',
      ...(typeof valid.sub==='string'&&/^[0-9a-f-]{36}$/i.test(valid.sub)
         ?{progressToken:await issueProgressToken(valid.sub),progressExpiresInSeconds:43200}:{})},200,origin)
   :respond({error:'INVALID_TICKET'},401,origin);
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
  // Private preview access only. Never grant Lv.1/Lv.2 or accept challenge codes.
  const ticket=await issueTicket(PREVIEW_SUBJECT);
  return respond({ok:true,scope:'class-diary-fictional-guest',ticket,expiresInSeconds:600},200,origin);
 }catch{return respond({error:'AUTH_UNAVAILABLE'},503,origin);}
});
