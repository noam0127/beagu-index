/* Home entry for the original fictional Class Diary.
 * Existing 2026 challenge codes are verified server-side, once, on the home page.
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
  const code=input.value.trim().toUpperCase();
  if(!/^[A-Z0-9-]{10,29}$/.test(code)){
   message.textContent='고유번호를 다시 확인해 주세요.';input.focus();return;
  }
  busy=true;button.disabled=true;message.textContent='발급 기록을 확인하는 중…';
  try{
   const response=await fetch(endpoint,{
    method:'POST',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({action:'verify-code',code})
   });
   if(response.status===429){message.textContent='요청이 많습니다. 잠시 후 다시 시도해 주세요.';return}
   if(!response.ok){message.textContent=response.status===401?'발급 기록에서 확인되지 않은 고유번호예요.':'연결 상태를 확인한 후 다시 시도해 주세요.';return}
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
