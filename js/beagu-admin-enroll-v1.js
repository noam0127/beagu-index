/* Verified-email owner onboarding flow with explicit manual authorization.
 * This file contains no approved email, code, service key, or owner UUID.
 * Only Supabase Auth handles passwords. No analytics scripts run on this page.
 */
(() => {
  'use strict';
  const auth=supabaseClient.auth;
  const $=id=>document.getElementById(id);
  const panels=['enrollRegisterPanel','enrollLoginPanel','enrollClaimPanel'];
  let busy=false;
  function notice(message,error=false){
    const el=$('enrollStatus');
    el.textContent=message;
    el.classList.toggle('error',error);
  }
  function pending(state){
    busy=state;
    document.querySelectorAll('button').forEach(button=>button.disabled=state);
  }
  function showAuthenticated(hasSession){
    for(const name of panels)$(name).hidden=hasSession?name!=='enrollClaimPanel':name==='enrollClaimPanel';
    if(hasSession)notice('로그인되었습니다. 이메일 인증까지 마쳤다면 관리자 권한 연결을 요청하세요.');
    else notice('이메일 계정 생성·확인을 진행하거나, 이미 가입했다면 로그인하세요.');
  }
  async function restore(){
    const {data,error}=await auth.getSession();
    if(error)throw error;
    showAuthenticated(Boolean(data?.session?.user?.id));
  }
  $('enrollRegisterForm').addEventListener('submit',async event=>{
    event.preventDefault();if(busy)return;
    const email=$('enrollRegisterEmail').value.trim().toLowerCase();
    const password=$('enrollRegisterPassword').value;
    const confirmation=$('enrollRegisterConfirm').value;
    if(password.length<16||password!==confirmation){
      notice('16자 이상인 동일한 비밀번호를 입력하세요.',true);
      return;
    }
    pending(true);
    try{
      // Supabase sends the standard confirmation email. The recipient must
      // confirm and log in before the independent invite code is accepted.
      const {data,error}=await auth.signUp({
        email,password,options:{emailRedirectTo:new URL('admin-enroll.html',location.href).href}
      });
      if(error)throw error;
      $('enrollRegisterPassword').value='';
      $('enrollRegisterConfirm').value='';
      $('enrollLoginEmail').value=email;
      if(data?.session){
        showAuthenticated(true);
        notice('계정이 생성되었습니다. 이메일 인증 완료 후 관리자 권한 연결이 필요합니다.');
      }else{
        notice('계정 요청이 접수되었습니다. 메일함에서 가입 확인 링크를 완료한 뒤 2단계 로그인으로 진행하세요.');
      }
    }catch(_){
      notice('계정을 생성하지 못했습니다. 이메일 인증·가입 설정을 확인한 뒤 다시 시도하세요.',true);
      $('enrollRegisterPassword').value='';
      $('enrollRegisterConfirm').value='';
    }finally{pending(false);}
  });
  $('enrollLoginForm').addEventListener('submit',async event=>{
    event.preventDefault();if(busy)return;
    pending(true);
    try{
      const email=$('enrollLoginEmail').value.trim().toLowerCase();
      const password=$('enrollLoginPassword').value;
      const {error}=await auth.signInWithPassword({email,password});
      $('enrollLoginPassword').value='';
      if(error)throw error;
      showAuthenticated(true);
    }catch(_){
      $('enrollLoginPassword').value='';
      notice('로그인할 수 없습니다. 이메일 인증 완료 여부와 비밀번호를 확인하세요.',true);
    }finally{pending(false);}
  });
  $('enrollSignOut').addEventListener('click',async()=>{
    if(busy)return;pending(true);
    try{await auth.signOut();showAuthenticated(false);}
    catch(_){notice('로그아웃하지 못했습니다. 다시 시도하세요.',true);}
    finally{pending(false);}
  });
  void restore().catch(()=>notice('인증 상태를 확인하지 못했습니다. 페이지를 다시 열어 주세요.',true));
})();
