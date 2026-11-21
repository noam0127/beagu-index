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
const signOut=byId('challengeMemberSignOut');
const smsFields=byId('challengeMemberSmsFields');
const smsPhone=byId('challengeMemberSmsPhone');
const smsConsent=byId('challengeMemberSmsConsent');
const smsCollectionConsent=byId('challengeMemberSmsCollectionConsent');
const smsUnsubscribe=byId('challengeMemberSmsUnsubscribe');
const smsSave=byId('challengeMemberSmsSave'),smsStatus=byId('challengeMemberSmsStatus');
const privacyPanel=byId('challengePrivacyPanel');
// supabase-config.js declares a top-level lexical const, not a window property.
const client=typeof supabaseClient!=='undefined'?supabaseClient:window.supabaseClient;
if(![card,overlay,dialog,title,description,form,email,password,submit,switchMode,closeButton,message,connect,signOut,smsFields,smsPhone,smsConsent,smsCollectionConsent,smsUnsubscribe,smsSave,smsStatus,privacyPanel].every(Boolean)||!client)return;
const SESSION_KEY='beagu-level-session-v1';
const DEVICE_KEY='beagu-referral-device-secret-v1';
const LEVEL_API='https://snvzwrexuqavnfvzgxqj.supabase.co/functions/v1/beagu-level-api';
const POSTIT_API='https://snvzwrexuqavnfvzgxqj.supabase.co/functions/v1/beagu-postit-api-v1';
let tier2=false,mode='signin',busy=false,focusReturn=null,serial=0;
if(!window.BeaguAccountMode?.create||!window.BeaguAccountStatus?.set||!window.BeaguSessionRestore?.create||!window.BeaguAuthErrorUI?.show||!window.BeaguSmsConsent?.create||!window.BeaguSmsAccountSettings?.create||!window.BeaguAccountPrivacy?.create)return;
const setAccountState=state=>window.BeaguAccountStatus.set(message,state);
const showInputError=kind=>window.BeaguAuthErrorUI.show(message,kind);
const smsPrivacy=window.BeaguSmsConsent.create({phone:smsPhone,
 collectionConsent:smsCollectionConsent,marketingConsent:smsConsent});
const smsAccount=window.BeaguSmsAccountSettings.create({
 client,container:smsFields,save:smsSave,withdraw:smsUnsubscribe,
 status:smsStatus,consent:smsPrivacy
});
const accountPrivacy=window.BeaguAccountPrivacy.create({
 client,panel:byId('challengePrivacyPanel'),summary:byId('challengePrivacySummary'),
 status:byId('challengePrivacyStatus'),requestAccess:byId('challengePrivacyAccess'),
 cancelAccess:byId('challengePrivacyCancelAccess'),requestDeletion:byId('challengePrivacyRequestDeletion'),
 cancelDeletion:byId('challengePrivacyCancelDeletion'),
 confirmEmail:byId('challengePrivacyConfirmEmail'),confirmPhrase:byId('challengePrivacyConfirmPhrase')
});
const accountMode=window.BeaguAccountMode.create({
 form,title,description,password,submit,switchButton:switchMode,
 smsFields,smsPhone,smsConsent,smsCollectionConsent,forgot:byId('challengeMemberForgot')
});
const restored=window.BeaguSessionRestore.create({client,getLevelToken:()=>levelToken(),levelUrl:LEVEL_API,request:(...args)=>fetch(...args)});
const levelToken=()=>{try{return sessionStorage.getItem(SESSION_KEY)||''}catch{return ''}};
const deviceProof=()=>{
 try{const v=localStorage.getItem(DEVICE_KEY)||'';return /^[a-f0-9]{64}$/.test(v)?v:''}
 catch{return ''}
};
function paintTier(){
 // The badge's level comes from beagu-level-state-v1's server-verified response.
 const badge=byId('beaguLevelState');
 const token=levelToken();
 tier2=badge?.dataset.level==='2'&&/^[a-f0-9]{64}$/.test(token);
 if(!tier2)close();
}
function paintMode(next){
 mode=accountMode.setMode(next);
 form.hidden=false;
 switchMode.hidden=false;
 connect.hidden=true;signOut.hidden=true;smsAccount.hide();accountPrivacy.hide();
 setAccountState(mode==='signup'?'signup-ready':'signin-required');
}

async function serverLevel(){
 return tier2&&await restored.level();
}
async function sessionIdentity(){
 return restored.identity();
}
async function userSession(){
 const person=await sessionIdentity();
 return person?.user.email_confirmed_at?person:null;
}
async function linkedStatus(accessToken){
 const response=await fetch(POSTIT_API+'?action=writer_status',{
  method:'GET',cache:'no-store',headers:{
   'X-Beagu-Level-Session':levelToken(),'Authorization':'Bearer '+accessToken
  }
 });
 const result=await response.json().catch(()=>({}));
 return {linked:response.ok&&result.linked===true,
   lv3LinkReady:response.ok&&result.linked===true&&result.lv3LinkReady===true};
}
async function showAccountStatus(){
 const person=await sessionIdentity();
 if(overlay.hidden||!tier2)return;
 if(!person){
  // A previously restored session can expire while this modal is open.
  // Re-enable the form instead of trapping the user behind a hidden login.
  form.hidden=false;switchMode.hidden=false;signOut.hidden=true;
  connect.hidden=true;smsAccount.hide();accountPrivacy.hide();
  const forgot=byId('challengeMemberForgot');
  if(forgot)forgot.hidden=mode!=='signin';
  if(mode==='signin')setAccountState('signin-required');
  return;
 }
 form.hidden=true;switchMode.hidden=true;signOut.hidden=false;
 const forgot=byId('challengeMemberForgot');
 if(forgot)forgot.hidden=true;
 if(!person.user.email_confirmed_at){
  connect.hidden=true;smsAccount.hide();accountPrivacy.hide();
  setAccountState('email-pending');
  return;
 }
 void smsAccount.showFor(person);
 void accountPrivacy.showFor(person);
 const levelStillValid=await serverLevel();
 if(overlay.hidden||!tier2)return;
 if(!levelStillValid){
  connect.hidden=true;
  setAccountState('level-required');
  return;
 }
 const linked=await linkedStatus(person.token).catch(()=>({linked:false,lv3LinkReady:false}));
 if(overlay.hidden||!tier2)return;
 if(linked.linked){
  connect.hidden=true;
  if(linked.lv3LinkReady)setAccountState('lv3-link-ready');
  else setAccountState('linked');
 }else if(deviceProof()){
  connect.hidden=false;
  setAccountState('link-ready');
 }else{
  connect.hidden=true;
  setAccountState('device-required');
 }
}
function close(){
 if(overlay.hidden)return;
 overlay.hidden=true;smsAccount.hide();accountPrivacy.hide();
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
 const options=[...dialog.querySelectorAll('button:not(:disabled), input:not(:disabled), a[href]')]
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
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)||!secret||
    (mode==='signup'&&secret.length<10)){
  showInputError(mode==='signup'?'signup-input':'signin-input');
  return;
 }
 busy=true;submit.disabled=true;switchMode.disabled=true;
 form.dataset.busy='true';
 form.setAttribute?.('aria-busy','true');
 setAccountState('checking');
 try{
  if(!await serverLevel())throw Error('LEVEL_REQUIRED');
  if(mode==='signup'){
   // No raw phone or marketing consent is sent to user-editable Auth metadata.
   // Explicit reconsent is available ONLY after verified login via the private API.
   const {error}=await client.auth.signUp({email:address,password:secret,
    options:{emailRedirectTo:window.BEAGU_AUTH_RETURN.resolve('challenge')}});
   if(error)throw error;
   password.value='';smsPrivacy.clear();
   setAccountState('signup-requested');
   return;
  }
  const {error}=await client.auth.signInWithPassword({email:address,password:secret});
  if(error)throw error;
  password.value='';
  setAccountState('checking');
  await showAccountStatus();
 }catch(error){
  if(error?.message==='LEVEL_REQUIRED')showInputError('level-required');
  else window.BeaguAuthErrorUI.fromError(message,error,mode);
 }finally{
  busy=false;submit.disabled=false;switchMode.disabled=false;
  form.dataset.busy='false';form.setAttribute?.('aria-busy','false');
 }
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
   body:JSON.stringify({action:'link_member',deviceSecret:original})});
  const answer=await response.json().catch(()=>({}));
  if(!response.ok||answer.linked!==true)throw Error(answer.error||'LINK_FAILED');
  connect.hidden=true;
  setAccountState(answer.lv3LinkReady===true?'lv3-link-ready':'linked');
 }catch(error){
  message.textContent=error.message==='MEMBERSHIP_ALREADY_CLAIMED'
   ?'이미 다른 계정에 연결된 챌린지 권한입니다.'
   :'Lv2 챌린지 기기 확인에 실패했습니다. 원래 기기에서 다시 시도해 주세요.';
 }finally{busy=false;connect.disabled=false}
});
signOut.addEventListener('click',async()=>{
 if(busy)return;
 busy=true;signOut.disabled=true;
 try{await client.auth.signOut()}catch(_){}
 finally{busy=false;signOut.disabled=false}
 smsAccount.hide();
 paintMode('signin');
 setAccountState('signed-out');
});
client.auth.onAuthStateChange(()=>{if(!overlay.hidden)queueMicrotask(()=>{void showAccountStatus()})});
paintTier();
})();