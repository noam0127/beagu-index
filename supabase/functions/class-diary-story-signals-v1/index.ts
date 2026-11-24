// 『나의 OO한 학급일지』 2단계: Lv2 전용, 공개 검증된 역사적 설문 최다선택 신호만 반환.
// 원자료·응답자 수·미승인 학교 분포는 반환하지 않는다. 기존 API를 수정하지 않는다.
const BASE=Deno.env.get('SUPABASE_URL')||'';
const KEY=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
const ORIGINS=new Set([
  'https://baeguindex.com','https://www.baeguindex.com',
  'https://noam0127.github.io','http://localhost:8000','http://127.0.0.1:8000'
]);
const BLOCKED=new Set(['2023:Q06','2023:Q10','2024:Q06','2024:Q10',
  '2025:Q06','2025:Q09','2025:Q29','2025:Q30',
  '2026:Q03','2026:Q13','2026:Q31']);
const POLICY='N10_CELL3_PATTERNS5_STRICT_MATCH';
const encoder=new TextEncoder();
const safeString=(x,n)=>typeof x==='string'?x.trim().slice(0,n):'';
function headers(origin:string){
  return {
    'Content-Type':'application/json; charset=utf-8',
    'Access-Control-Allow-Origin':ORIGINS.has(origin)?origin:'https://baeguindex.com',
    'Access-Control-Allow-Headers':'content-type,x-beagu-session',
    'Access-Control-Allow-Methods':'POST,OPTIONS',
    'Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff','Vary':'Origin'
  };
}
function send(data:unknown,status:number,origin:string){
  return new Response(JSON.stringify(data),{status,headers:headers(origin)});
}
async function sha(value:string){
  const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value)));
  return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
}
async function db(table:string,query:Record<string,string>):Promise<any[]>{
  const url=BASE+'/rest/v1/'+table+'?'+new URLSearchParams(query).toString();
  const response=await fetch(url,{
    headers:{apikey:KEY,Authorization:'Bearer '+KEY,Accept:'application/json'},
    signal:AbortSignal.timeout(8000)
  });
  if(!response.ok)throw Error('READ_FAILED_'+response.status);
  const data=await response.json();
  if(!Array.isArray(data))throw Error('NOT_AN_ARRAY');
  return data;
}
async function verifiedSession(req:Request){
  const token=safeString(req.headers.get('X-Beagu-Session'),200);
  if(!/^[0-9a-f]{64}$/.test(token))return false;
  const sessions=await db('beagu_level_sessions',{
    select:'access_level,expires_at',token_sha256:'eq.'+await sha(token),limit:'1'
  });
  const s=sessions[0];
  if(!s)return false;
  const gate=await fetch(BASE+'/rest/v1/rpc/beagu_account_level_session_allowed_v1',{method:'POST',
    headers:{apikey:KEY,Authorization:'Bearer '+KEY,'Content-Type':'application/json'},
    body:JSON.stringify({p_token_sha:await sha(token)})});
  if(!gate.ok||await gate.json()!==true)return false;
  return !!s && Number(s.access_level)>=2 &&
    Number.isFinite(Date.parse(s.expires_at))&&Date.parse(s.expires_at)>Date.now();
}
async function getBody(req:Request){
  const reader=req.body?.getReader();if(!reader)throw Error('INVALID_BODY');
  const decoder=new TextDecoder();let total=0,raw='';
  while(true){
    const part=await reader.read();if(part.done)break;
    total+=part.value.byteLength;
    if(total>2048){await reader.cancel();throw Error('BODY_TOO_LARGE');}
    raw+=decoder.decode(part.value,{stream:true});
  }
  return JSON.parse(raw+decoder.decode());
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
Deno.serve(async req=>{
  const origin=req.headers.get('Origin')||'';
  if(req.method==='OPTIONS'){
    if(origin&&!ORIGINS.has(origin))return send({error:'ORIGIN_NOT_ALLOWED'},403,origin);
    return new Response(null,{status:204,headers:headers(origin)});
  }
  if(req.method!=='POST')return send({error:'METHOD_NOT_ALLOWED'},405,origin);
  if(origin&&!ORIGINS.has(origin))return send({error:'ORIGIN_NOT_ALLOWED'},403,origin);
  if(!BASE||!KEY)return send({error:'SERVER_NOT_CONFIGURED'},503,origin);
  try{
    if(Number(req.headers.get('Content-Length')||0)>2048)return send({error:'BODY_TOO_LARGE'},413,origin);
    const body=await getBody(req);
    if(!body||typeof body!=='object'||Array.isArray(body)||
       typeof body.schoolId!=='string'||!/^[A-Z0-9]{7}$/.test(body.schoolId))
      return send({error:'INVALID_SCHOOL_ID'},400,origin);
    if(!(await verifiedSession(req)))return send({error:'LEVEL2_REQUIRED'},401,origin);
    const id=body.schoolId;
    const allow2026=await annual2026Allowed(id);
    const [schools,years,rows]=await Promise.all([
      db('schools',{select:'school_id',school_id:'eq.'+id,school_kind:'eq.초등학교',status:'eq.운영',limit:'1'}),
      db('beagu_school_report_yearly',{
        select:'survey_year,percentile,publication_status,privacy_reviewed,manual_release_approved',
        school_id:'eq.'+id,publication_status:'eq.PUBLISHED',privacy_reviewed:'eq.true',limit:'8'
      }),
      db('beagu_verified_school_question_distributions_v1',{
        select:'survey_year,question_id,mode_option,valid_response_rows,release_status,review_policy',
        school_id:'eq.'+id,release_status:'eq.APPROVED_AGGREGATE_ONLY',
        valid_response_rows:'gte.10',limit:'300'
      })
    ]);
    if(!schools.length)return send({error:'SCHOOL_NOT_FOUND'},404,origin);
    const published=new Set(years.filter((y:any)=>{
      const year=Number(y.survey_year),pct=Number(y.percentile);
      return y.publication_status==='PUBLISHED'&&y.privacy_reviewed===true &&
        y.percentile!==null&&Number.isFinite(pct)&&pct>=0&&pct<=100 &&
        year>=2023&&year<=2026&&(year!==2026||(allow2026&&y.manual_release_approved===true));
    }).map((y:any)=>Number(y.survey_year)));
    const signals=[];const seen=new Set();
    for(const row of rows){
      const year=Number(row.survey_year),questionId=safeString(row.question_id,8);
      const key=year+':'+questionId;
      if(!published.has(year)||!/^Q\d{2}$/.test(questionId)||BLOCKED.has(key)||
         row.release_status!=='APPROVED_AGGREGATE_ONLY'||
         row.review_policy!==POLICY||Number(row.valid_response_rows)<10)continue;
      const modeOption=safeString(row.mode_option,200);
      if(!modeOption||seen.has(key))continue;
      seen.add(key);
      signals.push({
        schoolId:id,surveyYear:year,questionId,modeOption,
        releaseStatus:'APPROVED_AGGREGATE_ONLY',reviewPolicy:POLICY,
        annualStatus:'PUBLISHED',privacyReviewed:true,
        privacyMinRespondentsMet:true,
        manualReleaseApproved:year===2026
      });
    }
    return send({
      schemaVersion:'class-diary-signals/v1',schoolId:id,
      historicalSignals:signals,
      note:'승인된 과거 집계의 최다선택 결과만 제공. 응답 수, 응답자·원자료 및 고위험 문항 제외. 2027년 현황을 의미하지 않음.'
    },200,origin);
  }catch(err){
    if(err instanceof SyntaxError)return send({error:'INVALID_JSON'},400,origin);
    if(String(err).includes('BODY_TOO_LARGE'))return send({error:'BODY_TOO_LARGE'},413,origin);
    console.error('class-diary-story-signals-v1',String(err).slice(0,100));
    return send({error:'DATA_UNAVAILABLE'},503,origin);
  }
});