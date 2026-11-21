/* Stage31: homepage benefit descriptions mirror verified server-level UI.
 * This is a guide, NOT an authorization gate, entitlement cache, or
 * evidence that unreviewed 2026 data have been released.
 */
(()=>{
  'use strict';
  const host=document.getElementById('homeTierBenefits');
  const indicator=document.getElementById('beaguLevelState');
  if(!host||!indicator)return;
  const summary=document.getElementById('homeTierSummary');
  const detail=document.getElementById('homeTierDetail');
  if(!summary||!detail)return;
  const cards=new Map([0,1,2,3].map(level=>[
    level,host.querySelector('[data-home-tier="'+level+'"]')
  ]));
  if([...cards.values()].some(card=>!card))return;

  const descriptions=Object.freeze({
    0:'공개 학교정보와 선생님배구를 이용할 수 있습니다. 참여코드를 입력하면 더 많은 정보를 확인할 수 있습니다.',
    1:'참여 인증이 확인되었습니다. 승인된 학교 상세정보와 Lv.1 기능을 확인할 수 있습니다. 공시지가 정렬은 아직 잠겨 있습니다.',
    2:'유효한 추천이 확인되었습니다. 공시지가 정렬과 Lv.2 전용 포스트잇을 안내합니다. 포스트잇 작성은 별도 정식 계정 인증이 필요합니다.',
    3:'Lv.3 계정의 별도 서버 인증이 확인되었습니다. 공개 심사를 마친 2026 최신 학교정보와 자료만 서버 권한에 따라 열람할 수 있습니다.'
  });
  let lastLevel=null;
  let lastStatus='checking';

  const verifiedBadgeLevel=()=>{
    const raw=indicator.dataset.level;
    if(!['0','1','2'].includes(raw))return null;
    // Lv.3 requires independently confirmed account Auth + device proof;
    // display-level badge is NOT an authorization credential.
    return raw==='2'&&indicator.dataset.memberLevel==='3'
      ?3:Number(raw);
  };
  const render=(level,status='checking')=>{
    const verified=Number.isInteger(level)&&level>=0&&level<=3;
    lastLevel=verified?level:null;
    lastStatus=verified?'verified':status==='error'?'error':'checking';
    host.dataset.currentTier=verified?String(level):'unknown';
    host.dataset.verification=lastStatus;
    for(const [n,card] of cards){
      const text=card.querySelector('[data-home-tier-state]');
      const state=!verified
        ?lastStatus==='error'?'확인 불가':'확인 중'
        :n===level?'현재 단계'
        :n<level?'이용 가능'
        :'추가 인증 필요';
      card.dataset.tierState=!verified?'pending':n===level?'current':n<level?'available':'locked';
      if(text)text.textContent=state;
      card.setAttribute('aria-current',verified&&n===level?'step':'false');
    }
    if(!verified){
      summary.textContent=lastStatus==='error'?'인증 상태 확인 불가':'인증 상태 확인 중';
      detail.textContent=lastStatus==='error'
        ?'서버 인증을 확인할 수 없습니다. 이전 단계의 이용 권한을 추정하지 않습니다.'
        :'이용 가능한 단계는 서버 인증 확인 후 표시됩니다.';
    }else{
      summary.textContent='현재 확인된 단계: Lv.'+level;
      detail.textContent=descriptions[level];
    }
  };
  const paint=()=>{
    const level=verifiedBadgeLevel();
    render(level,indicator.dataset.level==='error'?'error':'checking');
  };
  window.addEventListener('beagu:level-state-updated',paint);
  window.addEventListener('beagu:lv3-display-updated',paint);
  // Invalidate immediately rather than trusting a previously verified DOM
  // during logout or an in-flight account/session replacement.
  window.addEventListener('beagu:participation-logged-out',()=>render(null));
  window.addEventListener('beagu:challenge-access-revoked',()=>render(null));
  window.addEventListener('pageshow',event=>{
    if(event.persisted)render(null);
  });
  render(null);
  if(document.readyState==='loading')
    document.addEventListener('DOMContentLoaded',paint,{once:true});
  else paint();
})();
