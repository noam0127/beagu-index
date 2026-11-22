/* 『나의 OO한 학급일지』 상세조회 자료 기반 세계 묘사.
 * 공개 승인된 학교정보만 창작의 배경으로 사용한다. 비공개 설문응답, 개인
 * 성별·자격 추론, 실제 갈등·업무부담 단정에 이용하지 않는다.
 */
(function(root){
'use strict';
const VERSION='class-diary-context/v1';
const COUNTS=Object.freeze({
  students:'학생 수',teachers:'교원 수',classes:'학급 수',
  classrooms:'교실 수',admin_employees:'행정직원 수',
  school_employees:'학교 직원 수',vice_principals:'교감 수',
  lead_teachers:'수석교사 수',cafeterias:'급식시설 수',
  gym_spaces:'체육 공간 수',teacher_support_spaces:'교사 지원 공간 수'
});
const RATIOS=Object.freeze({
  junior_teacher_ratio:'2급 정교사 비율',
  male_teacher_ratio:'남교사 비율'
});
const AREA=Object.freeze({playground_area:'운동장 면적'});
const ACCEPTED=Object.freeze({
  1:['students','teachers','junior_teacher_ratio'],
  2:['admin_employees','school_employees','vice_principals','lead_teachers'],
  3:['classes','classrooms','students_per_class','cafeterias','meal_place'],
  4:['teacher_support_spaces'],
  5:['gym_spaces','playground_area'],
  6:['district_housing_price_mean'],
  7:['male_teacher_ratio','junior_teacher_ratio']
});
const NARRATION=Object.freeze({
  1:'공개된 학생·교원 수를 떠올려도 이 학교의 하루가 어떤지는 아직 알 수 없었다. 나는 먼저 학년연구실에서 사람들의 말을 듣기로 했다.',
  2:'행정직원이나 관리자의 수만으로 우리 학교의 업무분장 문화까지 알 수는 없었다. 중요한 건 오늘 회의에서 각자 말할 기회가 있는가였다.',
  3:'학급 수나 교실의 넓이가 아이들의 의견을 대신 결정해 주지는 않는다. 줄서기 규칙은 이 반에서 살아가는 아이들의 문제였다.',
  4:'학교에 어떤 지원 공간이 있는지는 알아둘 만하다. 하지만 보호자 연락을 혼자 떠맡을지, 동료와 협의할지는 또 다른 문제였다.',
  5:'학교에 운동장과 체육 공간이 있어도 그곳에서 일하는 선생님들이 모두 같은 속도로 퇴근하는 것은 아니었다.',
  6:'동네의 주거 지표가 그곳에 사는 사람의 성격을 말해 주지는 않는다. 토요일에는 그저 길을 걸으며 쉬고 싶었다.',
  7:'교원 구성의 비율은 누군가의 능력이나 성품을 말해 주지 않는다. 이 일주일을 채운 것은 이름 없는 평균이 아니라 내가 직접 고른 말과 행동이었다.'
});
function validYear(y){return Number.isInteger(y)&&y>=2000&&y<=2027;}
function approvedNumber(entry,ratio){
 if(!entry||entry.status!=='APPROVED'||!validYear(entry.referenceYear)||
    typeof entry.value!=='number'||!Number.isFinite(entry.value)||entry.value<0)return null;
 if(ratio&&entry.value>100)return null;
 return entry;
}
function formatNumber(n){return n.toLocaleString('ko-KR',{maximumFractionDigits:2});}
function record(key,entry){
 const isRatio=Object.prototype.hasOwnProperty.call(RATIOS,key);
 const r=approvedNumber(entry,isRatio);
 if(!r)return null;
 let label='',value='';
 if(Object.prototype.hasOwnProperty.call(COUNTS,key)){
   if(!Number.isInteger(r.value))return null;
   label=COUNTS[key];value=formatNumber(r.value)+(key==='gym_spaces'||key==='teacher_support_spaces'?'곳':key==='classes'?'학급':key==='classrooms'?'실':'명');
 }else if(isRatio){
   label=RATIOS[key];value=formatNumber(r.value)+'%';
 }else if(key==='students_per_class'){
   label='학급당 학생 수';value=formatNumber(r.value)+'명';
 }else if(key==='playground_area'){
   label=AREA[key];
   const unit=typeof r.unit==='string'?r.unit.trim():'';
   if(!['㎡','m2','m²'].includes(unit))return null;
   value=formatNumber(r.value)+'㎡';
 }else if(key==='district_housing_price_mean'){
   label='지역 공동주택 평균 공시가격';
   const unit=typeof r.unit==='string'?r.unit.trim():'';
   if(!['원','만원','천원'].includes(unit))return null;
   value=formatNumber(r.value)+unit;
 }else return null;
 return {key,label,value,referenceYear:r.referenceYear,source:'approved_official_fact'};
}
function categoryMeal(entry){
 if(!entry||entry.status!=='APPROVED'||!validYear(entry.referenceYear)||
    typeof entry.value!=='string')return null;
 const value=entry.value.trim();
 if(!value||value.length>36||/[\u0000-\u001f<>]/.test(value))return null;
 return {key:'meal_place',label:'급식 장소',value,
   referenceYear:entry.referenceYear,source:'approved_official_category'};
}
function approvedGeography(world){
 const tags=world&&world.geography&&world.geography.tags;
 if(!Array.isArray(tags))return null;
 const pick=tags.find(t=>t&&t.source==='official_address'&&
  ['admin_eup','admin_myeon','admin_dong'].includes(t.id));
 return pick?{key:'administrative_place',label:'주소상 행정구역',
  value:pick.label,referenceYear:null,source:'approved_official_address'}:null;
}
function forDay(world,day){
 if(!Number.isInteger(day)||day<1||day>7)throw Error('INVALID_STORY_DAY');
 if(!world||world.mode==='public_fiction_demo'||world.sourceIsFiction===true||
    world.eligible!==true||!Array.isArray(world.publishedYears)||!world.publishedYears.length)
  return {facts:[],passage:null,source:'fiction_only'};
 const keys=ACCEPTED[day],facts=[];
 for(const key of keys){
  let result=null;
  if(key==='meal_place')result=categoryMeal(world.categories&&world.categories.meal_place);
  else result=record(key,world.numbers&&world.numbers[key]);
  if(result)facts.push(result);
 }
 if(day===6){
  const location=approvedGeography(world);
  if(location)facts.unshift(location);
 }
 return {facts,passage:facts.length?NARRATION[day]:null,
   source:facts.length?'approved_school_context':'fiction_only'};
}
const api=Object.freeze({VERSION,ACCEPTED,forDay});
if(typeof module==='object'&&module.exports)module.exports=api;
root.BeaguClassDiaryContext=api;
})(typeof window!=='undefined'?window:globalThis);
