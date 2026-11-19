/* One school picker on the Class Diary setup page.
 * Read-only published-school eligibility from the existing public arcade API.
 * No private survey responses, participant identities, or credentials are read.
 */
(function(){
'use strict';
const endpoint='https://snvzwrexuqavnfvzgxqj.supabase.co/functions/v1/arcade-leaderboard';
const surveyUrl='https://forms.gle/TPyCakK6Sj2zchRy7';
const $=id=>document.getElementById(id);
const host=$('setupSchoolPicker');
if(!host)return;
const query=$('setupSchoolQuery'),results=$('setupSchoolResults');
const status=$('setupSchoolStatus'),survey=$('setupSchoolSurvey');
const recheck=$('setupSchoolRecheck');
const params=new URLSearchParams(location.search);
const demo=params.get('demo')==='1',guest=params.get('guest')==='1';
const originalSchool=params.get('schoolId')||'';
let chosenId='',chosenLabel='',searchTimer,serial=0,checking=false;
function message(value){status.textContent=value;status.hidden=!value}
function reset(){
 chosenId='';chosenLabel='';host.dataset.ready='false';host.dataset.schoolId='';
 survey.hidden=true;recheck.hidden=true;
}
function clearResults(){results.replaceChildren();results.hidden=true}
async function read(url){
 const response=await fetch(url,{method:'GET',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer'});
 if(!response.ok)throw Error('SCHOOL_SERVICE_UNAVAILABLE');
 return response.json();
}
async function checkSchool(id,label){
 const request=++serial;
 if(!/^[A-Z0-9]{7}$/.test(id))return;
 checking=true;reset();clearResults();
 chosenId=id;chosenLabel=label;host.dataset.schoolId=id;
 query.value=label;
 message('이 학교의 공개 설문 결과를 확인하고 있어요.');
 try{
  const payload=await read(endpoint+'?school_id='+encodeURIComponent(id));
  if(request!==serial)return;
  if(!payload.school||payload.school.school_id!==id)throw Error('INVALID_SCHOOL_RESPONSE');
  const school=payload.school;
  // Keep the visible choice tied to the canonical result from the server.
  const canonical=String(school.school_name||'').slice(0,70);
  const region=String(school.region||'').slice(0,35);
  if(canonical){
   chosenLabel=canonical+(region?' · '+region:'');
   query.value=chosenLabel;
  }
  const years=(Array.isArray(school.available_years)?school.available_years:[])
    .filter(year=>Number.isInteger(year)&&year>=2023&&year<=2026);
  if(school.eligible===true&&years.length){
   host.dataset.ready='true';
   message('조사 결과 확인 · '+years.join(' · ')+'년 자료 공개');
  }else{
   host.dataset.ready='false';
   message('이 학교의 공개된 배구지수 설문 결과가 없습니다. 설문에 참여해 주세요. 이미 참여한 경우에는 결과 공개 후 다시 확인할 수 있어요.');
   survey.hidden=false;
   recheck.hidden=false;
  }
 }catch(_){
  if(request===serial){
   host.dataset.ready='false';
   message('학교별 설문 결과를 확인하지 못했습니다. 연결 상태를 확인하고 다시 조회해 주세요.');
   recheck.hidden=false;
  }
 }finally{if(request===serial)checking=false}
}
function selectSchool(record){
 if(!record||!/^[A-Z0-9]{7}$/.test(String(record.school_id||'')))return;
 const name=String(record.school_name||'').slice(0,70),region=String(record.sido_standard||'').slice(0,35);
 if(!name)return;
 void checkSchool(record.school_id,name+(region?' · '+region:''));
}
async function search(text,request){
 if(text.length<2){message('학교명을 두 글자 이상 입력하세요.');return}
 message('학교 검색 중…');
 try{
  const payload=await read(endpoint+'?schools='+encodeURIComponent(text));
  if(request!==serial)return;
  const list=Array.isArray(payload.schools)?payload.schools:[];
  if(!list.length){message('검색 결과가 없습니다. 학교명을 다시 확인해 주세요.');return}
  message('학교를 선택해 주세요.');
  for(const school of list){
   const btn=document.createElement('button');
   btn.type='button';btn.className='setup-school-result';
   btn.textContent=String(school.school_name||'')+' · '+String(school.sido_standard||'');
   btn.addEventListener('click',()=>selectSchool(school));
   results.append(btn);
  }
  results.hidden=false;
 }catch(_){if(request===serial)message('학교 검색에 실패했습니다. 다시 입력해 주세요.')}
}
query.addEventListener('input',()=>{
 if(originalSchool&&!guest&&!demo)return;
 clearTimeout(searchTimer);
 ++serial;reset();clearResults();
 const value=query.value.trim();
 if(value.length<2){if(value)message('학교명을 두 글자 이상 입력하세요.');else message('학교를 먼저 선택해 주세요.');return}
 const request=serial;
 searchTimer=setTimeout(()=>void search(value,request),300);
});
survey.href=surveyUrl;
survey.target='_blank';survey.rel='noopener noreferrer';
recheck.addEventListener('click',()=>{
 if(!chosenId)return;
 void checkSchool(chosenId,chosenLabel);
});
if(demo){
 reset();host.dataset.ready='true';host.dataset.schoolId='demo';
 query.value='가상의 초등학교 · 체험판';query.readOnly=true;
 message('체험판은 실제 학교 설문자료를 사용하지 않습니다.');
}else if(originalSchool&&!guest){
 query.readOnly=true;query.value='선택한 학교 확인 중…';
 void checkSchool(originalSchool,'선택한 학교');
}else{
 reset();message('학교를 검색하고 하나를 선택해 주세요.');
}
window.BeaguClassDiarySchoolPicker=Object.freeze({
 ready(){return host.dataset.ready==='true'&&!checking},
 schoolId(){return host.dataset.schoolId||''},
 focus(){query.focus();message('먼저 공개 설문 결과가 있는 학교를 선택해 주세요.')}
});
})();