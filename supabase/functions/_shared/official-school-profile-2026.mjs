// Only independently public Schoolinfo fields. Never survey-derived values.
// A verified Lv.1 or Lv.2 server session is required before this projection is emitted.
const TEXT_KEYS=Object.freeze(['school_name','education_office','support_office','region','establishment','branch_school','closed','suspended','road_address','address_detail','homepage','opening_anniversary','established_date','school_characteristic','establishment_type','school_phone','school_fax','coeducation','legal_dong_code','latitude','longitude']);
const COUNT_KEYS=Object.freeze(['teacher_total','male_teachers','female_teachers','teachers_on_leave','principals','vice_principals','lead_teachers','general_teachers','fixed_term_teachers','first_grade_teachers','second_grade_teachers']);
const textValue=v=>typeof v==='string'&&v.length>0&&v.length<=1500&&!/[<>\u0000-\u001f]/.test(v)?v:null;
const count=v=>Number.isInteger(v)&&v>=0&&v<=10000?v:null;
// Separate certified denominator from the full-staff position totals. Source is
// the school-level qualification-by-sex file, cross-checked by disclosure code.
function certifiedCounts(p,verified,t,m,f){
 const c=p.elementary_certified_counts;
 if(!verified||!c||c.source_year!==2026||c.basis!=='REPORTED_1_2_ASSOCIATE')return null;
 const groups=['first','second','associate'];
 for(const k of groups){
  const a=count(c[k+'_male']),b=count(c[k+'_female']),n=count(c[k+'_total']);
  if(a===null||b===null||n===null||a+b!==n)return null;
 }
 const total=groups.reduce((s,k)=>s+c[k+'_total'],0);
 const male=groups.reduce((s,k)=>s+c[k+'_male'],0);
 if(total<=0||total>t||male>m||total-male>f)return null;
 return {total,male,second:c.second_total};
}
export function projectOfficialProfiles2026(rows,ids,tier){
 if(![1,2].includes(Number(tier)))return null;
 const allowed=new Set(Array.isArray(ids)?ids.filter(id=>typeof id==='string'&&/^[A-Z0-9]{7}$/.test(id)):[]);
 const output=Object.create(null);
 for(const row of Array.isArray(rows)?rows:[]){
  if(!row||!allowed.has(row.school_id)||row.source_year!==2026||
    !/^S[0-9]{9}$/.test(String(row.disclosure_code||''))||
    !row.profile||typeof row.profile!=='object'||Array.isArray(row.profile))continue;
  const p=row.profile;
  if(p.closed!=='N'||p.suspended!=='N'||!textValue(p.school_name))continue;
  const safe={source_year:2026,disclosure_code:row.disclosure_code};
  for(const k of TEXT_KEYS)safe[k]=textValue(p[k]);
  const t=count(p.teacher_total),m=count(p.male_teachers),f=count(p.female_teachers);
  const verified=t!==null&&t===count(row.teacher_total)&&m!==null&&f!==null&&m+f===t;
  for(const k of COUNT_KEYS)safe[k]=verified?count(p[k]):null;
  safe.teacher_source_status=verified?'MATCHED':'MISSING';
  safe.student_count=Number.isSafeInteger(p.student_count)&&p.student_count>=0&&p.student_count<=100000&&p.student_reference_year===2026?p.student_count:null;
  safe.ratio_basis=verified&&p.ratio_basis==='ELEMENTARY_TEACHER_CERTIFIED'?'ELEMENTARY_TEACHER_CERTIFIED':null;
  if(verified&&t>0){
   safe.male_teacher_ratio=Math.round(m*10000/t)/100;
   const second=safe.second_grade_teachers;
   safe.second_grade_teacher_ratio=second!==null&&second<=t?Math.round(second*10000/t)/100:null;
  }else{
   safe.male_teacher_ratio=null;
   safe.second_grade_teacher_ratio=null;
  }
  const qualified=certifiedCounts(p,verified,t,m,f);
  if(Object.hasOwn(p,'elementary_certified_counts')){
   safe.ratio_basis=qualified?'ELEMENTARY_TEACHER_CERTIFIED':null;
   safe.male_teacher_ratio=qualified?Math.round(qualified.male*10000/qualified.total)/100:null;
   safe.second_grade_teacher_ratio=qualified?Math.round(qualified.second*10000/qualified.total)/100:null;
  }
  safe.certified_teacher_total=qualified?qualified.total:
   (!Object.hasOwn(p,'elementary_certified_counts')&&safe.ratio_basis==='ELEMENTARY_TEACHER_CERTIFIED'?t:null);
  output[row.school_id]=safe;
 }
 return output;
}

// Anonymous projection: only four independently public, verified school facts.
export function projectPublicSchoolBasics2026(rows,ids){
 const base=projectOfficialProfiles2026(rows,ids,1);
 const out=Object.create(null);
 for(const row of Array.isArray(rows)?rows:[]){
  if(!base[row.school_id])continue;
  const p=row.profile;
  const students=Number.isSafeInteger(p.student_count)&&p.student_count>=0&&p.student_count<=100000&&p.student_reference_year===2026?p.student_count:null;
  const certified=base[row.school_id].ratio_basis==='ELEMENTARY_TEACHER_CERTIFIED'&&base[row.school_id].teacher_source_status==='MATCHED';
  out[row.school_id]={source_year:2026,student_count:students,teacher_total:certified?base[row.school_id].certified_teacher_total:null,male_teacher_ratio:certified?base[row.school_id].male_teacher_ratio:null,second_grade_teacher_ratio:certified?base[row.school_id].second_grade_teacher_ratio:null};
 }
 return out;
}
