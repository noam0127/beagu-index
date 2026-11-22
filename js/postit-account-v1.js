/* Verified Lv2 member sign-in. One Auth account + original challenge device proof.
 * The password is transmitted ONLY to Supabase Auth, never to Post-it API.
 * A shared participation code alone can never bind or use a Post-it writer.
 */
(()=>{
'use strict';
const $=id=>document.getElementById(id);
const client=typeof supabaseClient!=='undefined'?supabaseClient:window.supabaseClient;
const base='https://ycwuugggqbunlbwuzvbx.supabase.co/functions/v1/beagu-postit-api-v1';
const levelKey='beagu-level-session-v1',deviceKey='beagu-referral-device-secret-v1';
const section=$('postitAccount'),status=$('postitAccountStatus'),form=$('postitAccountForm');
const smsPhone=$('postitSmsPhone'),smsConsent=$('postitSmsConsent'),smsUnsubscribe=$('postitSmsUnsubscribe');
if(!client||!section||!status||!form||!smsPhone||!smsConsent||!smsUnsubscribe)return;
let linked=false,busy=false,generation=0;
const levelToken=()=>{try{return sessionStorage.getItem(levelKey)||''}catch{return ''}};
function setLinked(next){
 linked=next===true;
 window.dispatchEvent(new CustomEvent('beagu:postit-account-status',{detail:{linked}}));
}
function message(value){status.textContent=value;}
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
 const session=await authSession();
 if(!session)return null;
 const {data,error}=await client.auth.getUser();
 return error?null:data?.user||null;
}
function validatedLevel(){
 return Number($('beaguLevelState')?.dataset.level)>=2&&/^[a-f0-9]{64}$/.test(levelToken());
}
function render(user){
 const signedIn=Boolean(user);
 form.hidden=signedIn;
 $('postitAccountGoogle').hidden=signedIn;
 $('postitAccountSignOut').hidden=!signedIn;
 smsUnsubscribe.hidden=!signedIn||user?.user_metadata?.beagu_sms_opt_in!==true;
 const canClaim=signedIn&&validatedLevel()&&!linked&&Boolean(originalDevice());
 $('postitAccountLink').hidden=!canClaim;
 $('postitAccountNoDevice').hidden=!signedIn||!validatedLevel()||linked||Boolean(originalDevice());
 if(!signedIn)message('Lv2 참여코드로 열람할 수 있습니다. 글과 댓글을 쓰려면 정식 계정으로 로그인하세요.');
 else if(linked)message('정식 Lv2 계정이 인증되었습니다. 익명으로 글과 댓글을 작성할 수 있습니다.');
 else if(!validatedLevel())message('계정 로그인 완료. 챌린지를 달성한 Lv2 참여코드도 인증해 주세요.');
 else if(!user.email_confirmed_at)message('이메일 주소 확인 후 로그인해야 작성 권한을 연결할 수 있습니다.');
 else if(!originalDevice())message('Lv2 챌린지에 처음 참여한 기기에서 계정을 연결해 주세요.');
 else message('원래 기기 확인을 눌러 Lv2 계정과 익명 작성자 ID를 연결하세요.');
}
async function refresh(){
 const id=++generation;
 const user=await accountUser();
 if(id!==generation)return;
 if(!user||!validatedLevel()){setLinked(false);render(user);return}
 const bearer=await accessToken();
 try{
  const response=await fetch(base+'?action=writer_status',{cache:'no-store',headers:{
    'X-Beagu-Level-Session':levelToken(),'Authorization':'Bearer '+bearer
  }});
  if(id!==generation)return;
  const body=await response.json().catch(()=>({}));
  setLinked(response.ok&&body.linked===true);
 }catch{if(id===generation)setLinked(false)}
 if(id===generation)render(user);
}
async function executeAuth(action){
 if(busy)return;
 const email=$('postitAccountEmail').value.trim();
 const password=$('postitAccountPassword').value;
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||password.length<10){
  message('유효한 이메일과 10자 이상의 비밀번호를 입력하세요.');return;
 }
 busy=true;
 try{
  const wantsSms=action==='signup'&&smsConsent.checked;
  const mobile=smsPhone.value.replace(/[^0-9]/g,'');
  if(wantsSms&&!/^010[0-9]{8}$/.test(mobile)){
   message('문자 수신을 원하시면 010으로 시작하는 11자리 번호를 입력해 주세요.');return;
  }
  const {error}=action==='signup'
   ?await client.auth.signUp({email,password,options:{data:{beagu_sms_opt_in:wantsSms,beagu_sms_phone:wantsSms?mobile:null}}})
   :await client.auth.signInWithPassword({email,password});
  if(error)throw error;
  $('postitAccountPassword').value='';
  smsPhone.value='';smsConsent.checked=false;
  if(action==='signup')message('인증 메일을 확인한 뒤 이 화면에서 로그인하세요.');
  else await refresh();
 }catch(error){
  message(action==='signup'?'계정 생성이 완료되지 않았습니다. 이메일 인증 설정을 확인해 주세요.':'로그인에 실패했습니다. 이메일 인증 여부와 비밀번호를 확인해 주세요.');
 }finally{busy=false}
}
form.addEventListener('submit',e=>{e.preventDefault();void executeAuth('signin')});
$('postitAccountSignup').addEventListener('click',()=>void executeAuth('signup'));
$('postitAccountGoogle').addEventListener('click',async()=>{
 if(busy)return;
 busy=true;
 try{
  const {error}=await client.auth.signInWithOAuth({provider:'google',
   options:{redirectTo:new URL('postit.html',location.href).href}});
  if(error)throw error;
 }catch{message('Google 제공자 설정이나 리디렉션 주소를 확인해 주세요. 이메일 계정 로그인도 이용할 수 있습니다.')}
 finally{busy=false}
});
$('postitAccountLink').addEventListener('click',async()=>{
 if(busy||!validatedLevel())return;
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
  window.dispatchEvent(new CustomEvent('beagu:member-linked'));
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