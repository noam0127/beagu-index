// Temporary Class Diary access by already-issued 2026 challenge identity code.
// No new code issuance, no Level 2 elevation, no real school data access.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';
const url = Deno.env.get('SUPABASE_URL') || '';
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const admin = createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
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
 if(!body||typeof body!=='object'||Array.isArray(body)||('action' in body)&&body.action!=='verify-code')
   return respond({error:'INVALID_REQUEST'},400,origin);
 try{
  // Share the protected global login attempt budget; do not reveal code guesses.
  const {data:permitted,error:budgetError}=await admin.rpc('beagu_consume_login_budget');
  if(budgetError)return respond({error:'AUTH_UNAVAILABLE'},503,origin);
  if(!permitted)return respond({error:'RATE_LIMITED'},429,origin);
  const code='code' in body&&typeof body.code==='string'?body.code.trim().toUpperCase():'';
  const validShape=/^(?:BG26-(?:[A-F0-9]{4}-){4}[A-F0-9]{4}|BG26-[A-HJ-NP-Z2-9]{6}-[A-HJ-NP-Z2-9]{6}|[A-HJ-NP-Z2-9]{10})$/.test(code);
  if(!validShape)return respond({error:'INVALID_CODE'},401,origin);
  const {data:valid,error}=await admin.rpc('beagu_check_class_diary_guest_code',{p_code:code});
  if(error)return respond({error:'AUTH_UNAVAILABLE'},503,origin);
  if(valid!==true)return respond({error:'INVALID_CODE'},401,origin);
  // This proves only that the code exists, not the caller's personal identity.
  // Do not send an Lv2 token, school records, participant no, or identity code back.
  return respond({ok:true,scope:'class-diary-fictional-guest'},200,origin);
 }catch{return respond({error:'AUTH_UNAVAILABLE'},503,origin);}
});
