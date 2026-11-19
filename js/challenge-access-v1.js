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
  function lock(text=''){
    activeToken='';
    protectedArea.hidden=true;
    panel.hidden=false;
    form.hidden=false;
    logoutButton.hidden=true;
    input.value='';
    button.disabled=false;
    message(text);
    window.dispatchEvent(new Event('beagu:challenge-access-revoked'));
  }
  function unlock(token){
    if(!token)return;
    activeToken=token;
    panel.hidden=false;
    form.hidden=true;
    protectedArea.hidden=false;
    logoutButton.hidden=false;
    input.value='';
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
    message('Lv.1 인증 상태 확인 중…');
    try{
      const result=await api('verify',{},token);
      if(serial!==requestSerial)return;
      if(!isLevelOne(result)){
        clearSaved();
        lock('Lv.1 인증이 필요합니다.');
        return;
      }
      unlock(token);
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
      unlock(result.token);
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
  void verifyStored();
})();
