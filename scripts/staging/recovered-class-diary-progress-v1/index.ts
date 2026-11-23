/** Isolated stage-only Class Diary (class-diary-progress-v1). Never deploy to production.
 * Fictional single-owner preview; no public PIN or Lv2 credential.
 * Any missing owner approval or preview PIN means deliberate 503 NO-GO. */
// 고유번호 소유 인증 후 36화 진행 상태를 저장/불러오는 전용 API.
// Access is a signed progress token, never a raw identity code or Lv2 credential.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';
const url=Deno.env.get('SUPABASE_URL')||'';
const secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
const db=url==='https://ycwuugggqbunlbwuzvbx.supabase.co' && secret ?
 createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}}) : null;
// Private owner-preview progress only. Previously issued participant records remain untouched.
const PREVIEW_SUBJECT='8a61e133-2afd-469c-b611-f409b4197d61';
const STAGE_URL='https://ycwuugggqbunlbwuzvbx.supabase.co';
const origins=new Set(['http://localhost:8000','http://127.0.0.1:8000','http://127.0.0.1:8123']);
const renderOrigin=Deno.env.get('BEAGU_STAGING_ALLOWED_ORIGIN')||'';
const renderPattern=/^https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.onrender\.com$/;
const allowedOrigin=(origin:string)=>url===STAGE_URL && (origins.has(origin)||
 (origin===renderOrigin && renderPattern.test(renderOrigin)));
const approved=()=>Deno.env.get('BEAGU_STAGING_CLASS_DIARY_APPROVED')==='true';
const encoder=new TextEncoder();
const signingKey=secret?crypto.subtle.importKey('raw',encoder.encode('class-diary-progress-v1:'+secret),
 {name:'HMAC',hash:'SHA-256'},false,['verify']):null;
function headers(origin:string){return {
 ...(allowedOrigin(origin)?{'Access-Control-Allow-Origin':origin}:{}),
 'Access-Control-Allow-Methods':'POST, OPTIONS',
 'Access-Control-Allow-Headers':'content-type',
 'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Vary':'Origin'
};}
function reply(result:unknown,status:number,origin:string){
 return new Response(JSON.stringify(result),{status,headers:{...headers(origin),'Content-Type':'application/json; charset=utf-8'}});
}
function decode(base:string){
 if(!/^[a-zA-Z0-9_-]{1,650}$/.test(base))throw Error('INVALID_ENCODING');
 const raw=atob(base.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-base.length%4)%4));
 return Uint8Array.from(raw,c=>c.charCodeAt(0));
}
async function subject(token:unknown):Promise<string|null>{
 if(!signingKey||typeof token!=='string'||token.length>900||!/^p1\.[\w-]+\.[\w-]+$/.test(token))return null;
 const parts=token.split('.');
 try{
  const data=JSON.parse(new TextDecoder().decode(decode(parts[1])));
  if(data.v!==1||data.scope!=='class-diary-progress'||data.campaign!=='2026'||
   typeof data.sub!=='string'||!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(data.sub)||
   !Number.isSafeInteger(data.exp)||data.exp<Date.now()||data.exp>Date.now()+12*60*60_000||
   typeof data.nonce!=='string'||! /^[a-zA-Z0-9_-]{16}$/.test(data.nonce))return null;
  const okay=await crypto.subtle.verify('HMAC',await signingKey,decode(parts[2]),
   encoder.encode('progress.v1.'+parts[1]));
  return okay?data.sub:null;
 }catch{return null;}
}
function validState(state:any):boolean {
 if(!state||typeof state!=='object'||Array.isArray(state)||
  state.version!=='class-diary-semester/v1'||
  !['semester_chapter','semester_reflection','semester_ending'].includes(state.phase)||
  !Number.isInteger(state.episode)||state.episode<1||state.episode>36||
  !Array.isArray(state.history)||state.history.length>36||
  typeof state.schoolName!=='string'||state.schoolName.length>120||
  !state.profile||typeof state.profile!=='object'||
  typeof state.profile.name!=='string'||state.profile.name.length>100||
  !['woman','man','none'].includes(state.profile.partner)||
  !state.stats||typeof state.stats!=='object')return false;
 if(!state.history.every((h:any,i:number)=>h&&h.episode===i+1&&Number.isInteger(h.choice)&&h.choice>=0&&h.choice<=2))return false;
 if((state.phase==='semester_reflection'&&state.history.length!==state.episode)||
   (state.phase==='semester_chapter'&&state.history.length!==state.episode-1)||
   (state.phase==='semester_ending'&&state.history.length!==36))return false;
 for(const k of ['affection','trust','agency','fatigue','voice','boundary','support']){
  const n=state.stats[k];if(typeof n!=='number'||!Number.isFinite(n)||n<0||n>100)return false;
 }
 return true;
}
Deno.serve(async req=>{
 const origin=req.headers.get('Origin')||'';
 if(url!==STAGE_URL||!secret||!db)return reply({error:'STAGING_PROJECT_ONLY'},503,origin);
 if(!allowedOrigin(origin))return reply({error:'ORIGIN_DENIED'},403,origin);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:headers(origin)});
 if(req.method!=='POST')return reply({error:'METHOD_NOT_ALLOWED'},405,origin);
 if(!approved())return reply({error:'PREVIEW_NOT_READY'},503,origin);
 const declared=Number(req.headers.get('Content-Length')||0);
 if(declared>40000)return reply({error:'BODY_TOO_LARGE'},413,origin);
 try {
  const reader=req.body?.getReader();if(!reader)return reply({error:'INVALID_BODY'},400,origin);
  let size=0,raw='';const decoder=new TextDecoder();
  while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;
   if(size>40000){await reader.cancel();return reply({error:'BODY_TOO_LARGE'},413,origin);}
   raw+=decoder.decode(part.value,{stream:true});}
  const body=JSON.parse(raw+decoder.decode());
  if(!body||typeof body!=='object'||Array.isArray(body)||
    !['load','save'].includes(body.action))return reply({error:'INVALID_ACTION'},400,origin);
  const visitorId=await subject(body.token);
  if(!visitorId||visitorId!==PREVIEW_SUBJECT)
    return reply({error:'PROGRESS_SESSION_EXPIRED'},401,origin);
  if(body.action==='load'){
   const {data,error}=await db.rpc('beagu_class_diary_preview_progress_read');
   if(error)return reply({error:'DATABASE_UNAVAILABLE'},503,origin);
   return reply({ok:true,progress:data||null},200,origin);
  }
  if(!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0||
     !validState(body.state))return reply({error:'INVALID_SAVE'},400,origin);
  const {data,error}=await db.rpc('beagu_class_diary_preview_progress_write',{
   p_expected_revision:body.expectedRevision,p_state:body.state
  });
  if(error)return reply({error:'DATABASE_UNAVAILABLE'},503,origin);
  if(!data)return reply({error:'SAVE_CONFLICT'},409,origin);
  return reply({ok:true,revision:data.revision,updatedAt:data.updatedAt},200,origin);
 }catch(e){
  if(e instanceof SyntaxError)return reply({error:'INVALID_JSON'},400,origin);
  console.error('class-diary-progress-v1',String(e).slice(0,120));
  return reply({error:'SERVICE_UNAVAILABLE'},503,origin);
 }
});
