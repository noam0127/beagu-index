/* Password recovery for a static Supabase-js frontend.
 * A recovery link is not a membership credential. Supabase Auth validates
 * the user session; no local token or user metadata is used for authorization.
 */
(() => {
  'use strict';
  const get = id => document.getElementById(id);
  const requestForm=get('beaguRecoveryRequestForm');
  const resetForm=get('beaguRecoveryResetForm');
  const email=get('beaguRecoveryEmail');
  const password=get('beaguRecoveryPassword');
  const confirmation=get('beaguRecoveryConfirm');
  const status=get('beaguRecoveryStatus');
  const expiry=get('beaguRecoveryExpiry');
  const restart=get('beaguRecoveryRestart');
  const requestButton=get('beaguRecoveryRequestButton');
  const updateButton=get('beaguRecoveryUpdateButton');
  if (![requestForm,resetForm,email,password,confirmation,status,expiry,restart,
        requestButton,updateButton].every(Boolean)) return;

  const client=typeof supabaseClient!=='undefined'
    ?supabaseClient:window.supabaseClient;
  const query=new URLSearchParams(window.location.search||'');
  const fragment=new URLSearchParams((window.location.hash||'').replace(/^#/,''));
  const hasError=query.has('error')||query.has('error_code')||
    fragment.has('error')||fragment.has('error_code');
  const hasTokenHash=query.has('token_hash')||fragment.has('token_hash');
  const hasCode=query.has('code');
  const hasTokens=fragment.has('access_token')||fragment.has('refresh_token');
  const hasRecoveryType=query.get('type')==='recovery'||fragment.get('type')==='recovery';
  const callback=hasError||hasTokenHash||hasCode||hasTokens||hasRecoveryType;
  let busy=false;
  let checking=false;
  let recoveryReady=false;
  let recoveryEvent=false;
  let completed=false;
  const expected=(()=>{
    try{return window.BEAGU_AUTH_RETURN.resolve('passwordReset')}
    catch(_){return ''}
  })();
  const current=window.location.origin+window.location.pathname;
  const correctDestination=Boolean(expected)&&expected===current;
  function paint(type,message){
    status.dataset.state=type;
    status.textContent=message;
    status.hidden=false;
  }
  function cleanLink(){
    try{
      const url=new URL(window.location.href);
      for(const key of ['code','error','error_code','error_description','type',
                        'token_hash','sb_flow_id']){
        url.searchParams.delete(key);
      }
      // Supabase implicit tokens and recovery fragments are not safe history entries.
      if(callback||recoveryEvent)url.hash='';
      window.history.replaceState(window.history.state,'',
        url.pathname+url.search+url.hash);
    }catch(_) {}
  }
  function showRequest(){
    recoveryReady=false;
    requestForm.hidden=false;
    resetForm.hidden=true;
    expiry.hidden=true;
    password.value='';
    confirmation.value='';
  }
  function showExpired(){
    recoveryReady=false;
    requestForm.hidden=true;
    resetForm.hidden=true;
    expiry.hidden=false;
    password.value='';
    confirmation.value='';
    paint('error','인증 링크가 만료되었거나 사용할 수 없습니다. 새 재설정 메일을 요청해 주세요.');
  }
  async function validateRecovery(){
    if(checking||completed||recoveryReady)return;
    if(!correctDestination||!client?.auth){
      showExpired();cleanLink();return;
    }
    checking=true;
    paint('checking','인증 링크의 유효성을 확인하고 있습니다.');
    try{
      let sessionResult=await client.auth.getSession();
      if(!sessionResult?.data?.session?.access_token&&hasCode&&
          typeof client.auth.exchangeCodeForSession==='function'){
        // Only retry PKCE exchange if the client did not already initialize a session.
        sessionResult=await client.auth.exchangeCodeForSession(query.get('code'));
      }
      if(sessionResult?.error||!sessionResult?.data?.session?.access_token){
        showExpired();return;
      }
      // getUser requires a server-authenticated token; an untrusted session
      // in browser storage cannot by itself authorize password reset.
      const verified=await client.auth.getUser();
      if(verified?.error||!verified?.data?.user||
          verified.data.user.is_anonymous||!verified.data.user.email_confirmed_at){
        showExpired();return;
      }
      recoveryReady=true;
      requestForm.hidden=true;
      resetForm.hidden=false;
      expiry.hidden=true;
      paint('ready','인증이 확인되었습니다. 새 비밀번호를 입력해 주세요.');
    }catch(_){
      showExpired();
    }finally{
      checking=false;
      cleanLink();
    }
  }
  if(!correctDestination){
    showExpired();
    cleanLink();
    return;
  }
  if(hasError||hasTokenHash){
    // Custom token_hash templates are not implemented on this public page.
    // Never accept unverified tokens or errors as a recovery session.
    showExpired();
    cleanLink();
    return;
  }
  if(callback){
    requestForm.hidden=true;
    paint('checking','재설정 링크를 확인하고 있습니다.');
  }
  if(!client?.auth){
    paint('error','인증 서비스에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.');
    requestForm.hidden=true;
    return;
  }
  client.auth.onAuthStateChange?.(event=>{
    if(event!=='PASSWORD_RECOVERY'||completed||hasError||hasTokenHash)return;
    recoveryEvent=true;
    queueMicrotask(()=>{void validateRecovery()});
  });
  if(callback)void validateRecovery();

  requestForm.addEventListener('submit',async event=>{
    event.preventDefault();
    if(busy||completed)return;
    const address=email.value.trim();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)){
      paint('error','올바른 이메일 주소를 입력해 주세요.');
      return;
    }
    busy=true;requestButton.disabled=true;
    try{
      await client.auth.resetPasswordForEmail(address,{
        redirectTo:window.BEAGU_AUTH_RETURN.resolve('passwordReset')
      });
      // Do not expose whether the email exists on the service.
      paint('success','해당 주소로 재설정 안내를 보낼 수 있다면 이메일이 발송됩니다. 받은편지함과 스팸함을 확인해 주세요.');
    }catch(_){
      paint('success','재설정 메일 요청 결과를 확인하기 어렵습니다. 잠시 후 메일함을 확인하거나 다시 시도해 주세요.');
    }finally{
      busy=false;requestButton.disabled=false;
    }
  });
  restart.addEventListener('click',()=>{
    if(busy)return;
    showRequest();
    paint('info','새 재설정 메일을 요청할 수 있습니다.');
    email.focus();
  });
  resetForm.addEventListener('submit',async event=>{
    event.preventDefault();
    if(busy||completed||!recoveryReady){
      if(!recoveryReady)showExpired();
      return;
    }
    const next=password.value;
    if(next.length<10||next.length>128||next!==confirmation.value){
      paint('error','10자 이상인 새 비밀번호를 두 칸에 동일하게 입력해 주세요.');
      return;
    }
    busy=true;updateButton.disabled=true;
    try{
      // Revocation and account checks are enforced by the Auth server.
      const {error}=await client.auth.updateUser({password:next});
      if(error)throw error;
      completed=true;
      recoveryReady=false;
      password.value='';
      confirmation.value='';
      resetForm.hidden=true;
      // The recovery link established an Auth session. Prefer a fresh login
      // after a password change rather than leaving it active on a shared PC.
      try{await client.auth.signOut()}catch(_){}
      paint('success','비밀번호를 변경했습니다. 새 비밀번호로 다시 로그인해 주세요.');
    }catch(_){
      password.value='';
      confirmation.value='';
      paint('error','비밀번호를 변경하지 못했습니다. 새 비밀번호의 보안 기준을 확인하거나 새 재설정 메일을 요청해 주세요.');
    }finally{
      busy=false;updateButton.disabled=false;
    }
  });
})();
