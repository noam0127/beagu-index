/* Private account status and self-service access / deletion requests.
 * Deletion is NEVER performed from a browser. The endpoint only queues a
 * request for separately audited review of related records and retention.
 */
(()=>{
"use strict";
function create({client,panel,summary,status,requestAccess,cancelAccess,
  requestDeletion,cancelDeletion,confirmEmail,confirmPhrase}){
 const controls=[panel,summary,status,requestAccess,cancelAccess,
  requestDeletion,cancelDeletion,confirmEmail,confirmPhrase];
 if(!client||!controls.every(Boolean))throw Error("PRIVACY_UI_MISSING");
 let serial=0,busy=false,identity=null,knownEmail="";
 const states={access:null,deletion:null};
 function say(value){status.textContent=value}
 function reset(){
  serial++;
  identity=null;knownEmail="";
  panel.hidden=true;
  summary.textContent="";
  status.textContent="";
  confirmEmail.value="";
  confirmPhrase.value="";
  states.access=null;states.deletion=null;
  for(const button of [requestAccess,cancelAccess,requestDeletion,cancelDeletion])
   button.disabled=false;
  cancelAccess.hidden=true;cancelDeletion.hidden=true;
 }
 async function api(action,payload={}){
  if(typeof client.functions?.invoke!=="function")throw Error("UNAVAILABLE");
  const {data,error}=await client.functions.invoke("beagu-member-privacy-api-v1",{
    body:{action,...payload}
  });
  if(error||data?.ok!==true)throw Error("UNAVAILABLE");
  return data;
 }
 function buttons(){
  cancelAccess.hidden=states.access!=="pending";
  cancelDeletion.hidden=states.deletion!=="pending";
  requestAccess.hidden=states.access==="pending"||states.access==="processing";
  requestDeletion.hidden=states.deletion==="pending"||states.deletion==="processing";
 }
 async function load(){
  if(!identity)return;
  const n=++serial;
  say("본인 계정정보를 확인하고 있습니다.");
  try{
   const result=await api("status");
   if(n!==serial||!identity)return;
   const profile=result.profile||{};
   knownEmail=String(profile.email||"").toLowerCase();
   const date=value=>{
    const d=new Date(value||0);
    return value&&!Number.isNaN(d.valueOf())?
      d.toLocaleDateString("ko-KR",{timeZone:"Asia/Seoul"}):"기록 없음";
   };
   summary.textContent="등록 이메일: "+(profile.email||"기록 없음")+
    " · 가입: "+date(profile.createdAt)+
    " · 최근 로그인: "+date(profile.lastSignInAt)+
    " · 문자 수신: "+(result.sms?.consented===true?"동의 중":"미동의/철회");
   states.access=result.requests?.access?.status||null;
   states.deletion=result.requests?.deletion?.status||null;
   buttons();
   say(states.deletion==="pending"
    ?"탈퇴 요청이 접수돼 검토 대기 중입니다. 계정은 아직 삭제되지 않았습니다."
    :states.deletion==="processing"
    ?"탈퇴 요청을 검토 중입니다. 이 화면에서 취소할 수 없습니다."
    :"개인정보 열람을 요청하거나 계정 탈퇴 검토를 요청할 수 있습니다. 탈퇴 요청만으로 계정이 삭제되지 않습니다.");
  }catch(_){
   if(n===serial&&identity){
    summary.textContent="";
    requestDeletion.hidden=true;requestAccess.hidden=true;
    cancelDeletion.hidden=true;cancelAccess.hidden=true;
    say("개인정보 처리 상태를 확인할 수 없습니다. 요청을 진행하지 않고 다시 접속해 주세요.");
   }
  }
 }
 async function showFor(person){
  if(!person?.user?.email_confirmed_at||!person?.token||person.user.is_anonymous){
   reset();return;
  }
  const same=identity?.id===person.user.id&&identity?.token===person.token;
  if(same&&!panel.hidden)return;
  identity={id:person.user.id,token:person.token};
  panel.hidden=false;
  requestAccess.hidden=false;requestDeletion.hidden=false;
  await load();
 }
 async function action(name,payload,success){
  if(!identity||busy)return;
  busy=true;
  const n=serial;
  for(const b of [requestAccess,cancelAccess,requestDeletion,cancelDeletion])b.disabled=true;
  try{
   const result=await api(name,payload);
   if(n!==serial||!identity)return;
   if(result.deleted===true)throw Error("UNEXPECTED_DELETION_CLAIM");
   say(success);
   // Always re-read server-owned request state; client never grants deletion.
   await load();
  }catch(_){
   if(n===serial&&identity)
    say("요청 처리 결과를 확인하지 못했습니다. 같은 요청을 반복하지 말고 상태를 새로 확인해 주세요.");
  }finally{
   busy=false;
   for(const b of [requestAccess,cancelAccess,requestDeletion,cancelDeletion])b.disabled=false;
  }
 }
 requestAccess.addEventListener("click",()=>void action(
  "request_access",{},"개인정보 추가 열람 요청을 접수했습니다."));
 cancelAccess.addEventListener("click",()=>void action(
  "cancel_access",{},"개인정보 열람 요청 취소를 접수했습니다."));
 requestDeletion.addEventListener("click",()=>{
  if(!identity||!knownEmail)return;
  if(confirmEmail.value.trim().toLowerCase()!==knownEmail||
    confirmPhrase.value.trim()!=="계정 탈퇴 요청"){
   say("본인의 가입 이메일과 '계정 탈퇴 요청'을 정확히 입력해 주세요.");return;
  }
  if(!window.confirm("탈퇴 요청을 접수합니다. 즉시 삭제되지 않으며, 관련 자료·보존 의무 확인 후 처리됩니다. 계속할까요?"))return;
  void action("request_deletion",{
   confirm:"계정 탈퇴 요청",confirmEmail:confirmEmail.value.trim()
  },"탈퇴 검토 요청이 접수됐습니다. 계정은 아직 삭제되지 않았습니다.");
  confirmEmail.value="";confirmPhrase.value="";
 });
 cancelDeletion.addEventListener("click",()=>void action(
  "cancel_deletion",{},"탈퇴 요청 취소를 접수했습니다."));
 reset();
 return Object.freeze({showFor,hide:reset,refresh:load});
}
Object.defineProperty(window,"BeaguAccountPrivacy",{
 value:Object.freeze({create}),writable:false,configurable:false
});
})();