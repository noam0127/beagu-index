import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.58.0';
const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
const origins=new Set(['https://baeguindex.com','https://www.baeguindex.com','https://noam0127.github.io','http://localhost:8000','http://127.0.0.1:8000']);
function headers(origin:string){return {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Access-Control-Allow-Origin':origins.has(origin)?origin:'https://baeguindex.com','Access-Control-Allow-Headers':'content-type,x-beagu-session','Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin'};}
function send(origin:string,payload:unknown,status=200){return new Response(JSON.stringify(payload),{status,headers:headers(origin)});}
async function sha256(value:string){const bytes=new TextEncoder().encode(value);return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');}
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get('origin')||'';
 if(origin&&!origins.has(origin))return send(origin,{error:'ORIGIN_NOT_ALLOWED'},403);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:headers(origin)});
 if(req.method!=='POST')return send(origin,{error:'METHOD_NOT_ALLOWED'},405);
 try{
  const raw=req.headers.get('x-beagu-session')||'';
  if(!/^[a-f0-9]{64}$/.test(raw))return send(origin,{error:'AUTH_REQUIRED'},401);
  const {data:session,error:sErr}=await admin.from('beagu_level_sessions')
   .select('access_level,expires_at').eq('token_sha256',await sha256(raw)).maybeSingle();
  if(sErr||!session||Number(session.access_level)<2||(!Number.isFinite(Date.parse(session.expires_at))||Date.parse(session.expires_at)<=Date.now()))return send(origin,{error:'AUTH_REQUIRED'},401);
  const reader=req.body?.getReader();if(!reader)return send(origin,{error:'INVALID_REQUEST'},400);
  let len=0,text='';const decoder=new TextDecoder();
  while(true){const {value,done}=await reader.read();if(done)break;len+=value.byteLength;if(len>1024){await reader.cancel();return send(origin,{error:'TOO_LARGE'},413)}text+=decoder.decode(value,{stream:true})}
  text+=decoder.decode();let body;
  try{body=JSON.parse(text)}catch{return send(origin,{error:'INVALID_JSON'},400)}
  const id=typeof body?.schoolId==='string'?body.schoolId:'';
  if(body?.action!=='school'||!/^\d{7}$/.test(id))return send(origin,{error:'INVALID_SCOPE'},400);
  const {data:items,error}=await admin.from('beagu_level_data')
   .select('survey_year,access_level,respondents,summary')
   .eq('school_id',id).eq('release_status','approved').in('access_level',[1,2])
   .order('survey_year',{ascending:false}).order('access_level',{ascending:true}).limit(20);
  if(error)return send(origin,{error:'DATA_UNAVAILABLE'},503);
  const records=items||[];
  const s=await admin.from('schools').select('school_name,sido_standard,support_office,address').eq('school_id',id).maybeSingle();
  if(s.error)return send(origin,{error:'SCHOOL_UNAVAILABLE'},503);
  const o=s.data||{};
  const val=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)?Math.round(v*100)/100:
    typeof v==='string'&&v.length<=90&&!/[<>\n\r]/.test(v)?v:null;
  const paths=(parent:any,keys:string[])=>keys.reduce((v,k)=>v&&typeof v==='object'?v[k]:undefined,parent);
  const visible=[];
  for(const row of records.filter(x=>[2023,2024,2025].includes(x.survey_year)&&x.access_level===2)){
   const lv1=records.find(x=>x.survey_year===row.survey_year&&x.access_level===1);
   if(!lv1||!lv1.summary?.public_release_v1||!row.summary?.public_release_v1)continue;
   const n=lv1.respondents===null?null:Number(lv1.respondents);
   if(row.survey_year===2025&&(!Number.isInteger(n)||n<1))continue;
   const prof=lv1.summary.school_profile||{};
   const vals:Record<string,unknown>={};
   const safeSet=(key:string,v:unknown)=>{const x=val(v);if(x!==null)vals[key]=x};
   safeSet('A',o.sido_standard);safeSet('B',o.support_office);safeSet('C',o.school_name);
   if(row.survey_year===2023){
    const p23=lv1.summary?.historical_values?.percentile;
    if(typeof p23==='number'&&Number.isFinite(p23)&&p23>=0&&p23<=100)safeSet('F',p23.toFixed(2)+'%');
    visible.push({year:2023,values:vals,
      release_note:'2023년 전국 백분율 등 승인된 학교 통계만 공개합니다. 개별 문항은 제공하지 않습니다.'});
    continue;
   }
   if(row.survey_year===2024){
    const h=row.summary?.historical_values||{};
    safeSet('E',h.establishment);safeSet('G',o.address);
    safeSet('N',h.teachers_2024);safeSet('AI',h.students_2024);
    const p24=lv1.summary?.historical_values?.percentile;
    if(typeof p24==='number'&&Number.isFinite(p24)&&p24>=0&&p24<=100)safeSet('BN',p24.toFixed(2)+'%');
    visible.push({year:2024,values:vals,
      release_note:'2024년 백분위와 학교 기본정보만 공개. 개별 민감 문항은 제외되었습니다.'});
    continue;
   }
   safeSet('D',prof.establishment);safeSet('F',o.address);
   const fields:[string,string[]][]=[
    ['G',['facilities','land_m2']],['H',['facilities','playground_m2']],
    ['I',['facilities','classrooms']],['J',['facilities','gym_spaces']],
    ['K',['facilities','cafeterias']],['L',['facilities','teacher_support_spaces']],
    ['M',['facilities','teacher_support_ratio']],['N',['facilities','meal_place']],
    ['O',['facilities','milk_lunch']],['P',['school_size','students']],
    ['R',['school_size','vice_principals']],['S',['school_size','lead_teachers']],
    ['T',['school_size','teachers']]
   ];
   for(const [column,path] of fields)safeSet(column,paths(prof,path));
   const overview=lv1.summary.survey_summary||{};
   safeSet('AC',overview.school_satisfaction);
   for(const [column,key] of [
    ['AE','student_parent'],['AI','staff'],['AM','governance'],['AQ','workload'],
    ['AU','practices'],['AY','field_trip'],['BC','leave'],['BG','environment']
   ])safeSet(column,overview.domains?.[key]);
   visible.push({year:2025,values:vals,
    release_note:'공식 학교정보와 영역별 요약만 표시. 개별 문항·자유서술·민감정보 제외'});
  }
  return send(origin,{school_id:id,level:2,rows:visible});

 }catch(e){console.error('Lv2 details:',e instanceof Error?e.name:'unknown');return send(origin,{error:'INTERNAL_ERROR'},500)}
});
