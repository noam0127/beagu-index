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
  if(body.action!=='verify'&&body.action!=='school'&&body.action!=='logout'&&body.action!=='percentiles'&&body.action!=='offices'&&body.action!=='ranked_schools')return send({error:'UNKNOWN_ACTION'},400,origin);
  const session=await check(req);
  if(!session)return send({error:'AUTH_REQUIRED'},401,origin);
  if(body.action==='logout'){
   const {error}=await admin.from('beagu_level_sessions').delete().eq('token_sha256',await hash((req.headers.get('X-Beagu-Session')||'').trim()));
   return send(error?{error:'LOGOUT_UNAVAILABLE'}:{ok:true},error?503:200,origin);
  }
  if(body.action==='verify')return send({level:session.access_level,expires_at:session.expires_at},200,origin);
  if(body.action==='percentiles'){
   // Batch only a vetted 2026 percentile, never raw survey rows, counts or metadata.
   const ids=body.schoolIds;
   if(!Array.isArray(ids)||ids.length<1||ids.length>20||
     ids.some(id=>typeof id!=='string'||!/^\d{7}$/.test(id))||
     new Set(ids).size!==ids.length)return send({error:'INVALID_SCHOOLS'},400,origin);
   const [metrics,catalog]=await Promise.all([
    admin.from('beagu_release_metrics_v2')
     .select('school_id,survey_year,question_id,access_level,value,release_version,approval_status,privacy_status,identity_reviewed,question_reviewed,small_cell_reviewed,differencing_reviewed,approved_at,approved_by,approval_evidence')
     .in('school_id',ids).eq('survey_year',2026).eq('question_id','percentile')
     .eq('approval_status','APPROVED').eq('access_level',1).limit(200),
    admin.from('beagu_metric_catalog')
     .select('*').eq('survey_year',2026).eq('question_id','percentile').eq('verified',true).limit(10)
   ]);
   if(metrics.error||catalog.error)return send({error:'DATA_UNAVAILABLE'},503,origin);
   const out:Record<string,number>={};
   for(const id of ids){
    const approved=releaseMetrics((metrics.data||[]).filter((m:any)=>m.school_id===id),catalog.data||[],1)
     .filter((m:any)=>m.year===2026&&m.key==='percentile'&&typeof m.value==='number'&&m.value>=0&&m.value<=100);
    if(approved.length)out[id]=approved[0].value;
   }
   return send({values:out},200,origin);
  }


  if(body.action==='offices'){
   if(Number(session.access_level)<1)return send({error:'ACCESS_DENIED'},403,origin);
   const region=typeof body.region==='string'?body.region.trim():'';
   if(!/^[가-힣A-Za-z·\s]{2,24}$/.test(region))return send({error:'INVALID_REGION'},400,origin);
   const {data,error}=await admin.from('beagu_lv1_office_directory')
     .select('support_office').eq('sido_standard',region).order('support_office',{ascending:true}).limit(300);
   if(error)return send({error:'OFFICE_UNAVAILABLE'},503,origin);
   return send({offices:(data||[]).map((x:any)=>String(x.support_office)).filter((v:string)=>v.length>0&&v.length<=100)},200,origin);
  }
  if(body.action==='ranked_schools'){
   if(Number(session.access_level)<1)return send({error:'ACCESS_DENIED'},403,origin);
   const searchText=typeof body.searchText==='string'?body.searchText.trim():'';
   const region=typeof body.region==='string'?body.region.trim():'';
   const office=typeof body.office==='string'?body.office.trim():'';
   const sort=typeof body.sort==='string'?body.sort:'school_name';
   const pagination=Number(body.page);
   const sorts=new Set(['school_name','beagu_percentile_2025','student_count','housing_price_won']);
   if(!sorts.has(sort)||!Number.isSafeInteger(pagination)||pagination<0||pagination>500||
      searchText.length>80||region.length>24||office.length>100||
      !/^[가-힣A-Za-z·\s]*$/.test(region)||/[\x00-\x1f]/.test(searchText+office)||
      (!searchText&&!region)||(!region&&office))
      return send({error:'INVALID_SEARCH_FILTER'},400,origin);
   let query=admin.from('beagu_lv1_school_sort_index')
      .select('school_id,school_name,sido,sido_standard,support_office,address,establishment,school_kind,status,beagu_percentile_2025,student_count,student_reference_year,housing_price_won',{count:'exact'});
   if(searchText)query=query.ilike('school_name','%'+searchText.replace(/[%_\\]/g,'')+'%');
   if(region)query=query.eq('sido_standard',region);
   if(office)query=query.eq('support_office',office);
   const from=pagination*20;
   const {data,count,error}=await query
     .order(sort,{ascending:false,nullsFirst:false})
     .order('school_name',{ascending:false,nullsFirst:false})
     .order('school_id',{ascending:false})
     .range(from,from+19);
   if(error)return send({error:'RANKED_SEARCH_UNAVAILABLE'},503,origin);
   return send({schools:data||[],total:count||0,page:pagination,sort,direction:'desc',nulls:'last'},200,origin);
  }

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
  // School facts are independently reviewed, not teacher survey observations.
  // Return only per-tier, per-year allowlisted facts from the server after validating session.
  const [officialNumbers, officialCategories]=await Promise.all([
    admin.from('beagu_school_report_official_facts')
      .select('survey_year,fact_key,label,fact_value,unit,source_year')
      .eq('school_id',id).eq('review_status','APPROVED').limit(100),
    admin.from('beagu_school_report_official_categories')
      .select('survey_year,fact_key,label,fact_value,reference_year')
      .eq('school_id',id).eq('review_status','APPROVED').limit(30)
  ]);
  if(officialNumbers.error||officialCategories.error)return send({error:'DATA_UNAVAILABLE'},503,origin);

  // These are pre-aggregated APPROVED official school facts only. The view is
  // service-role restricted: never query teacher responses or raw files.
  const [schoolRegion,nationalRegionalNumbers,nationalRegionalCategories]=await Promise.all([
    admin.from('schools').select('sido_standard').eq('school_id',id).maybeSingle(),
    admin.from('beagu_official_numeric_comparisons')
      .select('survey_year,source_year,fact_key,scope,region,average_value')
      .in('survey_year',[2024,2025]).limit(1000),
    admin.from('beagu_official_category_comparisons')
      .select('survey_year,reference_year,fact_key,scope,region,mode_value')
      .in('survey_year',[2024,2025]).limit(600)
  ]);
  if(schoolRegion.error||nationalRegionalNumbers.error||nationalRegionalCategories.error)
    return send({error:'COMPARISON_DATA_UNAVAILABLE'},503,origin);
  const schoolSido=String(schoolRegion.data?.sido_standard||'');
  const index=new Map<string,{national?:unknown;regional?:unknown}>();
  const put=(y:number,year:number,k:string,scope:string,region:string,v:unknown)=>{
    if(scope!=='national'&&!(scope==='regional'&&region===schoolSido))return;
    const key=[y,year,k].join(':');
    const found=index.get(key)||{};
    if(scope==='national')found.national=v;
    else found.regional=v;
    index.set(key,found);
  };
  for(const m of nationalRegionalNumbers.data||[])
    put(Number(m.survey_year),Number(m.source_year),String(m.fact_key),String(m.scope),String(m.region),m.average_value);
  for(const m of nationalRegionalCategories.data||[])
    put(Number(m.survey_year),Number(m.reference_year),String(m.fact_key),String(m.scope),String(m.region),m.mode_value);
  const presentNumber=(v:unknown,unit:string)=>{
    const n=Number(v);
    return v!==null&&v!==undefined&&Number.isFinite(n)
      ?n.toLocaleString('ko-KR',{maximumFractionDigits:2})+unit:null;
  };
  const presentCategory=(key:string,v:unknown)=>{
    if(typeof v!=='string')return null;
    return key==='milk_lunch'?(v==='O'?'운영':v==='X'?'미운영':null):v;
  };

  const basicKeys=new Set(['students','teachers','classes','students_per_class','establishment_type']);
  const detailedKeys=new Set([
    'vice_principals','lead_teachers','classrooms','gym_spaces','cafeterias',
    'teacher_support_spaces','land_area','playground_area','admin_employees',
    'school_employees','meal_place','milk_lunch','junior_teacher_ratio','male_teacher_ratio',
    'district_housing_price_mean','september_participation_rate'
  ]);
  const vettedCategories:Record<string,Set<string>>={
    establishment_type:new Set(['국립','공립','사립']),
    meal_place:new Set(['식당','교실','식당+교실']),
    milk_lunch:new Set(['O','X'])
  };
  const facts:Array<{year:number;access_level:number;summary:{metrics:Array<{label:string;value:string;group:string;nationalAverage?:string|null;regionalAverage?:string|null;comparisonKind?:string;referenceYear?:number}>}}>= [];
  const addFact=(year:number,fact_key:string,label:string,value:string,sourceYear:number,unit:string,category:boolean)=>{
    if(![2024,2025].includes(year)||!/^.{1,60}$/.test(label)||!/^.{1,60}$/.test(value)||/[<>\r\n]/.test(label+value))return;
    // Unified Lv.1: approved official school facts only, never raw teacher surveys.
    const required=(basicKeys.has(fact_key)||detailedKeys.has(fact_key))?1:99;
    if(required>level)return;
    let bucket=facts.find(x=>x.year===year&&x.access_level===required);
    if(!bucket){bucket={year,access_level:required,summary:{metrics:[]}};facts.push(bucket)}
    const compare=index.get([year,sourceYear,fact_key].join(':'))||{};
    const fmt=category?(v:unknown)=>presentCategory(fact_key,v):(v:unknown)=>presentNumber(v,unit);
    bucket.summary.metrics.push({
      label,value,group:'편집본 공식 학교정보',
      nationalAverage:fmt(compare.national),regionalAverage:fmt(compare.regional),
      comparisonKind:category?'mode':'average',referenceYear:sourceYear
    });
  };
  for(const fact of officialNumbers.data||[]){
    const n=Number(fact.fact_value),y=Number(fact.survey_year);
    const cap=String(fact.fact_key)==='district_housing_price_mean'?10000000000:10000000;
    if(!Number.isFinite(n)||n<0||n>cap)continue;
    const unit=typeof fact.unit==='string'&&fact.unit.length<=5?fact.unit:'';
    addFact(y,String(fact.fact_key),String(fact.label),n.toLocaleString('ko-KR',{maximumFractionDigits:2})+unit,Number(fact.source_year),unit,false);
  }
  for(const fact of officialCategories.data||[]){
    const key=String(fact.fact_key),value=String(fact.fact_value);
    if(!vettedCategories[key]?.has(value))continue;
    addFact(Number(fact.survey_year),key,String(fact.label),key==='milk_lunch'?(value==='O'?'운영':'미운영'):value,Number(fact.reference_year),'',true);
  }
  rows.push(...facts);
  for(const year of [...new Set(safe.map((m:any)=>m.year))]){
   rows.push({year,access_level:year===2026?1:2,summary:{metrics:safe.filter((m:any)=>m.year===year)}});
  }
  return send({school_id:id,level,rows},200,origin);
 }catch(err){console.error('beagu-level-api error',err instanceof Error?err.name:'Error');return send({error:'INTERNAL_ERROR'},500,origin);}
});

