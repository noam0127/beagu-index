/* Standalone privacy center, available to every registered account.
 * Do not require Lv2 device proof to request access or account deletion.
 */
(()=>{
"use strict";
const $=id=>document.getElementById(id);
const client=typeof supabaseClient!=="undefined"?supabaseClient:window.supabaseClient;
if(!client||!window.BeaguAccountPrivacy?.create)return;
const login=$("selfLoginSection"),logged=$("selfLoggedInSection"),
 form=$("selfLoginForm"),status=$("selfLoginStatus"),smsStatus=$("selfSmsStatus"),
 smsWithdraw=$("selfSmsWithdraw"),loginButton=$("selfLoginButton");
const privacy=window.BeaguAccountPrivacy.create({
 client,panel:$("selfPrivacyPanel"),summary:$("selfPrivacySummary"),
 status:$("selfPrivacyStatus"),requestAccess:$("selfPrivacyAccess"),
 cancelAccess:$("selfPrivacyCancelAccess"),requestDeletion:$("selfPrivacyRequestDeletion"),
 cancelDeletion:$("selfPrivacyCancelDeletion"),
 confirmEmail:$("selfPrivacyConfirmEmail"),confirmPhrase:$("selfPrivacyConfirmPhrase")
});
let generation=0,busy=false,account=null;
function hide(){
 generation++;
 account=null;
 privacy.hide();
 logged.hidden=true;
 login.hidden=false;
 smsStatus.textContent="";
 $("selfLoginPassword").value="";
}
async function refresh(){
 const id=++generation;
 privacy.hide();
 try{
  const {data:session,error:sessionError}=await client.auth.getSession();
  if(sessionError||!session?.session?.access_token)throw Error("AUTH_REQUIRED");
  const {data:userData,error:userError}=await client.auth.getUser();
  const user=userData?.user;
  if(userError||!user||!user.email_confirmed_at||user.is_anonymous)
    throw Error("AUTH_REQUIRED");
  if(id!==generation)return;
  account=user.id;
  logged.hidden=false;
  login.hidden=true;
  $("selfLoginPassword").value="";
  await privacy.showFor({user,token:session.session.access_token});
 }catch(_){
  if(id!==generation)return;
  hide();
  status.textContent="본인 인증을 완료한 계정으로 로그인해 주세요.";
 }
}
form.addEventListener("submit",async event=>{
 event.preventDefault();
 if(busy)return;
 const email=$("selfLoginEmail").value.trim(),password=$("selfLoginPassword").value;
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!password){
  status.textContent="이메일과 기존 비밀번호를 입력해 주세요.";return;
 }
 busy=true;loginButton.disabled=true;
 status.textContent="로그인 중입니다.";
 try{
  const {error}=await client.auth.signInWithPassword({email,password});
  $("selfLoginPassword").value="";
  if(error)throw Error("AUTH_FAILED");
  await refresh();
 }catch(_){
  status.textContent="로그인을 완료하지 못했습니다. 이메일·비밀번호·인증 메일을 확인해 주세요.";
 }finally{busy=false;loginButton.disabled=false;}
});
$("selfSignOut").addEventListener("click",async()=>{
 if(busy)return;
 busy=true;hide();
 try{await client.auth.signOut()}catch(_){}
 finally{
  busy=false;status.textContent="로그아웃했습니다.";
 }
});
smsWithdraw.addEventListener("click",async()=>{
 if(busy||!account)return;
 busy=true;smsWithdraw.disabled=true;
 smsStatus.textContent="문자 수신 동의 철회·연락처 삭제를 확인 중입니다.";
 const id=generation,owner=account;
 try{
  const {data,error}=await client.functions.invoke("beagu-member-sms-api-v2",{
   body:{action:"withdraw"}
  });
  if(error||data?.ok!==true||data?.consented!==false)
   throw Error("WITHDRAW_NOT_CONFIRMED");
  if(id!==generation||owner!==account)return;
  smsStatus.textContent="문자 수신 동의 철회와 서버 연락처 삭제를 확인했습니다.";
  await privacy.refresh();
 }catch(_){
  if(id===generation)
   smsStatus.textContent="문자 수신 동의 철회·삭제 결과를 확인하지 못했습니다. 다시 조회해 주세요.";
 }finally{busy=false;smsWithdraw.disabled=false;}
});
client.auth.onAuthStateChange((event)=>{
 if(event==="SIGNED_OUT"){hide();return;}
 if(event==="SIGNED_IN"||event==="TOKEN_REFRESHED")
  Promise.resolve().then(()=>refresh());
});
hide();
void refresh();
})();