/* Lv2 challenge account entry. Participation codes remain separate from
 * Supabase Auth; server-side membership binding is unchanged and authoritative. */
(()=>{
'use strict';
const byId=id=>document.getElementById(id);
const card=byId('challengeIdentityPanel');
const overlay=byId('challengeMemberOverlay');
const dialog=byId('challengeMemberDialog');
const title=byId('challengeMemberTitle');
const description=byId('challengeMemberDescription');
const form=byId('challengeMemberForm');
const email=byId('challengeMemberEmail');
const password=byId('challengeMemberPassword');
const submit=byId('challengeMemberSubmit');
const switchMode=byId('challengeMemberSwitch');
const closeButton=byId('challengeMemberClose');
const message=byId('challengeMemberMessage');
const connect=byId('challengeMemberLink');
const suspend=byId('challengeMemberSuspend');
const signOut=byId('challengeMemberSignOut');
const smsFields=byId('challengeMemberSmsFields');
const smsPhone=byId('challengeMemberSmsPhone');
const smsConsent=byId('challengeMemberSmsConsent');
const smsUnsubscribe=byId('challengeMemberSmsUnsubscribe');
// supabase-config.js declares a top-level lexical const, not a window property.
const client=typeof supabaseClient!=='undefined'?supabaseClient:window.supabaseClient;
if(![card,overlay,dialog,title,description,form,email,password,submit,switchMode,closeButton,message,connect,suspend,signOut,smsFields,smsPhone,smsConsent,smsUnsubscribe].every(Boolean)||!client)return;
const SESSION_KEY='beagu-level-session-v1';
const DEVICE_KEY='beagu-referral-device-secret-v1';
const LEVEL_API='https://snvzwrexuqavnfvzgxqj.supabase.co/functions/v1/beagu-level-api';
const POSTIT_API='https://snvzwrexuqavnfvzgxqj.supabase.co/functions/v1/beagu-postit-api-v1';
let tier2=false,mode='signin',busy=false,focusReturn=null,serial=0;
const levelToken=()=>{try{return sessionStorage.getItem(SESSION_KEY)||''}catch{return ''}};
const deviceProof=()=>{
 try{const v=localStorage.getItem(DEVICE_KEY)||'';return /^[a-f0-9]{64}$/.test(v)?v:''}
 catch{return ''}
};
function paintTier(){
 // The badge's level comes from beagu-level-state-v1's server-verified response.
 const badge=byId('beaguLevelState');
 const token=levelToken();
 tier2=/^[23]$/.test(badge?.dataset.level||'')&&/^[a-f0-9]{64}$/.test(token);
 if(!tier2)close();
}
function paintMode(next){
 mode=next==='signup'?'signup':'signin';
 title.textContent=mode==='signup'?'Lv2 회원가입':'Lv2 로그인';
 description.textContent=mode==='signup'
  ?'이메일로 계정을 만든 뒤 인증 메일을 확인하세요. Lv2 참여코드는 그대로 유지됩니다.'
  :'정식 계정으로 로그인하세요. Lv2 참여코드는 별도로 인증됩니다.';
 submit.textContent=mode==='signup'?'회원가입':'로그인하기';
 password.autocomplete=mode==='signup'?'new-password':'current-password';
 smsFields.hidden=mode!=='signup';
 if(mode!=='signup'){smsPhone.value='';smsConsent.checked=false;}
 switchMode.textContent=mode==='signup'?'이미 계정이 있어요 · 로그인하기':'계정이 없어요 · 회원가입';
 form.hidden=false;
 switchMode.hidden=false;
 connect.hidden=true;suspend.hidden=true;signOut.hidden=true;smsUnsubscribe.hidden=true;
 connect.dataset.action='link_member';connect.textContent='원래 기기 인증 · 회원 연결';
 message.textContent='';
}
async function serverLevel(){
 const token=levelToken();
 if(!tier2||!/^[a-f0-9]{64}$/.test(token))return false;
 try{
  const r=await fetch(LEVEL_API,{method:'POST',cache:'no-store',
   headers:{'Content-Type':'application/json','X-Beagu-Session':token},
   body:JSON.stringify({action:'verify'})});
  const data=await r.json().catch(()=>({}));
  return r.ok&&Number(data.level)===2&&levelToken()===token;
 }catch{return false}
}
async function userSession(){
 const {data,error}=await client.auth.getSession();
 if(error||!data?.session?.access_token)return null;
 const {data:checked,error:checkError}=await client.auth.getUser();
 if(checkError||!checked?.user||checked.user.is_anonymous||!checked.user.email_confirmed_at)return null;
 return {user:checked.user,token:data.session.access_token};
}
async function linkedStatus(accessToken){
 const response=await fetch(POSTIT_API+'?action=writer_status',{
  method:'GET',cache:'no-store',headers:{
   'X-Beagu-Level-Session':levelToken(),'Authorization':'Bearer '+accessToken
  }
 });
 const result=await response.json().catch(()=>({}));
 if(!response.ok)return {state:'unavailable'};
 if(result.linked===true)return {state:'active'};
 if(result.link_state==='suspended')return {state:'suspended'};
 if(result.link_state==='unlinked'||result.linked===false)return {state:'unlinked'};
 return {state:'unavailable'};
}
async function showAccountStatus(){
 const person=await userSession();
 if(overlay.hidden||!tier2)return;
 if(!person)return;
 form.hidden=true;switchMode.hidden=true;signOut.hidden=false;
 smsUnsubscribe.hidden=person.user.user_metadata?.beagu_sms_opt_in!==true;
 const member=await linkedStatus(person.token).catch(()=>({state:'unavailable'}));
 if(overlay.hidden||!tier2)return;
 connect.hidden=true;suspend.hidden=true;
 connect.dataset.action='link_member';
 connect.textContent='원래 기기 인증 · 회원 연결';
 if(member.state==='active'){
  suspend.hidden=false;
  message.textContent='Lv3 정식 회원 연결이 활성화되어 있습니다.';
 }else if(member.state==='suspended'){
  if(deviceProof()){
   connect.hidden=false;
   connect.dataset.action='reactivate_member';
   connect.textContent='원래 기기로 회원 재연결';
   message.textContent='연결이 중지됐습니다. 같은 계정과 원래 기기에서만 복원할 수 있습니다.';
  }else{
   message.textContent='연결이 중지됐습니다. 재연결은 원래 기기에서만 가능합니다.';
  }
 }else if(member.state==='unlinked'&&deviceProof()){
  connect.hidden=false;
  message.textContent='로그인 완료. 원래 기기 인증으로 회원 권한을 연결하세요.';
 }else if(member.state==='unlinked'){
  message.textContent='회원 연결은 챌린지를 진행한 원래 기기에서만 가능합니다.';
 }else{
  message.textContent='현재 회원 연결 상태를 확인하지 못했습니다. 다시 시도해 주세요.';
 }
}
function close(){
 if(overlay.hidden)return;
 overlay.hidden=true;
 document.body.classList.remove('challenge-member-open');
 password.value='';
 const returnTo=focusReturn;
 focusReturn=null;
 if(returnTo?.isConnected&&!returnTo.hidden)returnTo.focus();
}
function open(next='signin'){
 if(!tier2)return;
 focusReturn=document.activeElement;
 paintMode(next);
 overlay.hidden=false;
 document.body.classList.add('challenge-member-open');
 email.focus();
 const seq=++serial;
 void serverLevel().then(async ok=>{
  if(overlay.hidden||seq!==serial)return;
  if(!ok){
   message.textContent='Lv2 인증을 다시 확인해 주세요.';
   submit.disabled=true;return;
  }
  submit.disabled=false;
  await showAccountStatus();
 });
}
window.addEventListener('beagu:challenge-account-open',event=>open(event.detail?.mode||'signin'));
window.addEventListener('beagu:level-state-updated',paintTier);
window.addEventListener('beagu:participation-authenticated',()=>queueMicrotask(paintTier));
window.addEventListener('beagu:participation-logged-out',()=>{tier2=false;close()});
closeButton.addEventListener('click',close);
overlay.addEventListener('click',event=>{if(event.target===overlay)close()});
switchMode.addEventListener('click',()=>{paintMode(mode==='signup'?'signin':'signup');email.focus()});
document.addEventListener('keydown',event=>{
 if(overlay.hidden)return;
 if(event.key==='Escape'){event.preventDefault();close();return}
 if(event.key!=='Tab')return;
 const options=[...dialog.querySelectorAll('button:not(:disabled), input:not(:disabled)')]
  .filter(element=>!element.hidden&&!element.closest('[hidden]')&&element.getClientRects().length>0);
 if(options.length===0)return;
 const first=options[0],last=options[options.length-1];
 if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
 else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
});
form.addEventListener('submit',async event=>{
 event.preventDefault();
 if(busy)return;
 const address=email.value.trim(),secret=password.value;
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)||secret.length<10){
  message.textContent='이메일 주소와 10자 이상의 비밀번호를 입력해 주세요.';return;
 }
 busy=true;submit.disabled=true;
 try{
  if(!await serverLevel())throw Error('LEVEL_REQUIRED');
  if(mode==='signup'){
   const wantsSms=smsConsent.checked;
   const mobile=smsPhone.value.replace(/[^0-9]/g,'');
   if(wantsSms&&!/^010[0-9]{8}$/.test(mobile)){
    message.textContent='문자 수신을 원하시면 010으로 시작하는 11자리 번호를 입력해 주세요.';
    return;
   }
   const {error}=await client.auth.signUp({email:address,password:secret,
    options:{emailRedirectTo:new URL('challenge.html',location.href).href,
     data:{beagu_sms_opt_in:wantsSms,beagu_sms_phone:wantsSms?mobile:null}}});
   if(error)throw error;
   password.value='';
   message.textContent='회원가입 요청을 완료했습니다. 이메일 인증 후 로그인해 주세요.';
   return;
  }
  const {error}=await client.auth.signInWithPassword({email:address,password:secret});
  if(error)throw error;
  password.value='';
  message.textContent='계정 로그인을 확인하고 있습니다.';
  await showAccountStatus();
 }catch(error){
  message.textContent=error?.message==='LEVEL_REQUIRED'
   ?'Lv2 참여코드를 다시 인증해 주세요.'
   :mode==='signup'
    ?'회원가입을 완료하지 못했습니다. 이메일 또는 인증 설정을 확인해 주세요.'
    :'로그인에 실패했습니다. 이메일·비밀번호·인증 여부를 확인해 주세요.';
 }finally{busy=false;submit.disabled=false}
});
connect.addEventListener('click',async()=>{
 if(busy)return;
 const original=deviceProof(),person=await userSession();
 if(!original||!person||!await serverLevel()){
  message.textContent='챌린지를 발급한 기기의 Lv2 인증과 계정 로그인을 확인해 주세요.';return;
 }
 busy=true;connect.disabled=true;
 try{
  const response=await fetch(POSTIT_API,{method:'POST',cache:'no-store',headers:{
   'Content-Type':'application/json','X-Beagu-Level-Session':levelToken(),
   'Authorization':'Bearer '+person.token},
   body:JSON.stringify({action:connect.dataset.action==='reactivate_member'?'reactivate_member':'link_member',deviceSecret:original})});
  const answer=await response.json().catch(()=>({}));
  if(!response.ok||answer.linked!==true)throw Error(answer.error||'LINK_FAILED');
  connect.hidden=true;
  message.textContent='같은 계정의 회원 연결이 활성화됐습니다. Lv3 권한을 다시 확인합니다.';
  window.dispatchEvent(new Event('beagu:level-state-change'));
  await showAccountStatus();
 }catch(error){
  message.textContent=error.message==='MEMBERSHIP_ALREADY_CLAIMED'
   ?'이미 다른 계정에 연결된 챌린지 권한입니다.'
   :'Lv2 챌린지 기기 확인에 실패했습니다. 원래 기기에서 다시 시도해 주세요.';
 }finally{busy=false;connect.disabled=false}
});
// Suspension immediately removes Lv3/writer privileges, but deliberately
// reserves the original visitor/author ID: it cannot be moved to another user.
suspend.addEventListener('click',async()=>{
 if(busy||suspend.hidden)return;
 if(!window.confirm('회원 연결을 잠시 해제하시겠습니까?\nLv3·포스트잇 작성 권한은 중지되지만 기존 게시글은 삭제되지 않습니다. 재연결에는 같은 계정과 원래 기기가 필요합니다.'))return;
 const person=await userSession();
 if(!person||!await serverLevel()){
  message.textContent='계정 로그인과 참여코드 인증을 다시 확인해 주세요.';return;
 }
 busy=true;suspend.disabled=true;
 try{
  const response=await fetch(POSTIT_API,{method:'POST',cache:'no-store',headers:{
   'Content-Type':'application/json','X-Beagu-Level-Session':levelToken(),
   'Authorization':'Bearer '+person.token},
   body:JSON.stringify({action:'suspend_member'})});
  const answer=await response.json().catch(()=>({}));
  if(!response.ok||answer.link_state!=='suspended')throw Error('SUSPEND_FAILED');
  suspend.hidden=true;
  message.textContent='회원 연결을 중지했습니다. 같은 계정과 원래 기기에서만 복원할 수 있습니다.';
  window.dispatchEvent(new Event('beagu:level-state-change'));
  await showAccountStatus();
 }catch{message.textContent='회원 연결을 중지하지 못했습니다. 다시 시도해 주세요.'}
 finally{busy=false;suspend.disabled=false}
});
smsUnsubscribe.addEventListener('click',async()=>{
 if(busy)return;
 busy=true;smsUnsubscribe.disabled=true;
 try{
  const {error}=await client.auth.updateUser({data:{beagu_sms_opt_in:false,beagu_sms_phone:null}});
  if(error)throw error;
  smsUnsubscribe.hidden=true;
  message.textContent='문자 수신 동의를 철회했습니다. 저장된 발송용 번호도 삭제됩니다.';
 }catch{message.textContent='수신 동의를 철회하지 못했습니다. 다시 시도해 주세요.'}
 finally{busy=false;smsUnsubscribe.disabled=false}
});
signOut.addEventListener('click',async()=>{
 if(busy)return;
 busy=true;signOut.disabled=true;
 try{await client.auth.signOut()}catch(_){}
 finally{busy=false;signOut.disabled=false}
 paintMode('signin');
 message.textContent='정식 계정에서 로그아웃했습니다. Lv2 참여코드 인증은 유지됩니다.';
 window.dispatchEvent(new Event('beagu:level-state-change'));
});
client.auth.onAuthStateChange(()=>{
 // The backend, not Auth callbacks, decides whether Lv3 has been earned.
 queueMicrotask(()=>{
  window.dispatchEvent(new Event('beagu:level-state-change'));
  if(!overlay.hidden)void showAccountStatus();
 });
});
paintTier();
})();