/* Home entry for the original fictional Class Diary.
 * Temporary developer preview PIN is verified server-side; no public challenge codes.
 * Session storage holds only a 10-minute game-scoped handoff ticket (not a code,
 * level, choice, profile, score or progress), deleted when the game consumes it.
 */
(function(){
 'use strict';
 const form=document.getElementById('homeDiaryGuestForm');
 if(!form)return;
 const input=document.getElementById('homeDiaryCode');
 const button=document.getElementById('homeDiarySubmit');
 const message=document.getElementById('homeDiaryMessage');
 const KEY='beagu-class-diary-guest-handoff-v1';
 const endpoint='https://snvzwrexuqavnfvzgxqj.supabase.co/functions/v1/class-diary-guest-access-v1';
 let busy=false;
 form.addEventListener('submit',async function(event){
  event.preventDefault();
  if(busy)return;
  const code=input.value.trim();
  if(!/^[0-9]{4}$/.test(code)){
   message.textContent='테스트 입장 코드 4자리를 입력해 주세요.';input.focus();return;
  }
  busy=true;button.disabled=true;message.textContent='테스트 입장 권한을 확인하는 중…';
  try{
   const response=await fetch(endpoint,{
    method:'POST',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({action:'verify-code',code})
   });
   if(response.status===429){message.textContent='요청이 많습니다. 잠시 후 다시 시도해 주세요.';return}
   if(!response.ok){message.textContent=response.status===401?'현재 준비 중입니다. 올바른 테스트 코드가 필요합니다.':'연결 상태를 확인한 후 다시 시도해 주세요.';return}
   const result=await response.json();
   if(result.ok!==true||result.scope!=='class-diary-fictional-guest'||
      typeof result.ticket!=='string'||!/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(result.ticket))
    throw Error('INVALID_GUEST_TICKET');
   // Never put credentials/tickets in a URL. Only a short-lived handoff, consumed on arrival.
   sessionStorage.setItem(KEY,result.ticket);
   input.value='';
   location.assign('teacher-class-diary-play.html?guest=1');
  }catch(_){
   message.textContent='연결하지 못했습니다. 브라우저의 사이트 데이터 설정을 확인해 주세요.';
  }finally{busy=false;button.disabled=false}
 });
})();

/* Lv.2 beta entrance - separate from the original developer-only PIN form. */
(function(){
 'use strict';
 const $=id=>document.getElementById(id);
 const form=$('homeDiaryLv2Form');
 if(!form)return;
 const input=$('homeDiaryLv2Code'),button=$('homeDiaryLv2Submit'),feedback=$('homeDiaryLv2Message');
 const modal=$('homeDiarySchoolDialog'),open=$('homeDiarySchoolOpen');
 const close=$('homeDiarySchoolClose'),picked=$('homeDiarySchoolPicked');
 const SESSION='beagu-level-session-v1';
 const HANDOFF='beagu-class-diary-guest-handoff-v1';
 const API='https://snvzwrexuqavnfvzgxqj.supabase.co/functions/v1/';
 let school=null,picker=null,busy=false;
 function openSchool(){
  if(!window.ArcadeSchoolPicker){feedback.textContent='학교 검색 도구를 불러오지 못했습니다. 다시 접속해 주세요.';return}
  if(!picker){
   picker=new window.ArcadeSchoolPicker('#homeDiarySchoolPicker');
   picker.onChange=value=>{
    school=value&&value.eligible===true&&/^[A-Z0-9]{7}$/.test(String(value.school_id||''))?value:null;
    if(school){
     picked.textContent=school.school_name+' · '+String(school.region||'');
     open.textContent='🏫 학교 변경하기';
     modal.hidden=true;open.focus();
    }else if(value){
     picked.textContent='공개된 조사 자료가 없는 학교입니다. 다른 학교를 골라 주세요.';
    }else picked.textContent='';
   };
  }
  modal.hidden=false;
  picker.focus();
 }
 open.addEventListener('click',openSchool);
 function closeSchool(){modal.hidden=true;open.focus()}
 close.addEventListener('click',closeSchool);
 modal.addEventListener('click',e=>{if(e.target===modal)closeSchool()});
 modal.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();closeSchool()}});
 async function api(route,body,session){
  const response=await fetch(API+route,{
   method:'POST',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',
   headers:{'Content-Type':'application/json',...(session?{'X-Beagu-Session':session}:{})},
   body:JSON.stringify(body)
  });
  const data=await response.json().catch(()=>({}));
  return {response,data};
 }
 async function verifyLv2(raw){
  if(raw){
   const {response,data}=await api('beagu-level-api',{action:'login',code:raw});
   if(!response.ok||Number(data.level)<2||!/^[a-f0-9]{64}$/.test(String(data.token||'')))
    throw Error(response.status===429?'RATE_LIMITED':'LEVEL_2_REQUIRED');
   sessionStorage.setItem(SESSION,data.token);
   window.dispatchEvent(new Event('beagu:level-state-change'));
   return data.token;
  }
  let session='';
  try{session=sessionStorage.getItem(SESSION)||''}catch(_){}
  if(!/^[a-f0-9]{64}$/.test(session))throw Error('LEVEL_2_REQUIRED');
  const {response,data}=await api('beagu-level-api',{action:'verify'},session);
  if(!response.ok||Number(data.level)<2)throw Error('LEVEL_2_REQUIRED');
  return session;
 }
 form.addEventListener('submit',async event=>{
  event.preventDefault();
  if(busy)return;
  if(!school){feedback.textContent='학교 선택하기 버튼으로 학교를 먼저 선택해 주세요.';openSchool();return}
  busy=true;button.disabled=true;
  feedback.textContent='선택한 학교와 Lv.2 권한을 확인하고 있습니다…';
  try{
   const session=await verifyLv2(input.value.trim());
   const {response,data}=await api('class-diary-guest-access-v1',
     {action:'verify-lv2',schoolId:school.school_id},session);
   if(!response.ok||data.ok!==true||data.scope!=='class-diary-fictional-guest'||
      typeof data.ticket!=='string'||!/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(data.ticket))
    throw Error(response.status===403?'LEVEL_2_REQUIRED':'ENTRY_UNAVAILABLE');
   sessionStorage.setItem(HANDOFF,data.ticket);
   input.value='';
   location.assign('teacher-class-diary-play.html?guest=1');
  }catch(error){
   feedback.textContent=error.message==='RATE_LIMITED'?'인증 요청이 많습니다. 잠시 후 다시 시도해 주세요.':
    error.message==='LEVEL_2_REQUIRED'?'Lv.2 인증이 필요합니다. 챌린지에서 참여코드를 확인해 주세요.':
    '입장 조건을 확인하지 못했습니다. 학교와 인증 상태를 다시 확인해 주세요.';
  }finally{busy=false;button.disabled=false}
 });
})();
