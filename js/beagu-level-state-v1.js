(() => {
  'use strict';
  // UI status only; all protected data are authorized by the server.
  try { if (window.self !== window.top) return; } catch (_) { return; }
  const indicator=document.getElementById('beaguLevelState');
  if (!indicator) return;
  indicator.setAttribute('href','levels.html');
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
    window.dispatchEvent(new CustomEvent('beagu:level-state-updated', {detail:{level:Number.isInteger(Number(level))?Number(level):null,status:level}}));
  };
  async function refresh(){
    const seq=++generation;
    const token=getToken();
    if(!token){
      lastValidatedToken='';
      setState('0','Lv.0','현재 Lv.0 · 레벨 안내 보기');
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
        setState('0','Lv.0','현재 Lv.0 · 인증 만료 · 레벨 안내 보기');
        return;
      }
      if(!response.ok)throw Error('AUTH_CHECK_UNAVAILABLE');
      const result=await response.json();
      if(seq!==generation||getToken()!==token)return;
      if(Number.isInteger(result?.level)&&result.level>=1){
        lastValidatedToken=token;
        const tier=result.level>=2?2:1;
        setState(String(tier),'Lv.'+tier,'현재 Lv.'+tier+' · 레벨 안내 보기');
      }else{
        lastValidatedToken='';
        setState('0','Lv.0','현재 Lv.0 · 레벨 안내 보기');
      }
    }catch(_){
      if(seq!==generation)return;
      lastValidatedToken='';
      setState('error','확인 불가','인증 상태 확인 불가 · 레벨 안내 보기');
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
