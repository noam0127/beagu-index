/* Public school context for the fictional prologue only.
 * The school selection and world input must already be verified elsewhere.
 * Unknown or unapproved values are omitted; no network calls or storage.
 */
(function(root){
 'use strict';
 const VERSION='class-diary-school-brief/v1';
 const copyText=(value,max)=>typeof value==='string'?value.trim().slice(0,max):'';
 const own=(obj,key)=>Object.prototype.hasOwnProperty.call(obj||{},key);
 function verifiedFact(numbers,key,label,unit){
  const fact=numbers&&numbers[key];
  if(!fact||fact.status!=='APPROVED'||!Number.isInteger(fact.referenceYear)||fact.referenceYear<2000||fact.referenceYear>2026||
   !Number.isFinite(fact.value)||fact.value<0||fact.value>1000000)return null;
  // World builder has already accepted only approved and nonconflicting data.
  return Object.freeze({label,value:fact.value.toLocaleString('ko-KR')+unit,year:fact.referenceYear});
 }
 function summarize(selection,world){
  if(!selection||!selection.id||!copyText(selection.name,80))throw Error('VERIFIED_SCHOOL_SELECTION_REQUIRED');
  const name=copyText(selection.name,80);
  const region=copyText(selection.region,60);
  const years=Array.isArray(selection.years)?
   [...new Set(selection.years.filter(y=>Number.isInteger(y)&&y>=2023&&y<=2026))].sort((a,b)=>a-b):[];
  const matched=world&&world.eligible===true&&world.basic&&world.basic.id===selection.id&&
   world.basic.name===name;
  const school=matched?world.basic:null;
  const facts=[Object.freeze({label:'학교명',value:name}),region&&Object.freeze({label:'지역',value:region}),
   years.length&&Object.freeze({label:'공개 조사연도',value:years.join('·')+'년'})].filter(Boolean);
  if(matched){
   const office=copyText(school.office,90);
   if(office)facts.push(Object.freeze({label:'교육지원청',value:office}));
   const address=copyText(school.address,170);
   if(address)facts.push(Object.freeze({label:'학교 소재지',value:address}));
   for(const key of ['students','teachers','classes']){
    const labels={students:['학생 수','명'],teachers:['교원 수','명'],classes:['학급 수','학급']};
    const item=verifiedFact(world.numbers,key,...labels[key]);
    if(item)facts.push(item);
   }
  }
  return Object.freeze({name,region,years:Object.freeze(years),verified:!!matched,
   facts:Object.freeze(facts),sourceNote:'학교명·지역·공개 조사연도는 선택한 학교의 공개 정보입니다. 학생·교원·학급 수는 확인된 기준연도가 있을 때만 표시합니다. 2027년의 등장인물과 사건은 전부 허구입니다.'});
 }
 function validate(){const demo=summarize({id:'TEST001',name:'가상의 초등학교',region:'가상 지역',years:[2025,2026]},null);
  if(demo.verified||demo.facts.length!==3)throw Error('UNVERIFIED_FACT_LEAK');
  return {version:VERSION,verifiedOnly:true};}
 const api=Object.freeze({VERSION,summarize,validate});
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.BeaguClassDiarySchoolBrief=api;
})(typeof window!=='undefined'?window:globalThis);
