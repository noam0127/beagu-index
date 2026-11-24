(() => {
  'use strict';
  const SESSION_KEY='beagu-level-session-v1';
  const endpoint=`${SUPABASE_URL}/functions/v1/beagu-level-api`;
  const panel=document.getElementById('challengeAccessPanel');
  const form=document.getElementById('challengeAccessForm');
  const input=document.getElementById('challengeAccessCode');
  const button=document.getElementById('challengeAccessSubmit');
  const feedback=document.getElementById('challengeAccessFeedback');
  const protectedArea=document.getElementById('challengeProtected');
  const logoutButton=document.getElementById('challengeLogout');
  const badge=document.getElementById('challengeAccessBadge');
  const toggle=document.getElementById('challengeAccessToggle');
  let activeToken='';
  let requestSerial=0;

  const session=()=>{
    try{return sessionStorage.getItem(SESSION_KEY)||'';}catch(_){return '';}
  };
  const clearSaved=()=>{
    try{sessionStorage.removeItem(SESSION_KEY);}catch(_){}
  };
  const save=(token)=>{
    try{sessionStorage.setItem(SESSION_KEY,token);}catch(_){}
  };
  const message=(text)=>{feedback.textContent=text;};
  function resetCodeVisibility(){
    input.type='password';
    toggle.textContent='표시';
    toggle.setAttribute('aria-pressed','false');
    toggle.setAttribute('aria-label','참여코드 표시');
  }
  function authState(level){
    const verified=Number(level)>=1;
    badge.textContent=level==='checking'?'확인 중':verified?'Lv.'+level+' 인증 완료':'Lv.0 · 미인증';
    const accountStatus=document.getElementById('togetherCurrentAuth');
    if(accountStatus)accountStatus.textContent=level==='checking'?'인증 상태 확인 중':verified?'현재 인증: Lv.'+level:'현재 인증: Lv.0';
    badge.classList.toggle('is-authenticated',verified);
    panel.setAttribute('data-auth-level',verified?String(level):'0');
    panel.setAttribute('data-challenge-verified-level',verified?String(level):'0');
  }
  toggle.addEventListener('click',()=>{
    const reveal=input.type==='password';
    input.type=reveal?'text':'password';
    toggle.textContent=reveal?'숨기기':'표시';
    toggle.setAttribute('aria-pressed',String(reveal));
    toggle.setAttribute('aria-label',reveal?'참여코드 숨기기':'참여코드 표시');
  });
  function lock(text=''){
    activeToken='';
    protectedArea.hidden=true;
    panel.hidden=false;
    form.hidden=false;
    logoutButton.hidden=true;
    input.value='';
    resetCodeVisibility();
    authState(0);
    button.disabled=false;
    message(text);
    window.dispatchEvent(new Event('beagu:challenge-access-revoked'));
  }
  function unlock(token,level=1){
    if(!token)return;
    activeToken=token;
    panel.hidden=false;
    form.hidden=true;
    protectedArea.hidden=false;
    logoutButton.hidden=false;
    input.value='';
    resetCodeVisibility();
    authState(level);
    message('');
    window.dispatchEvent(new Event('beagu:challenge-access-granted'));
  }
  async function api(action,payload={},token=''){
    const response=await fetch(endpoint,{
      method:'POST',cache:'no-store',
      headers:{'Content-Type':'application/json','X-Beagu-Session':token},
      body:JSON.stringify({action,...payload})
    });
    const result=await response.json().catch(()=>({}));
    if(!response.ok){
      const error=new Error('ACCESS_CHECK_FAILED');
      error.status=response.status;
      throw error;
    }
    return result;
  }
  function isLevelOne(result){
    const level=Number(result?.level);
    return Number.isInteger(level)&&level>=1;
  }
  async function verifyStored(){
    const token=session();
    if(!token){lock('');return;}
    const serial=++requestSerial;
    panel.hidden=false;
    protectedArea.hidden=true;
    form.hidden=true;
    logoutButton.hidden=true;
    authState('checking');
    message('Lv.1 인증 상태 확인 중…');
    try{
      const result=await api('verify',{},token);
      if(serial!==requestSerial)return;
      if(!isLevelOne(result)){
        clearSaved();
        lock('Lv.1 인증이 필요합니다.');
        return;
      }
      unlock(token,Number(result.level));
    }catch(error){
      if(serial!==requestSerial)return;
      if(error.status===401||error.status===403){
        clearSaved();
        lock('인증이 만료되었습니다. 참여코드를 입력해 주세요.');
      }else{
        lock('인증 상태를 확인할 수 없습니다. 연결을 확인하고 참여코드를 입력해 주세요.');
      }
    }
  }

  form.addEventListener('submit',async event=>{
    event.preventDefault();
    const code=input.value.trim();
    if(!code)return;
    const serial=++requestSerial;
    button.disabled=true;
    message('인증 중…');
    const loading=window.BeaguLoading?.start('Lv.1 참여코드를 확인하는 중…');
    try{
      const result=await api('login',{code});
      if(serial!==requestSerial)return;
      if(!isLevelOne(result)||typeof result.token!=='string'||!result.token){
        lock('Lv.1 참여코드를 입력해 주세요.');
        return;
      }
      save(result.token);
      unlock(result.token,Number(result.level));
    }catch(error){
      if(serial!==requestSerial)return;
      button.disabled=false;
      message(error.status===401||error.status===403
        ? '참여코드를 확인해 주세요.'
        : error.status===429
          ? '인증 요청이 많습니다. 잠시 후 다시 시도해 주세요.'
          : '서버에 연결할 수 없습니다. 다시 시도해 주세요.');
    }finally{window.BeaguLoading?.finish(loading);}
  });

  logoutButton.addEventListener('click',async()=>{
    const token=activeToken;
    ++requestSerial;
    clearSaved();
    lock('');
    if(token){
      try{await api('logout',{},token);}catch(_){
        // Always remove local access; server session also expires independently.
      }
    }
  });
  window.addEventListener('pageshow',event=>{
    if(event.persisted)void verifyStored();
  });
  window.addEventListener('beagu:participation-authenticated',event=>{
    const next=event.detail;
    if(next&&Number(next.level)>=1&&typeof next.token==='string'){
      ++requestSerial;
      unlock(next.token,Number(next.level));
    }
  });
  window.addEventListener('beagu:participation-logged-out',()=>{
    ++requestSerial;
    lock('');
  });
  window.addEventListener('beagu:level-state-updated',event=>{
    if(!activeToken)return;
    if(event.detail?.status==='0' && !session()){
      ++requestSerial;lock('인증이 만료되었습니다. 참여코드를 입력해 주세요.');return;
    }
    if(session()!==activeToken)return;
    const tier=event.detail?.status;
    if((tier==='1'||tier==='2')&&panel.getAttribute('data-challenge-verified-level')!==tier){
      authState(Number(tier));
      window.dispatchEvent(new Event('beagu:challenge-verified-level-changed'));
    }
  });
  void verifyStored();
})();
