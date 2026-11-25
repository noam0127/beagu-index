// Only independently public Schoolinfo fields. Never survey-derived values.
// A verified Lv.1 or Lv.2 server session is required before this projection is emitted.
const TEXT_KEYS=Object.freeze(['school_name','education_office','support_office','region','establishment','branch_school','closed','suspended','road_address','address_detail','homepage','opening_anniversary','established_date','school_characteristic','establishment_type','school_phone','school_fax','coeducation','legal_dong_code','latitude','longitude']);
const COUNT_KEYS=Object.freeze(['teacher_total','male_teachers','female_teachers','teachers_on_leave','principals','vice_principals','lead_teachers','general_teachers','fixed_term_teachers','first_grade_teachers','second_grade_teachers']);
const textValue=v=>typeof v==='string'&&v.length>0&&v.length<=1500&&!/[<>\u0000-\u001f]/.test(v)?v:null;
const count=v=>Number.isInteger(v)&&v>=0&&v<=10000?v:null;
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
  if(verified&&t>0){
   safe.male_teacher_ratio=Math.round(m*10000/t)/100;
   const second=safe.second_grade_teachers;
   safe.second_grade_teacher_ratio=second!==null&&second<=t?Math.round(second*10000/t)/100:null;
  }else{
   safe.male_teacher_ratio=null;
   safe.second_grade_teacher_ratio=null;
  }
  output[row.school_id]=safe;
 }
 return output;
}
