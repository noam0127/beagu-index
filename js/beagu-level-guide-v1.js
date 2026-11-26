(() => {
  'use strict';
  const indicator=document.getElementById('beaguLevelState');
  const current=document.getElementById('levelGuideCurrent');
  const status=document.getElementById('levelGuideStatus');
  if(!indicator || !current || !status)return;
  const cards=[...document.querySelectorAll('.beagu-level-guide-card[data-tier]')];
  const refresh=()=>{
    const raw=indicator.dataset.level;
    const level=/^[012]$/.test(raw)?Number(raw):null;
    current.textContent=level===null?(raw==='error'?'인증 상태 확인 불가':'인증 확인 중'):'현재 Lv.'+level;
    status.textContent=level===null?'레벨 확인 후 이용 가능한 자료가 표시됩니다.':(level===2?'Lv.2 추가 상세자료를 볼 수 있습니다.':level===1?'인증된 상세자료를 이용할 수 있습니다.':'기본 공개자료를 이용할 수 있습니다.');
    cards.forEach(card=>{
      if(card.hidden)return;
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
  refresh();
})();
