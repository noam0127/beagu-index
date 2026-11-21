/* Stage29: visual achievement summary backed by the already-verified
 * participation header and the separately verified Lv3 session.
 * Never grant access, persist tiers, or promote from code format alone. */
(()=>{
  'use strict';
  const host=document.getElementById('challengeLevelAchievements');
  const badge=document.getElementById('beaguLevelState');
  if(!host||!badge)return;
  const summary=document.getElementById('challengeAchievementsSummary');
  const names={
    1:host.querySelector('[data-challenge-achievement="1"]'),
    2:host.querySelector('[data-challenge-achievement="2"]'),
    3:host.querySelector('[data-challenge-achievement="3"]')
  };
  if(!summary||Object.values(names).some(node=>!node))return;
  // The shared header changes these fields only after a server API response.
  // No new browser-to-Supabase request or local-only privilege inference.
  const verifiedLevel=()=>{
    const participation=badge.dataset.level;
    if(!['0','1','2'].includes(participation))return null;
    return participation==='2'&&badge.dataset.memberLevel==='3'
      ?3:Number(participation);
  };
  function paint(level,unknownState='checking'){
    host.dataset.verifiedTier=level===null?'unknown':String(level);
    host.dataset.status=level===null?unknownState:'verified';
    for(const tier of [1,2,3]){
      const item=names[tier];
      const state=item.querySelector('[data-achievement-status]');
      const reached=level!==null&&level>=tier;
      item.dataset.achieved=reached?'true':'false';
      // Unknown does not mean "not achieved": no stale success badge while
      // network or session verification is still unresolved.
      const text=level===null
        ?unknownState==='error'?'확인 불가':'확인 중'
        :reached?'달성':'미달성';
      state.textContent=text;
      state.setAttribute('aria-label','Lv.'+tier+' '+text);
    }
    summary.textContent=level===null
      ?unknownState==='error'
        ?'서버 인증 현황을 확인할 수 없습니다.'
        :'서버 인증 현황 확인 중'
      :level===0?'참여코드로 인증하면 달성 현황이 표시됩니다.'
      :'현재 서버 확인 단계: Lv.'+level;
  }
  function repaint(){
    const level=verifiedLevel();
    const unknownState=badge.dataset.level==='error'?'error':'checking';
    paint(level,unknownState);
  }
  // Restrict Lv3 "달성" to the badge's independent server-confirmed
  // memberLevel=3; a synthetic achievement event alone cannot set it.
  window.addEventListener('beagu:level-state-updated',repaint);
  window.addEventListener('beagu:lv3-display-updated',repaint);
  // Immediately clear stale achievements on logout even before a pending
  // verification request or browser restore has completed.
  window.addEventListener('beagu:challenge-access-revoked',()=>paint(null));
  window.addEventListener('beagu:participation-logged-out',()=>paint(null));
  window.addEventListener('pageshow',event=>{
    if(event.persisted)paint(null);
  });
  paint(null);
  if(document.readyState==='loading')
    document.addEventListener('DOMContentLoaded',repaint,{once:true});
  else repaint();
})();
