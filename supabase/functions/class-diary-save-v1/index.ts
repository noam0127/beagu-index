// Private, opt-in visual novel checkpoints. No raw recovery key or access ticket is stored.
import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.58.0';
const url=Deno.env.get('SUPABASE_URL')||'',key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const origins=new Set(['https://baeguindex.com','https://www.baeguindex.com','https://noam0127.github.io','http://localhost:8000','http://127.0.0.1:8000','http://127.0.0.1:8123']);
const digest=async(s:string)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(x=>x.toString(16).padStart(2,'0')).join('');
function head(o:string){return {'Access-Control-Allow-Origin':origins.has(o)?o:'https://baeguindex.com','Access-Control-Allow-Headers':'content-type, x-beagu-session, x-class-diary-guest-ticket','Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin','Cache-Control':'no-store, private','Content-Type':'application/json; charset=utf-8','X-Content-Type-Options':'nosniff'};}
const reply=(o:string,status:number,value:unknown)=>new Response(JSON.stringify(value),{status,headers:head(o)});
const decode=(s:string)=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-s.length%4)%4)),c=>c.charCodeAt(0));
async function guestAllowed(ticket:string){
 if(!/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(ticket)||ticket.length>480)return false;
 try{
  const [,body,sig]=ticket.split('.');
  const payload=JSON.parse(new TextDecoder().decode(decode(body)));
  if(payload?.v!==1||payload.scope!=='class-diary-fictional-guest'||!Number.isSafeInteger(payload.exp)||payload.exp<Date.now()||payload.exp>Date.now()+600000||!/^[A-Za-z0-9_-]{16}$/.test(payload.nonce))return false;
  const signing=await crypto.subtle.importKey('raw',new TextEncoder().encode('class-diary-guest-v1:'+key),{name:'HMAC',hash:'SHA-256'},false,['verify']);
  return crypto.subtle.verify('HMAC',signing,decode(sig),new TextEncoder().encode('v1.'+body));
 }catch{return false;}
}
async function levelAllowed(session:string){
 if(!/^[0-9a-f]{64}$/.test(session))return false;
 const {data,error}=await admin.from('beagu_level_sessions').select('access_level,expires_at').eq('token_sha256',await digest(session)).maybeSingle();
 return !error&&!!data&&Number(data.access_level)>=2&&Date.parse(data.expires_at)>Date.now();
}
function valid(p:any){
 if(!p||p.version!==1||p.mode!=='semester'||!p.profile||!Array.isArray(p.history))return false;
 const f=p.profile;
 return typeof f.name==='string'&&/^[가-힣]{2,8}$/.test(f.name)&&
 ['new','mid','senior'].includes(f.experience)&&['woman','man','undisclosed'].includes(f.gender)&&
 /^[IE][NS][FT][PJ]$/.test(f.mbti||'')&&['woman','man','none'].includes(f.partner)&&
 ['semester_chapter','semester_reflection','semester_ending'].includes(p.phase)&&
 Number.isInteger(p.episode)&&p.episode>=1&&p.episode<=36&&
 Number.isInteger(p.page)&&p.page>=0&&p.page<=100&&
 p.history.length===(p.phase==='semester_chapter'?p.episode-1:p.episode)&&
 (p.phase!=='semester_ending'||p.episode===36)&&
 p.history.every((h:any,i:number)=>h&&h.episode===i+1&&Number.isInteger(h.choice)&&h.choice>=0&&h.choice<=2)&&
 Object.keys(p).every(k=>['version','mode','profile','history','phase','episode','page'].includes(k));
}
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get('origin')||'';
 if(origin&&!origins.has(origin))return reply(origin,403,{error:'ORIGIN_DENIED'});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:head(origin)});
 if(req.method!=='POST')return reply(origin,405,{error:'METHOD_NOT_ALLOWED'});
 if(!url||!key)return reply(origin,503,{error:'SERVICE_UNAVAILABLE'});
 let raw='',body:any;
 try{
  const reader=req.body?.getReader();if(!reader)throw Error('BODY');
  const decoder=new TextDecoder();let size=0;
  while(true){const x=await reader.read();if(x.done)break;size+=x.value.byteLength;if(size>12500)return reply(origin,413,{error:'TOO_LARGE'});raw+=decoder.decode(x.value,{stream:true});}
  body=JSON.parse(raw+decoder.decode());
 }catch{return reply(origin,400,{error:'BAD_JSON'})}
 if(!body||!['save','load','delete'].includes(body.action)||typeof body.recoveryKey!=='string'||!/^[0-9a-f]{64}$/.test(body.recoveryKey))return reply(origin,400,{error:'BAD_REQUEST'});
 const id=await digest('beagu-diary-save-v1:'+body.recoveryKey);
 const table=admin.schema('beagu_private').from('class_diary_save_slots_v1');
 const {data:row,error:readError}=await table.select('scope,school_id,payload,expires_at').eq('token_sha256',id).maybeSingle();
 if(readError)return reply(origin,503,{error:'DATABASE_UNAVAILABLE'});
 const available=!!row&&Date.parse(row.expires_at)>Date.now();
 if(body.action==='load')return available?reply(origin,200,{ok:true,scope:row.scope,schoolId:row.school_id,snapshot:row.payload}):reply(origin,404,{error:'NOT_FOUND'});
 if(body.action==='delete'){
  if(available){const {error}=await table.delete().eq('token_sha256',id);if(error)return reply(origin,503,{error:'DATABASE_UNAVAILABLE'})}
  return reply(origin,200,{ok:true});
 }
 const {scope,schoolId,snapshot}=body;
 if(!['guest','level2'].includes(scope)||typeof schoolId!=='string'||!(schoolId==='fictional'||/^[A-Z0-9]{7}$/.test(schoolId))||(scope==='guest'&&schoolId!=='fictional')||!valid(snapshot)||JSON.stringify(snapshot).length>9000)return reply(origin,400,{error:'INVALID_SNAPSHOT'});
 if(row&&!available)return reply(origin,410,{error:'EXPIRED'});
 if(row){
  if(row.scope!==scope||row.school_id!==schoolId)return reply(origin,403,{error:'SCOPE_MISMATCH'});
  const {error}=await table.update({payload:snapshot,updated_at:new Date().toISOString(),expires_at:new Date(Date.now()+90*86400000).toISOString()}).eq('token_sha256',id);
  if(error)return reply(origin,503,{error:'WRITE_FAILED'});
 }else{
  const ok=scope==='guest'?await guestAllowed(req.headers.get('x-class-diary-guest-ticket')||''):await levelAllowed(req.headers.get('x-beagu-session')||'');
  if(!ok)return reply(origin,401,{error:'ACCESS_REQUIRED'});
  const {error}=await table.insert({token_sha256:id,scope,school_id:schoolId,payload:snapshot});
  if(error)return reply(origin,503,{error:'WRITE_FAILED'});
 }
 return reply(origin,200,{ok:true,expiresInDays:90});
});
