/* Verified Lv2 member sign-in. One Auth account + original challenge device proof.
 * The password is transmitted ONLY to Supabase Auth, never to Post-it API.
 * A shared participation code alone can never bind or use a Post-it writer.
 */
(()=>{
'use strict';
const $=id=>document.getElementById(id);
const client=typeof supabaseClient!=='undefined'?supabaseClient:window.supabaseClient;
const base='https://snvzwrexuqavnfvzgxqj.supabase.co/functions/v1/beagu-postit-api-v1';
const levelKey='beagu-level-session-v1',deviceKey='beagu-referral-device-secret-v1';
const section=$('postitAccount'),status=$('postitAccountStatus'),form=$('postitAccountForm');
const smsPhone=$('postitSmsPhone'),smsConsent=$('postitSmsConsent'),smsUnsubscribe=$('postitSmsUnsubscribe');
if(!client||!section||!status||!form||!smsPhone||!smsConsent||!smsUnsubscribe||
   !window.BeaguAccountMode?.create||!window.BeaguAccountStatus?.set||!window.BeaguSessionRestore?.create)return;
const accountMode=window.BeaguAccountMode.create({
 form,
 title:$('postitAccountHeading'),
 description:$('postitAccountDescription'),
 password:$('postitAccountPassword'),
 submit:$('postitAccountLogin'),
 switchButton:$('postitAccountSignup'),
 smsFields:$('postitSmsFields'),smsPhone,smsConsent,
 forgot:$('postitAccountForgot'),
 google:$('postitAccountGoogle')
});
accountMode.setMode('signin');
let linked=false,busy=false,generation=0;
const levelToken=()=>{try{return sessionStorage.getItem(levelKey)||''}catch{return ''}};
const restored=window.BeaguSessionRestore.create({client,getLevelToken:levelToken,
 levelUrl:'https://snvzwrexuqavnfvzgxqj.supabase.co/functions/v1/beagu-level-api',
 request:(...args)=>fetch(...args)});
function setLinked(next){
 linked=next===true;
 window.dispatchEvent(new CustomEvent('beagu:postit-account-status',{detail:{linked}}));
}
function message(value){status.dataset.state='info';status.textContent=value;}
const showState=state=>window.BeaguAccountStatus.set(status,state);
async function authSession(){
 const {data,error}=await client.auth.getSession();
 if(error)return null;
 return data?.session||null;
}
async function accessToken(){return (await authSession())?.access_token||''}
function originalDevice(){
 try{const secret=localStorage.getItem(deviceKey)||'';return /^[a-f0-9]{64}$/.test(secret)?secret:''}
 catch{return ''}
}
async function accountUser(){
 return (await restored.identity())?.user||null;
}
function validatedLevel(){
 return $('beaguLevelState')?.dataset.level==='2'&&/^[a-f0-9]{64}$/.test(levelToken());
}
function render(user,serverLevelVerified=false){
 const signedIn=Boolean(user);
 const emailVerified=signedIn&&Boolean(user.email_confirmed_at)&&user.is_anonymous!==true;
 form.hidden=signedIn;
 $('postitAccountGoogle').hidden=signedIn;
 $('postitAccountSignOut').hidden=!signedIn;
 smsUnsubscribe.hidden=!signedIn||user?.user_metadata?.beagu_sms_opt_in!==true;
 const canClaim=emailVerified&&serverLevelVerified&&!linked&&Boolean(originalDevice());
 $('postitAccountLink').hidden=!canClaim;
 $('postitAccountNoDevice').hidden=!emailVerified||!serverLevelVerified||linked||Boolean(originalDevice());
 if(!signedIn)showState('signin-required');
 else if(!emailVerified)showState('email-pending');
 else if(!serverLevelVerified)showState('level-required');
 else if(linked)showState('linked');
 else if(!originalDevice())showState('device-required');
 else showState('link-ready');
}
async function refresh(){
 const id=++generation;
 // Revocation/logout must immediately clear previously displayed write access.
 setLinked(false);
 const identity=await restored.identity();
 if(id!==generation)return;
 const user=identity?.user||null;
 if(!identity?.emailVerified||!validatedLevel()){
  render(user,false);return;
 }
 const verifiedLevel=await restored.level();
 if(id!==generation)return;
 if(!verifiedLevel){render(user,false);return}
 try{
  const response=await fetch(base+'?action=writer_status',{cache:'no-store',headers:{
    'X-Beagu-Level-Session':levelToken(),'Authorization':'Bearer '+identity.token
  }});
  if(id!==generation)return;
  const body=await response.json().catch(()=>({}));
  setLinked(response.ok&&body.linked===true);
 }catch{if(id===generation)setLinked(false)}
 if(id===generation)render(user,true);
}
async function executeAuth(action){
 if(busy)return;
 const email=$('postitAccountEmail').value.trim();
 const password=$('postitAccountPassword').value;
 // Do not require existing members to meet a NEW signup minimum.
 // The Supabase Auth server still validates password correctness and account state.
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!password||
    (action==='signup'&&password.length<10)){
  message(action==='signup'
    ?'유효한 이메일과 10자 이상의 새 비밀번호를 입력하세요.'
    :'유효한 이메일과 기존 비밀번호를 입력하세요.');return;
 }
 busy=true;
 try{
  const wantsSms=action==='signup'&&smsConsent.checked;
  const mobile=smsPhone.value.replace(/[^0-9]/g,'');
  if(wantsSms&&!/^010[0-9]{8}$/.test(mobile)){
   message('문자 수신을 원하시면 010으로 시작하는 11자리 번호를 입력해 주세요.');return;
  }
  const {error}=action==='signup'
   ?await client.auth.signUp({email,password,options:{emailRedirectTo:window.BEAGU_AUTH_RETURN.resolve('postit'),data:{beagu_sms_opt_in:wantsSms,beagu_sms_phone:wantsSms?mobile:null}}})
   :await client.auth.signInWithPassword({email,password});
  if(error)throw error;
  $('postitAccountPassword').value='';
  smsPhone.value='';smsConsent.checked=false;
  if(action==='signup')showState('signup-requested');
  else {showState('checking');await refresh();}
 }catch(error){
  showState(action==='signup'?'signup-failed':'signin-failed');
 }finally{busy=false}
}
form.addEventListener('submit',e=>{e.preventDefault();void executeAuth(accountMode.mode())});
$('postitAccountSignup').addEventListener('click',()=>{
 if(busy)return;
 const next=accountMode.toggle();
 message(next==='signup'
  ?'새 계정은 10자 이상의 비밀번호가 필요합니다. 인증 메일을 확인해 주세요.'
  :'기존 계정으로 로그인하세요. 이전에 설정한 짧은 비밀번호도 입력할 수 있습니다.');
 $('postitAccountPassword').focus();
});
$('postitAccountGoogle').addEventListener('click',async()=>{
 if(busy)return;
 busy=true;
 try{
  const {error}=await client.auth.signInWithOAuth({provider:'google',
   options:{redirectTo:window.BEAGU_AUTH_RETURN.resolve('postit')}});
  if(error)throw error;
 }catch{message('Google 제공자 설정이나 리디렉션 주소를 확인해 주세요. 이메일 계정 로그인도 이용할 수 있습니다.')}
 finally{busy=false}
});
$('postitAccountLink').addEventListener('click',async()=>{
 if(busy||!validatedLevel()||!await restored.level())return;
 const deviceSecret=originalDevice();const bearer=await accessToken();
 if(!deviceSecret||!bearer){message('원래 기기 및 로그인 상태를 다시 확인해 주세요.');return}
 busy=true;$('postitAccountLink').disabled=true;
 try{
  const response=await fetch(base,{method:'POST',cache:'no-store',headers:{
   'Content-Type':'application/json','X-Beagu-Level-Session':levelToken(),
   'Authorization':'Bearer '+bearer
  },body:JSON.stringify({action:'link_member',deviceSecret})});
  const body=await response.json().catch(()=>({}));
  if(!response.ok||body.linked!==true)throw Error(body.error||'LINK_FAILED');
  await refresh();
 }catch(error){
  message(error.message==='MEMBERSHIP_ALREADY_CLAIMED'
   ?'이미 다른 계정에 연결된 챌린지 권한입니다. 관리자에게 문의해 주세요.'
   :'원래 기기 증명 또는 Lv2 권한을 확인하지 못했습니다. 연결되지 않았습니다.');
 }finally{busy=false;$('postitAccountLink').disabled=false}
});
smsUnsubscribe.addEventListener('click',async()=>{
 if(busy)return;
 busy=true;smsUnsubscribe.disabled=true;
 try{
  const {error}=await client.auth.updateUser({data:{beagu_sms_opt_in:false,beagu_sms_phone:null}});
  if(error)throw error;
  smsUnsubscribe.hidden=true;
  message('문자 안내 수신 동의를 철회했습니다. 발송용 휴대폰번호도 삭제됩니다.');
 }catch{message('수신 동의 철회에 실패했습니다. 다시 시도해 주세요.')}
 finally{busy=false;smsUnsubscribe.disabled=false}
});
$('postitAccountSignOut').addEventListener('click',async()=>{
 if(busy)return;busy=true;setLinked(false);
 await client.auth.signOut().catch(()=>{});
 busy=false;void refresh();
});
window.addEventListener('beagu:level-state-updated',()=>void refresh());
client.auth.onAuthStateChange(()=>{Promise.resolve().then(()=>refresh())});
window.BeaguPostitAccount={accessToken,refresh,canWrite:()=>linked};
void refresh();
})();