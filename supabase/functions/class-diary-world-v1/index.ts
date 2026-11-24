// 『나의 OO한 학급일지』 1단계: Lv2 인증형 학교 세계 데이터 제공 API.
// 기존 테이블·인증·집계 기능을 수정하지 않는 읽기 전용 Edge Function.
const BASE = Deno.env.get('SUPABASE_URL') || '';
const KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const ORIGINS = new Set([
  'https://baeguindex.com','https://www.baeguindex.com',
  'https://noam0127.github.io','http://localhost:8000','http://127.0.0.1:8000'
]);
const NUMERIC_KEYS = new Set([
  'admin_employees','cafeterias','classes','classrooms',
  'district_housing_price_mean','gym_spaces','junior_teacher_ratio',
  'land_area','lead_teachers','male_teacher_ratio','playground_area',
  'school_employees','september_participation_rate','students',
  'students_per_class','teacher_support_spaces','teachers','vice_principals'
]);
const CATEGORY_KEYS = new Set(['establishment_type','meal_place','milk_lunch']);
const encoder = new TextEncoder();
function headers(origin: string) {
  return {
    'Content-Type':'application/json; charset=utf-8',
    'Access-Control-Allow-Origin':ORIGINS.has(origin) ? origin : 'https://baeguindex.com',
    'Access-Control-Allow-Headers':'content-type,x-beagu-session',
    'Access-Control-Allow-Methods':'POST,OPTIONS',
    'Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff','Vary':'Origin'
  };
}
function send(result: unknown, status: number, origin: string) {
  return new Response(JSON.stringify(result),{status,headers:headers(origin)});
}
async function sha256(value: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value)));
  return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
}
async function db(table: string, query: Record<string,string>): Promise<any[]> {
  const params=new URLSearchParams(query);
  const response=await fetch(BASE+'/rest/v1/'+table+'?'+params.toString(),{
    method:'GET',
    headers:{apikey:KEY,Authorization:'Bearer '+KEY,Accept:'application/json'},
    signal:AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error('DATABASE_READ_UNAVAILABLE_'+response.status);
  const data=await response.json();
  if (!Array.isArray(data)) throw new Error('INVALID_DATABASE_RESPONSE');
  return data;
}
async function checkLevel2(req: Request) {
  const session=(req.headers.get('X-Beagu-Session')||'').trim();
  if (!/^[0-9a-f]{64}$/.test(session)) return false;
  const list=await db('beagu_level_sessions',{
    select:'access_level,expires_at',
    token_sha256:'eq.'+await sha256(session),
    limit:'1'
  });
  const found=list[0];
  return !!found && Number(found.access_level)>=2 &&
    Number.isFinite(Date.parse(found.expires_at)) &&
    Date.parse(found.expires_at)>Date.now();
}
// Annual public data must respect the shared Lv0 tier and civic hold.
async function annual2026Allowed(id:string):Promise<boolean>{
 try{
 const res=await fetch(BASE+'/rest/v1/rpc/beagu_2026_level_school_published',{method:'POST',
 headers:{apikey:KEY,Authorization:'Bearer '+KEY,'Content-Type':'application/json'},
 body:JSON.stringify({p_school_id:id,p_level:0})});
 return res.ok && (await res.json())===true;
 }catch{return false;}
}
Deno.serve(async req => {
  const origin=req.headers.get('Origin')||'';
  if (req.method==='OPTIONS') {
    if (origin&&!ORIGINS.has(origin)) return send({error:'ORIGIN_NOT_ALLOWED'},403,origin);
    return new Response(null,{status:204,headers:headers(origin)});
  }
  if (req.method!=='POST') return send({error:'METHOD_NOT_ALLOWED'},405,origin);
  if (origin&&!ORIGINS.has(origin)) return send({error:'ORIGIN_NOT_ALLOWED'},403,origin);
  if (!KEY||!BASE) return send({error:'SERVER_NOT_CONFIGURED'},503,origin);
  if (Number(req.headers.get('Content-Length')||0)>2048)
    return send({error:'BODY_TOO_LARGE'},413,origin);
  try {
    const reader=req.body?.getReader();
    if (!reader) return send({error:'INVALID_BODY'},400,origin);
    let size=0,raw='';
    const decoder=new TextDecoder();
    while (true) {
      const part=await reader.read();
      if (part.done) break;
      size+=part.value.byteLength;
      if (size>2048) {await reader.cancel();return send({error:'BODY_TOO_LARGE'},413,origin);}
      raw+=decoder.decode(part.value,{stream:true});
    }
    const body=JSON.parse(raw+decoder.decode());
    if (!body||typeof body!=='object'||Array.isArray(body)||
        typeof body.schoolId!=='string'||!/^[A-Z0-9]{7}$/.test(body.schoolId))
      return send({error:'INVALID_SCHOOL_ID'},400,origin);
    if (!(await checkLevel2(req))) return send({error:'LEVEL2_REQUIRED'},401,origin);
    const id=body.schoolId;
    const allow2026=await annual2026Allowed(id);
    const schools=await db('schools',{
      select:'school_id,school_code,school_name,sido,sido_standard,support_office,education_office,education_office_code,address,homepage,establishment,school_kind,status,source,last_synced_at',
      school_id:'eq.'+id,school_kind:'eq.초등학교',status:'eq.운영',limit:'1'
    });
    if (!schools.length) return send({error:'SCHOOL_NOT_FOUND'},404,origin);
    const [numbers,categories,annual] = await Promise.all([
      db('beagu_school_report_official_facts',{
        select:'survey_year,source_year,fact_key,label,fact_value,unit,review_status',
        school_id:'eq.'+id,review_status:'eq.APPROVED',limit:'100'
      }),
      db('beagu_school_report_official_categories',{
        select:'survey_year,reference_year,fact_key,label,fact_value,review_status',
        school_id:'eq.'+id,review_status:'eq.APPROVED',limit:'60'
      }),
      db('beagu_school_report_yearly',{
        select:'survey_year,percentile,publication_status,privacy_reviewed,manual_release_approved',
        school_id:'eq.'+id,publication_status:'eq.PUBLISHED',privacy_reviewed:'eq.true',
        limit:'8'
      })
    ]);
    const facts=numbers.filter((f:any)=>NUMERIC_KEYS.has(String(f.fact_key)) &&
      f.review_status==='APPROVED');
    const categoriesSafe=categories.filter((f:any)=>CATEGORY_KEYS.has(String(f.fact_key)) &&
      f.review_status==='APPROVED');
    const years=[...new Set(annual.filter((row:any)=>{
      const year=Number(row.survey_year),pct=Number(row.percentile);
      return Number.isInteger(year)&&year>=2023&&year<=2026&&
        row.percentile!==null&&Number.isFinite(pct)&&pct>=0&&pct<=100 &&
        row.publication_status==='PUBLISHED'&&row.privacy_reviewed===true &&
        (year!==2026 || (allow2026&&row.manual_release_approved===true));
    }).map((r:any)=>Number(r.survey_year)))].sort();
    return send({
      schemaVersion:'class-diary-world/v1',
      school:schools[0],facts,categories:categoriesSafe,publishedYears:years,
      verifiedRegionTags:[],
      note:'승인된 공식 수치 및 공개 연도만 사용. 지역 경관 태그는 지리정보 검증 전 보류.',
      fictionalPresent:'2027-03-08/2027-03-14'
    },200,origin);
  } catch(err) {
    console.error('class-diary-world-v1',String(err).slice(0,120));
    if (err instanceof SyntaxError) return send({error:'INVALID_JSON'},400,origin);
    return send({error:'DATA_UNAVAILABLE'},503,origin);
  }
});
