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
  if(body.action!=='verify'&&body.action!=='school'&&body.action!=='logout'&&body.action!=='percentiles'&&body.action!=='offices'&&body.action!=='ranked_schools'&&body.action!=='survey_comparisons')return send({error:'UNKNOWN_ACTION'},400,origin);
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
     ids.some(id=>typeof id!=='string'||!/^[A-Z0-9]{7}$/.test(id))||
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



  if(body.action==='survey_comparisons'){
    if(Number(session.access_level)<1)return send({error:'ACCESS_DENIED'},403,origin);
    const year=Number(body.year);
    const region=typeof body.region==='string'?body.region.trim():'';
    if(![2023,2024,2025].includes(year)||!/^[가-힣A-Za-z·\s]{2,24}$/.test(region))
      return send({error:'INVALID_COMPARISON'},400,origin);
    const fields='question_id,scope,mode_option,mean_option,comparison_kind';
    const [nation,prov]=await Promise.all([
      admin.from('beagu_survey_geography_comparisons_v1').select(fields)
       .eq('survey_year',year).eq('scope','national').eq('region','').eq('review_status','SOURCE_CHECKED').limit(60),
      admin.from('beagu_survey_geography_comparisons_v1').select(fields)
       .eq('survey_year',year).eq('scope','regional').eq('region',region).eq('review_status','SOURCE_CHECKED').limit(60)
    ]);
    if(nation.error||prov.error)return send({error:'COMPARISONS_UNAVAILABLE'},503,origin);
    const items:Record<string,{national?:unknown;regional?:unknown}>={};
    for(const row of nation.data||[]){
      const k=String(row.question_id);
      if(!/^Q\d{2}$/.test(k))continue;
      items[k]={national:{mean:row.mean_option||null,mode:row.mode_option||null,kind:row.comparison_kind}};
    }
    for(const row of prov.data||[]){
      const k=String(row.question_id);
      if(!/^Q\d{2}$/.test(k))continue;
      items[k]={...(items[k]||{}),regional:{mean:row.mean_option||null,mode:row.mode_option||null,kind:row.comparison_kind}};
    }
    return send({year,region,source:'historical-source-workbook-sample',fullPopulationVerified:false,items},200,origin);
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
   const direction=typeof body.direction==='string'?body.direction:(sort==='school_name'||sort==='address'?'asc':'desc');
   const pagination=Number(body.page);
   const sorts=new Set(['school_name','address','beagu_percentile_2025','student_count','junior_teacher_ratio','male_teacher_ratio','housing_price_won']);
   if(!sorts.has(sort)||!['asc','desc'].includes(direction)||!Number.isSafeInteger(pagination)||pagination<0||pagination>500||
      searchText.length>80||region.length>24||office.length>100||
      !/^[가-힣A-Za-z·\s]*$/.test(region)||/[\x00-\x1f]/.test(searchText+office)||
      (!searchText&&!region)||(!region&&office))
      return send({error:'INVALID_SEARCH_FILTER'},400,origin);
   let query=admin.from('beagu_lv1_school_sort_index')
      .select('school_id,school_name,sido,sido_standard,support_office,address,establishment,school_kind,status,beagu_percentile_2025,student_count,student_reference_year,housing_price_won,junior_teacher_ratio,male_teacher_ratio',{count:'exact'});
   if(searchText)query=query.ilike('school_name','%'+searchText.replace(/[%_\\]/g,'')+'%');
   if(region)query=query.eq('sido_standard',region);
   if(office)query=query.eq('support_office',office);
   const from=pagination*20;
   const ascending=direction==='asc';
   let sorted=query.order(sort,{ascending,nullsFirst:false});
   // Sort all schools BEFORE pagination; school name is always the stable tie-breaker.
   if(sort!=='school_name')sorted=sorted.order('school_name',{ascending:true,nullsFirst:false});
   const {data,count,error}=await sorted
     .order('school_id',{ascending:true})
     .range(from,from+19);
   if(error)return send({error:'RANKED_SEARCH_UNAVAILABLE'},503,origin);
   return send({schools:data||[],total:count||0,page:pagination,sort,direction:ascending?'asc':'desc',nulls:'last'},200,origin);
  }

  const id=String(body.schoolId||'');
  if(!/^[A-Z0-9]{7}$/.test(id))return send({error:'INVALID_SCHOOL'},400,origin);
  const level=Number(session.access_level);
  if(level<1)return send({error:'ACCESS_DENIED'},403,origin);
  const [legacy,metrics,catalog,curated2025]=await Promise.all([
   level===2?admin.from('beagu_level_data').select('survey_year,access_level,summary,release_status').eq('school_id',id).eq('release_status','approved').lt('survey_year',2026).order('survey_year').limit(20):Promise.resolve({data:[],error:null}),
   admin.from('beagu_release_metrics_v2').select('survey_year,question_id,access_level,value,release_version,approval_status,privacy_status,identity_reviewed,question_reviewed,small_cell_reviewed,differencing_reviewed,approved_at,approved_by,approval_evidence').eq('school_id',id).eq('approval_status','APPROVED').lte('access_level',level).order('release_version',{ascending:false}).limit(1000),
   admin.from('beagu_metric_catalog').select('*').eq('verified',true).limit(1000),
   admin.from('beagu_level_data').select('survey_year,access_level,respondents,summary,release_status')
     .eq('school_id',id).eq('survey_year',2025).eq('access_level',1)
     .eq('release_status','approved').limit(1)
  ]);
  if(legacy.error||metrics.error||catalog.error||curated2025.error)return send({error:'DATA_UNAVAILABLE'},503,origin);
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
    // These are school-level facts, not meaningful nationwide/regional comparisons.
    const schoolOnly=new Set(['establishment_type','vice_principals','meal_place']).has(fact_key);
    bucket.summary.metrics.push({
      label,value,group:'편집본 공식 학교정보',
      nationalAverage:schoolOnly?null:fmt(compare.national),regionalAverage:schoolOnly?null:fmt(compare.regional),
      comparisonKind:schoolOnly?undefined:(category?'mode':'average'),referenceYear:sourceYear
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
  // Return only the reviewed most-frequently-selected option for each school
  // and question, never the option distribution, percentages, sample size, raw
  // answers, or respondent metadata. Lv.1 session verification is required.
  const {data:verifiedSchoolModes,error:modeError}=await admin
    .from('beagu_verified_school_question_distributions_v1')
    .select('survey_year,question_id,mode_option,review_policy')
    .eq('school_id',id).eq('release_status','APPROVED_AGGREGATE_ONLY')
    .in('survey_year',[2023,2024]).limit(100);
  if(modeError)return send({error:'SCHOOL_MODES_UNAVAILABLE'},503,origin);
  const modeIndex=new Map<string,{year:number,questionId:string,modeOption:string}>();
  const safeMode=(value:unknown):value is string =>
    typeof value==='string'&&value.trim().length>0&&value.length<=180&&
    !/[<>\r\n]/.test(value)&&!/@|https?:\/\/|(?:^|\D)01[016789]-?\d{3,4}-?\d{4}(?:\D|$)/i.test(value);
  for(const record of verifiedSchoolModes||[]){
    const year=Number(record.survey_year),qid=String(record.question_id||'');
    if(![2023,2024].includes(year)||!/^Q\d{2}$/.test(qid)||
       record.review_policy!=='N10_CELL3_PATTERNS5_STRICT_MATCH'||
       !safeMode(record.mode_option))continue;
    modeIndex.set(year+':'+qid,{year,questionId:qid,modeOption:record.mode_option});
  }

  // Owner-authorized 1+ historical closed-choice aggregates. Keep the
  // distributions inside the DB and return only an approved mode label.
  const {data:ownerHistory,error:ownerHistoryError}=await admin
    .from('beagu_school_question_aggregates_v2')
    .select('survey_year,questions,review_status')
    .eq('school_id',id).eq('review_status','OWNER_AUTHORIZED_CLOSED_CHOICE')
    .in('survey_year',[2023,2024,2025]).limit(3);
  if(ownerHistoryError)return send({error:'SCHOOL_HISTORY_UNAVAILABLE'},503,origin);
  for(const record of ownerHistory||[]){
    const year=Number(record.survey_year);
    if(![2023,2024,2025].includes(year)||record.review_status!=='OWNER_AUTHORIZED_CLOSED_CHOICE'||
       !Array.isArray(record.questions)||record.questions.length>50)continue;
    for(const question of record.questions){
      const qid=String(question?.questionId||'');
      const mode=question?.modeOption;
      if(!/^Q\d{2}$/.test(qid)||!safeMode(mode)||
         !Number.isInteger(question?.validRows)||question.validRows<1)continue;
      modeIndex.set(year+':'+qid,{year,questionId:qid,modeOption:mode});
    }
  }
  // A 2025 checkbox question receives a school mode only when every included
  // source choice was matched and one choice alone has the highest frequency.
  // Unverified options and ties remain excluded. Require the already reviewed
  // owner-authorized 2025 school/year as an independent release gate.
  if(ownerHistory?.some(row=>row.survey_year===2025&&
       row.review_status==='OWNER_AUTHORIZED_CLOSED_CHOICE')){
    const {data:supplement,error:supplementError}=await admin
      .from('beagu_school_question_modes_supplement_v1')
      .select('survey_year,question_id,mode_option,review_status')
      .eq('school_id',id).eq('survey_year',2025)
      .eq('review_status','SOURCE_VERIFIED_UNIQUE_MODE').limit(3);
    if(supplementError)return send({error:'SCHOOL_MODES_UNAVAILABLE'},503,origin);
    for(const row of supplement||[]){
      const qid=String(row.question_id||'');
      if(!['Q03','Q04','Q30'].includes(qid)||!safeMode(row.mode_option))continue;
      if(!modeIndex.has('2025:'+qid))
        modeIndex.set('2025:'+qid,{year:2025,questionId:qid,modeOption:row.mode_option});
    }
  }
  const schoolQuestionModes=[...modeIndex.values()].sort((a,b)=>
    a.year-b.year||a.questionId.localeCompare(b.questionId));

  // 2025 legacy public-release whitelist explicitly authorizes curated domain
  // scores for >=1 source observation. This is NOT permission to expose the
  // teacher's raw choices, free text, counts, or sensitive survey columns.
  // Owner authorization alone is not proof of every respondent's specific
  // publication consent. Review rights and reidentification risk separately.
  const approvedDomainLabels=new Set([
    '학생·학부모 문화','교직원 문화','조직운영','업무부하',
    '교직관행','체험학습 관행','복무관행','학교환경'
  ]);
  const curatedRows:(Record<string,unknown>)[]=[];
  for(const item of curated2025.data||[]){
    const r=item as Record<string,any>;
    const quality=r.summary?.quality?.release_gate_20261027;
    const release=r.summary?.public_release_v1;
    if(r.survey_year!==2025||r.access_level!==1||r.release_status!=='approved'||
       !Number.isInteger(r.respondents)||r.respondents<1||
       quality?.status!=='APPROVED_SANITIZED_LEGACY_VIEW'||
       quality?.approved_for_public_api!==true||
       quality?.public_approval_scope!=='ONLY_PUBLIC_RELEASE_V1_WHITELIST'||
       quality?.privacy_restriction!=='NO_RAW_QUESTION_VALUES_NO_FREE_TEXT_NO_PERSONAL_IDENTIFIERS'||
       !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(String(quality?.owner_authorized_on||''))||
       release?.release_format!=='DOMAIN_AGGREGATES_ONLY'||
       !Array.isArray(release.metrics))continue;
    const emitted=new Set<string>();
    const metrics=[];
    for(const source of release.metrics){
      const label=source?.label,value=source?.value;
      if(typeof label!=='string'||!approvedDomainLabels.has(label)||emitted.has(label)||
         typeof value!=='string'||!/^(?:100(?:\.0)?|[1-9]?\d(?:\.\d)?|0(?:\.0)?)점$/.test(value))continue;
      const numeric=Number(value.slice(0,-1));
      if(!Number.isFinite(numeric)||numeric<0||numeric>100)continue;
      emitted.add(label);
      metrics.push({label,value,group:'2025년 조사 영역별 점수 · 응답 표본 참고'});
    }
    if(metrics.length)curatedRows.push({year:2025,access_level:1,summary:{metrics}});
  }
  rows.push(...curatedRows);

  // A single verified participation record can mark a school-year as "participated".
  // Never return the response count, the teacher's choice, or any unrestricted metric.
  // The legacy 2023/2024 summaries do not contain verified respondent counts.
  const {data:participationRows,error:participationError}=await admin
    .from('beagu_level_data')
    .select('survey_year')
    .eq('school_id',id)
    .eq('release_status','approved')
    .eq('survey_year',2025)
    .gte('respondents',1)
    .limit(4);
  if(participationError)return send({error:'PARTICIPATION_STATUS_UNAVAILABLE'},503,origin);
  const participationYears=[...new Set((participationRows||[])
    .map((r:any)=>Number(r.survey_year)).filter((y:number)=>y===2025))];
  rows.push(...facts);
  for(const year of [...new Set(safe.map((m:any)=>m.year))]){
   rows.push({year,access_level:year===2026?1:2,summary:{metrics:safe.filter((m:any)=>m.year===year)}});
  }
  return send({school_id:id,level,rows,schoolQuestionModes,participationYears},200,origin);
 }catch(err){console.error('beagu-level-api error',err instanceof Error?err.name:'Error');return send({error:'INTERNAL_ERROR'},500,origin);}
});

