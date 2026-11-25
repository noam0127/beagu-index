(() => {
  'use strict';
  // UI status only; all protected data are authorized by the server.
  try { if (window.self !== window.top) return; } catch (_) { return; }
  const indicator=document.getElementById('beaguLevelState');
  if (!indicator) return;
  // Move the existing badge inside the shared header; no duplicate badge or authentication.
  // CSS grid aligns it with the logo, while menu links occupy their own mobile row.
  const badgeContainer=indicator.closest('.beagu-level-state-container');
  const headerInner=document.querySelector('.beagu-unified-header .beagu-unified-inner');
  if(badgeContainer&&headerInner&&badgeContainer.parentElement!==headerInner)
    headerInner.appendChild(badgeContainer);
  indicator.setAttribute('href','levels.html');
  const KEY='beagu-level-session-v1';
  const VERIFY_URL='https://snvzwrexuqavnfvzgxqj.supabase.co/functions/v1/beagu-level-api';
  let generation=0;
  let lastValidatedToken='';
  const getToken=()=>{
    try { return sessionStorage.getItem(KEY)||''; } catch (_) { return ''; }
  };
  // The same auth card remains in place at Lv.0, Lv.1 and Lv.2.
  // Use only the server-verified badge event; never upgrade from a typed code alone.
  const syncLevelCards=(raw,provisional)=>{
    const tier=/^[012]$/.test(raw)?Number(raw):null;
    const badgeLabel=tier===0?'미인증':tier===1?'✓ Lv1 · 설문 참여 완료'
      :tier===2?'♛ Lv2 · 챌린지 달성'
      :raw==='checking'?'확인 중':'확인 불가';
    const cards=[
      ['lv1QuickAuth','lv1QuickBadge'],
      ['loginPanel',null],
      ['compareLv1AuthPanel','compareLv1Badge'],
      ['challengeAccessPanel','challengeAccessBadge'],
      [null,null]
    ];
    for(const [id,badgeId] of cards){
      const card=id?document.getElementById(id):document.querySelector('.beagu-levelup-status');
      if(!card)continue;
      card.dataset.authLevel=tier===null?raw:String(tier);
      card.dataset.provisional=provisional?'true':'false';
      const badge=badgeId?document.getElementById(badgeId):
        card.querySelector('.beagu-auth-badge,.tier-pill');
      if(badge){
        badge.textContent=badgeLabel;
        badge.classList.toggle('is-authenticated',tier!==null&&tier>=1);
      }

    }
  };
  const setState=(level,label,aria,provisional=false)=>{
    indicator.dataset.provisional=provisional?'true':'false';
    indicator.dataset.level=level;
    indicator.textContent=label;
    indicator.setAttribute('aria-label',aria);
    indicator.title=aria;
    syncLevelCards(level,provisional);
    window.dispatchEvent(new CustomEvent('beagu:level-state-updated', {detail:{level:Number.isInteger(Number(level))?Number(level):null,status:level,provisional}}));
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
        const provisional=tier===2&&result.provisional===true;
        const label='Lv.'+tier;
        setState(String(tier),label,'현재 '+label+' · 레벨 안내 보기',provisional);
      }else{
        lastValidatedToken='';
        try{if(getToken()===token)sessionStorage.removeItem(KEY);}catch(_){}
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

  // Shared Lv1/Lv2 participation dialog observes this server-verified event;
  // data.provisional is retained for legacy access restrictions.
  void refresh();
})();

/* Homecourt vocabulary: presentation only, original routes and auth unchanged. */
(()=>{const rename=()=>{document.querySelectorAll('.beagu-unified-nav a').forEach(a=>{const route=(a.getAttribute('href')||'').split('?')[0];const labels={'index.html':'홈','search.html':'검색','search-lv1.html':'검색','statistics.html':'비교','games.html':'플레이','challenge.html':'챌린지'};if(labels[route])a.textContent=labels[route];if(route==='postit.html'&&a.textContent.trim()==='포스트잇')a.textContent='라커룸';});};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',rename,{once:true});else rename();})();
