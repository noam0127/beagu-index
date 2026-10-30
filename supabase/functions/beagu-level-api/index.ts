import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';
import { releaseMetrics, legacyRows } from '../_shared/release-policy.mjs';
const url=Deno.env.get('SUPABASE_URL')!;
const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const allowed=new Set(['https://baeguindex.com','https://www.baeguindex.com','https://noam0127.github.io','http://localhost:8000','http://127.0.0.1:8000']);
const bytes=new TextEncoder();
const hex=(buf:Uint8Array)=>Array.from(buf,b=>b.toString(16).padStart(2,'0')).join('');
const hash=async(s:string)=>hex(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes.encode(s))));
const token=()=>hex(crypto.getRandomValues(new Uint8Array(32)));
const cors=(origin:string)=>({'Access-Control-Allow-Origin':allowed.has(origin)?origin:'https://baeguindex.com','Access-Control-Allow-Headers':'content-type, x-beagu-session, apikey, authorization','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Max-Age':'86400','Vary':'Origin'});
const send=(body:unknown,status:number,origin:string)=>new Response(JSON.stringify(body),{status,headers:{...cors(origin),'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
async function check(req:Request){
 const v=(req.headers.get('X-Beagu-Session')||'').trim();
 if(!/^[a-f0-9]{64}$/.test(v))return null;
 const digest=await hash(v);
 const {data,error}=await admin.from('beagu_level_sessions').select('access_level,expires_at').eq('token_sha256',digest).maybeSingle();
 if(error||!data||(!Number.isFinite(Date.parse(data.expires_at))||Date.parse(data.expires_at)<=Date.now()))return null;
 return data;
}
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get('Origin')||'';
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors(origin)});
 if(req.method!=='POST')return send({error:'METHOD_NOT_ALLOWED'},405,origin);
 if(origin&&!allowed.has(origin))return send({error:'ORIGIN_NOT_ALLOWED'},403,origin);
 if((Number(req.headers.get('Content-Length'))||0)>1024)return send({error:'TOO_LARGE'},413,origin);
 let body:Record<string,unknown>;
 try{const reader=req.body?.getReader();if(!reader)throw Error();let size=0,raw='';const decoder=new TextDecoder();while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>1024){await reader.cancel();return send({error:'TOO_LARGE'},413,origin);}raw+=decoder.decode(part.value,{stream:true});}body=JSON.parse(raw+decoder.decode());}catch{return send({error:'INVALID_JSON'},400,origin);}
 if(!body||typeof body!=='object'||Array.isArray(body))return send({error:'INVALID_BODY'},400,origin);
 try{
  if(body.action==='login'){
   // Database-backed global limiter cannot be evaded with forged IP headers.
   const {data:permitted,error:limitError}=await admin.rpc('beagu_consume_login_budget');
   if(limitError)return send({error:'AUTH_UNAVAILABLE'},503,origin);
   if(!permitted)return send({error:'RATE_LIMITED'},429,origin);
   const code=typeof body.code==='string'?body.code.trim():'';
   if(!/^[A-Za-z0-9-]{8,120}$/.test(code))return send({error:'INVALID_CODE'},401,origin);
   const {data:acc,error}=await admin.from('beagu_level_codes').select('access_level').eq('code_sha256',await hash(code)).eq('active',true).maybeSingle();
   if(error)return send({error:'AUTH_UNAVAILABLE'},503,origin);
   if(!acc)return send({error:'INVALID_CODE'},401,origin);
   const v=token(),expiry=new Date(Date.now()+6*60*60*1000).toISOString();
   const {error:writeError}=await admin.from('beagu_level_sessions').insert({token_sha256:await hash(v),access_level:acc.access_level,expires_at:expiry});
   if(writeError)return send({error:'SESSION_UNAVAILABLE'},503,origin);
   return send({token:v,level:acc.access_level,expires_at:expiry},200,origin);
  }
  if(body.action!=='verify'&&body.action!=='school'&&body.action!=='logout')return send({error:'UNKNOWN_ACTION'},400,origin);
  const session=await check(req);
  if(!session)return send({error:'AUTH_REQUIRED'},401,origin);
  if(body.action==='logout'){
   const {error}=await admin.from('beagu_level_sessions').delete().eq('token_sha256',await hash((req.headers.get('X-Beagu-Session')||'').trim()));
   return send(error?{error:'LOGOUT_UNAVAILABLE'}:{ok:true},error?503:200,origin);
  }
  if(body.action==='verify')return send({level:session.access_level,expires_at:session.expires_at},200,origin);
  const id=String(body.schoolId||'');
  if(!/^\d{7}$/.test(id))return send({error:'INVALID_SCHOOL'},400,origin);
  const level=Number(session.access_level);
  const [legacy,metrics,catalog]=await Promise.all([
   level===2?admin.from('beagu_level_data').select('survey_year,access_level,summary,release_status').eq('school_id',id).eq('release_status','approved').lt('survey_year',2026).order('survey_year').limit(20):Promise.resolve({data:[],error:null}),
   admin.from('beagu_release_metrics_v2').select('survey_year,question_id,access_level,value,release_version,approval_status,privacy_status,identity_reviewed,question_reviewed,small_cell_reviewed,differencing_reviewed,approved_at,approved_by,approval_evidence').eq('school_id',id).eq('approval_status','APPROVED').lte('access_level',level).order('release_version',{ascending:false}).limit(1000),
   admin.from('beagu_metric_catalog').select('*').eq('verified',true).limit(1000)
  ]);
  if(legacy.error||metrics.error||catalog.error)return send({error:'DATA_UNAVAILABLE'},503,origin);
  const rows=legacyRows(legacy.data||[],level);
  const safe=releaseMetrics(metrics.data||[],catalog.data||[],level);
  for(const year of [...new Set(safe.map((m:any)=>m.year))]){
   rows.push({year,access_level:year===2026?1:2,summary:{metrics:safe.filter((m:any)=>m.year===year)}});
  }
  return send({school_id:id,level,rows},200,origin);
 }catch(err){console.error('beagu-level-api error',err instanceof Error?err.name:'Error');return send({error:'INTERNAL_ERROR'},500,origin);}
});
