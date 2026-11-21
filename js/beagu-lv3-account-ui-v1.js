/* Stage 20: Lv3 display only after the Stage19 server actually verifies
 * Auth + Lv2 + exclusive original-device account linkage + short-lived token.
 * This UI NEVER authorizes 2026 survey details, search sorts, or Post-it writes.
 */
(()=>{
'use strict';
function create({client,panel,button,status,levelToken,request}){
 if(!client?.auth||!panel||!button||!status||
   typeof levelToken!=='function'||!window.BeaguLv3Session?.create)
  throw Error('LV3_ACCOUNT_UI_UNAVAILABLE');
 const session=window.BeaguLv3Session.create({client,levelToken,
  ...(request?{request}:{})});
 let eligible=false,busy=false,serial=0,lastNotified=false;
 function notify(verified){
  // Cosmetic event only. Never re-dispatch unchanged state: the header's
  // participating badge listeners also refresh account state.
  const next=verified===true&&eligible;
  if(next===lastNotified)return;
  lastNotified=next;
  window.dispatchEvent(new CustomEvent('beagu:lv3-session-verification',{
   detail:{verified:next}
  }));
 }
 function visibleState(verified){
  panel.dataset.lv3Verified=verified?'true':'false';
  if(verified){
   status.textContent='Lv3 계정 서버 인증 완료 · 임시 인증은 최대 30분이며, 자료별 서버 검증과 공개 승인이 별도로 필요합니다.';
   button.textContent='Lv3 인증 다시 확인';
  }else{
   status.textContent='Lv2 코드·원기기·정식 계정 연결이 확인되었습니다. Lv3 인증은 운영 승인 이후 서버에서만 완료됩니다.';
   button.textContent='Lv3 서버 인증 확인';
  }
  notify(verified);
 }
 function reset(){
  serial++;
  eligible=false;
  busy=false;
  session.reset();
  panel.hidden=true;
  panel.dataset.lv3Verified='false';
  button.disabled=false;
  button.textContent='Lv3 서버 인증 확인';
  status.textContent='';
  notify(false);
 }
 function setEligible(yes){
  if(yes!==true){reset();return}
  if(eligible)return;
  serial++;
  eligible=true;
  panel.hidden=false;
  visibleState(false);
 }
 async function attempt(){
  if(!eligible||busy)return false;
  const current=++serial;
  busy=true;
  button.disabled=true;
  status.textContent='서버에서 Lv3 권한을 재검증하는 중입니다.';
  notify(false);
  let success=false;
  try{
   // Fresh stage19 issuance requires TWO independent credentials, stage18
   // ownership, a current quality-approved Lv2, and release switch ON.
   success=await session.issue()===true &&
     session.getState().verified===true;
  }catch(_){success=false}
  if(current!==serial||!eligible)return false;
  busy=false;button.disabled=false;
  if(success)visibleState(true);
  else{
   session.reset();
   visibleState(false);
   status.textContent='Lv3 서버 인증이 완료되지 않았습니다. 출시 대기 중이거나 인증·추천 자격을 다시 확인해야 합니다. 현재 Lv2 권한은 별도로 유지됩니다.';
  }
  return success;
 }
 async function revalidate(){
  if(!eligible||busy||session.getState().verified!==true)return false;
  const current=++serial;
  busy=true;button.disabled=true;
  notify(false);
  status.textContent='서버에서 Lv3 권한을 다시 확인하는 중입니다.';
  let valid=false;
  try{valid=await session.verify()===true&&session.getState().verified===true}
  catch(_){valid=false}
  if(current!==serial||!eligible)return false;
  busy=false;button.disabled=false;
  visibleState(valid);
  if(!valid)status.textContent='Lv3 재검증에 실패했습니다. 임시 Lv3 표시는 해제되었으며 Lv2 인증 상태만 유지됩니다.';
  return valid;
 }
 button.addEventListener('click',()=>{
  if(session.getState().verified===true)void revalidate();
  else void attempt();
 });
 client.auth.onAuthStateChange?.(event=>{
  if(event==='SIGNED_OUT'||event==='USER_DELETED')reset();
  else if(event==='SIGNED_IN'||event==='TOKEN_REFRESHED'){
   // Existing proof is not transferable to a changed Auth JWT.
   reset();
  }
 });
 const recheck=()=>{if(!document.hidden)void revalidate()};
 window.addEventListener('focus',recheck);
 document.addEventListener('visibilitychange',recheck);
 reset();
 return Object.freeze({setEligible,reset,attempt,revalidate,
  getState:()=>Object.freeze({
   eligible,verified:eligible&&session.getState().verified===true
  })});
}
Object.defineProperty(window,'BeaguLv3AccountUI',{
 configurable:false,enumerable:false,writable:false,value:Object.freeze({create})
});
})();