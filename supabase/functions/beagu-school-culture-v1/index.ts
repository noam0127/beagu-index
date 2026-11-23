import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';
import { approved2026ReleaseIsOldEnough } from '../_shared/release-policy.mjs';
// Read-only, approval-gated 2026 school-culture classification for Lv.1 and Lv.2.
// Never returns raw survey rows, submission counts, or unapproved observations.
const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
const origins=new Set(['https://baeguindex.com','https://www.baeguindex.com','https://noam0127.github.io','http://localhost:8000','http://127.0.0.1:8000']);
const names:Record<string,string>={
ISTJ:'정돈된 실무형',ISTP:'실무 재량형',ISFJ:'숙의 안정형',ISFP:'숙의 독립형',
INTJ:'집중 실행형',INTP:'독립 실험형',INFJ:'협의 혁신형',INFP:'자율 혁신형',
ESTJ:'유대 운영형',ESTP:'유대 재량형',ESFJ:'공동체 안정형',ESFP:'친교 협의형',
ENTJ:'활력 추진형',ENTP:'활력 실험형',ENFJ:'공동체 혁신형',ENFP:'친교 실험형'};
const keys=['Q14','Q15','Q16','Q17'];
const dimensions=[
{key:'Q14',label:'관계의 범위',left:'업무적 관계',right:'친교 확장'},
{key:'Q15',label:'의사결정',left:'구성원 합의',right:'관리자 위임'},
{key:'Q16',label:'변화 도입',left:'먼저 시도',right:'충분한 검토'},
{key:'Q17',label:'수업·학급 운영',left:'공동 운영',right:'교사별 운영'}];
const headers=(origin:string)=>({
'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
'X-Content-Type-Options':'nosniff','Vary':'Origin',
'Access-Control-Allow-Origin':origins.has(origin)?origin:'https://baeguindex.com',
'Access-Control-Allow-Headers':'content-type,x-beagu-session',
'Access-Control-Allow-Methods':'POST,OPTIONS'});
function send(origin:string,body:unknown,status=200){
 return new Response(JSON.stringify(body),{status,headers:headers(origin)});
}
async function sha256(v:string){const buffer=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v));
return Array.from(new Uint8Array(buffer),n=>n.toString(16).padStart(2,'0')).join('');}
function approved(r:any){
return r&&approved2026ReleaseIsOldEnough(r.approved_at)&&r.approval_status==='APPROVED'&&r.privacy_status==='PASSED'&&
r.identity_reviewed===true&&r.question_reviewed===true&&r.small_cell_reviewed===true&&
r.differencing_reviewed===true&&r.approved_by&&r.approval_evidence&&
Number(r.access_level)===1&&Number.isInteger(Number(r.n_valid))&&Number(r.n_valid)>=5&&
Number.isInteger(Number(r.teacher_count))&&Number(r.teacher_count)>=5&&
typeof r.value==='string'&&/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(r.value)&&
Number.isFinite(Number(r.value))&&Number(r.value)>=-2&&Number(r.value)<=2;
}
function classify(rows:any[]){
 const grouped=new Map<string,Map<string,any>>();
 for(const r of rows){
  if(!approved(r)||!keys.includes(String(r.question_id)))continue;
  const version=String(r.release_version||'');
  if(!version)continue;
  if(!grouped.has(version))grouped.set(version,new Map());
  const items=grouped.get(version)!;
  if(items.has(r.question_id))items.set(r.question_id,null); // fail-closed on duplicate
  else items.set(r.question_id,r);
 }
 const versions=[...grouped.keys()].sort((a,b)=>b.localeCompare(a,'en',{numeric:true}));
 const selected=versions.map(v=>grouped.get(v)!).find(group=>keys.every(k=>group.has(k)&&group.get(k)));
 if(!selected)return {status:'not_published'};
 const values=Object.fromEntries(keys.map(k=>[k,Number(selected.get(k).value)]));
 const axes=dimensions.map(d=>({...d,value:values[d.key]}));
 if(axes.some(a=>Math.abs(a.value)<0.5))return {status:'mixed',axes};
 const type=(values.Q14>0?'E':'I')+(values.Q16>0?'S':'N')+
 (values.Q15>0?'T':'F')+(values.Q17>0?'P':'J');
 return {status:'published',type,name:names[type],axes};
}
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get('Origin')||'';
 if(origin&&!origins.has(origin))return send(origin,{error:'ORIGIN_NOT_ALLOWED'},403);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:headers(origin)});
 if(req.method!=='POST')return send(origin,{error:'METHOD_NOT_ALLOWED'},405);
 const raw=(req.headers.get('X-Beagu-Session')||'').trim();
 if(!/^[a-f0-9]{64}$/.test(raw))return send(origin,{error:'AUTH_REQUIRED'},401);
 try{
  const {data:session,error:sessionError}=await admin.from('beagu_level_sessions')
   .select('access_level,expires_at').eq('token_sha256',await sha256(raw)).maybeSingle();
  if(sessionError||!session||Number(session.access_level)<1||
     !Number.isFinite(Date.parse(session.expires_at))||Date.parse(session.expires_at)<=Date.now())
   return send(origin,{error:'AUTH_REQUIRED'},401);
  if((Number(req.headers.get('Content-Length'))||0)>1024)return send(origin,{error:'TOO_LARGE'},413);
  const input=await req.text();if(input.length>1024)return send(origin,{error:'TOO_LARGE'},413);
  let body:any;try{body=JSON.parse(input)}catch{return send(origin,{error:'INVALID_JSON'},400)}
  if(body?.action!=='batch'||!Array.isArray(body.schoolIds)||body.schoolIds.length<1||body.schoolIds.length>20||
     body.schoolIds.some((id:any)=>typeof id!=='string'||!/^\d{7}$/.test(id))||
     new Set(body.schoolIds).size!==body.schoolIds.length)
   return send(origin,{error:'INVALID_SCOPE'},400);
  const {data:releasedIds,error:releaseGateError}=await admin.rpc(
    'beagu_2026_level_released_school_ids',
    {p_ids:body.schoolIds,p_level:Number(session.access_level)});
  if(releaseGateError||!Array.isArray(releasedIds))
    return send(origin,{error:'PUBLICATION_GATE_UNAVAILABLE'},503);
  const releasedSet=new Set(releasedIds);
  const {data,error}=await admin.from('beagu_release_metrics_v2')
   .select('school_id,question_id,value,release_version,access_level,n_valid,teacher_count,approval_status,privacy_status,identity_reviewed,question_reviewed,small_cell_reviewed,differencing_reviewed,approved_at,approved_by,approval_evidence')
   .in('school_id',body.schoolIds).eq('survey_year',2026).eq('access_level',1)
   .in('question_id',keys).eq('approval_status','APPROVED').limit(1000);
  if(error)return send(origin,{error:'DATA_UNAVAILABLE'},503);
  const values:Record<string,unknown>={};
  for(const id of body.schoolIds)
    values[id]=releasedSet.has(id)?classify((data||[]).filter((r:any)=>r.school_id===id)):{status:'not_published'};
  return send(origin,{values});
 }catch(_){return send(origin,{error:'INTERNAL_ERROR'},500)}
});