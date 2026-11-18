(() => {
  'use strict';
  // UI status only; all protected data are authorized by the server.
  try { if (window.self !== window.top) return; } catch (_) { return; }
  const indicator=document.getElementById('beaguLevelState');
  if (!indicator) return;
  const KEY='beagu-level-session-v1';
  const VERIFY_URL='https://snvzwrexuqavnfvzgxqj.supabase.co/functions/v1/beagu-level-api';
  let generation=0;
  let lastValidatedToken='';
  const getToken=()=>{
    try { return sessionStorage.getItem(KEY)||''; } catch (_) { return ''; }
  };
  const setState=(level,label,aria)=>{
    indicator.dataset.level=level;
    indicator.textContent=label;
    indicator.setAttribute('aria-label',aria);
    indicator.title=aria;
  };
  async function refresh(){
    const seq=++generation;
    const token=getToken();
    if(!token){
      lastValidatedToken='';
      setState('0','Lv.0','Lv.0 공개 열람 · 눌러서 Lv.1 인증');
      return;
    }
    if(token!==lastValidatedToken){
      setState('checking','확인 중','인증 상태를 확인하는 중');
    }
    try{
      const response=await fetch(VERIFY_URL,{
        method:'POST',cache:'no-store',
        headers:{'Content-Type':'application/json','X-Beagu-Session':token},
        body:JSON.stringify({action:'verify'})
      });
      if(seq!==generation||getToken()!==token)return;
      if(response.status===401||response.status===403){
        lastValidatedToken='';
        try{if(getToken()===token)sessionStorage.removeItem(KEY);}catch(_){}
        setState('0','Lv.0','Lv.0 공개 열람 · 인증 만료, 다시 인증하기');
        return;
      }
      if(!response.ok)throw Error('AUTH_CHECK_UNAVAILABLE');
      const result=await response.json();
      if(seq!==generation||getToken()!==token)return;
      if(Number.isInteger(result?.level)&&result.level>=1){
        lastValidatedToken=token;
        setState('1','Lv.1','Lv.1 참여자 인증됨 · 인증된 학교 검색으로 이동');
      }else{
        lastValidatedToken='';
        setState('0','Lv.0','Lv.0 공개 열람 · 눌러서 Lv.1 인증');
      }
    }catch(_){
      if(seq!==generation)return;
      lastValidatedToken='';
      setState('error','확인 불가','인증 상태를 확인할 수 없습니다 · 눌러서 인증 화면으로 이동');
    }
  }
  const refreshIfVisible=()=>{if(!document.hidden)void refresh();};
  window.addEventListener('beagu:level-state-change',refresh);
  window.addEventListener('beagu:challenge-access-granted',refresh);
  window.addEventListener('beagu:challenge-access-revoked',refresh);
  window.addEventListener('pageshow',event=>{if(event.persisted)void refresh();});
  window.addEventListener('focus',refreshIfVisible);
  document.addEventListener('visibilitychange',refreshIfVisible);
  void refresh();
})();
