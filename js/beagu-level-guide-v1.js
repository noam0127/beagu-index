(() => {
  'use strict';
  const indicator=document.getElementById('beaguLevelState');
  const current=document.getElementById('levelGuideCurrent');
  const status=document.getElementById('levelGuideStatus');
  if(!indicator || !current || !status)return;
  const cards=[...document.querySelectorAll('.beagu-level-guide-card[data-tier]')];
  const refresh=()=>{
    const raw=indicator.dataset.level;
    // data-level remains the separately verified participation tier, so
    // all legacy Lv2 resource guards keep working. memberLevel is cosmetic.
    const participation=/^[012]$/.test(raw)?Number(raw):null;
    const level=participation===2&&indicator.dataset.memberLevel==='3'?3:participation;
    current.textContent=level===null?(raw==='error'?'인증 상태 확인 불가':'인증 확인 중'):'현재 Lv.'+level;
    status.textContent=level===null?'레벨 확인 후 이용 가능한 자료가 표시됩니다.':(level===3?'Lv3 서버 인증이 확인되었습니다. 자료별 공개 승인은 별도로 필요합니다.':level===2?'Lv.2 추가 상세자료를 볼 수 있습니다.':level===1?'인증된 상세자료를 이용할 수 있습니다.':'기본 공개자료를 이용할 수 있습니다.');
    cards.forEach(card=>{
      const tier=Number(card.dataset.tier);
      const isCurrent=level===tier;
      card.classList.toggle('is-current',isCurrent);
      const flag=card.querySelector('.beagu-level-guide-state');
      if(flag){
        flag.hidden=level===null;
        if(level!==null)flag.textContent=isCurrent?'현재 레벨':tier<level?'이용 가능':'다음 단계';
      }
    });
  };
  window.addEventListener('beagu:level-state-updated',refresh);
  window.addEventListener('beagu:lv3-display-updated',refresh);
  refresh();
})();
