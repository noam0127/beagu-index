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
  // The same auth card remains in place at Lv.0, Lv.1 and Lv.2.
  // Use only the server-verified badge event; never upgrade from a typed code alone.
  const syncLevelCards=(raw,provisional)=>{
    const tier=/^[012]$/.test(raw)?Number(raw):null;
    const badgeLabel=tier===0?'미인증':tier===1?'Lv.1 인증됨'
      :tier===2?(provisional?'Lv.2(임시)':'Lv.2 인증됨')
      :raw==='checking'?'확인 중':'확인 불가';
    const buttonLabel=tier===1?'고유번호 인증':tier===2?'인증 완료':'레벨업 인증';
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
      const action=card.querySelector('.beagu-levelup-trigger[data-beagu-open-levelup]');
      if(action){
        action.textContent=buttonLabel;
        action.disabled=tier===2||raw==='checking';
        action.classList.toggle('is-complete',tier===2);
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
        const label=provisional?'Lv.2(임시)':'Lv.'+tier;
        setState(String(tier),label,'현재 '+label+' · 레벨 안내 보기',provisional);
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

  // All public Lv.1 gates share one server-backed level-up entry dialog.
  const overlay=document.createElement('div');
  overlay.id='beaguLevelUpOverlay';
  overlay.className='beagu-levelup-overlay';
  overlay.hidden=true;
  overlay.style.display='none';
  overlay.innerHTML='<section class="beagu-levelup-dialog" role="dialog" aria-modal="true" aria-labelledby="beaguLevelUpTitle">'+
    '<button class="beagu-levelup-close" type="button" aria-label="닫기">×</button>'+
    '<span class="beagu-levelup-eyebrow">BAEGUINDEX · LEVEL UP</span>'+
    '<h2 id="beaguLevelUpTitle">레벨업 인증</h2>'+
    '<p class="beagu-levelup-description">참여코드 또는 챌린지 고유번호를 입력하세요.</p>'+
    '<form id="beaguLevelUpForm" autocomplete="off"><label for="beaguLevelUpCode">인증번호</label>'+
    '<div class="beagu-levelup-inputrow"><input id="beaguLevelUpCode" type="password" minlength="8" maxlength="120" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="참여코드 · 고유번호" required>'+
    '<button id="beaguLevelUpToggle" type="button" aria-label="번호 표시">표시</button></div>'+
    '<button id="beaguLevelUpSubmit" class="beagu-levelup-submit" type="submit">레벨업하기</button></form>'+
    '<p id="beaguLevelUpFeedback" class="beagu-levelup-feedback" role="status" aria-live="polite"></p>'+
    '<div class="beagu-levelup-links"><a href="survey.html">Lv.1 · 2026 참가 ↗</a><a href="challenge.html">Lv.2 · 챌린지 ↗</a></div>'+
    '<p class="beagu-levelup-note">고유번호로 인증하면 Lv.2(임시)로 표시됩니다. 포스트잇 작성은 추후 정식 로그인 계정 생성 후 이용할 수 있습니다.</p>'+
    '</section>';
  document.body.appendChild(overlay);
  const codeInput=overlay.querySelector('#beaguLevelUpCode');
  const submit=overlay.querySelector('#beaguLevelUpSubmit');
  const feedback=overlay.querySelector('#beaguLevelUpFeedback');
  const triggerSelector='[data-beagu-open-levelup]';
  let previousFocus=null;
  let sending=false;
  function openLevelUp(){
    if(sending)return;
    const upgrading=indicator.dataset.level==='1';
    overlay.querySelector('#beaguLevelUpTitle').textContent=upgrading?'고유번호 인증':'레벨업 인증';
    overlay.querySelector('.beagu-levelup-description').textContent=upgrading
      ?'챌린지에서 받은 고유번호를 입력해 Lv.2(임시)로 인증하세요.'
      :'2026 참여코드 또는 챌린지 고유번호를 입력하세요.';
    overlay.querySelector('#beaguLevelUpSubmit').textContent=upgrading?'고유번호 인증':'레벨업하기';
    codeInput.placeholder=upgrading?'챌린지 고유번호':'참여코드 · 고유번호';
    previousFocus=document.activeElement;
    feedback.textContent='';
    codeInput.value='';
    codeInput.type='password';
    overlay.querySelector('#beaguLevelUpToggle').textContent='표시';
    overlay.hidden=false;
    overlay.style.display='flex';
    document.body.classList.add('beagu-levelup-open');
    codeInput.focus();
  }
  function closeLevelUp(){
    if(sending)return;
    overlay.hidden=true;
    overlay.style.display='none';
    document.body.classList.remove('beagu-levelup-open');
    codeInput.value='';
    if(previousFocus?.isConnected)previousFocus.focus();
  }
  window.BeaguLevelUp=Object.freeze({open:openLevelUp,close:closeLevelUp});
  overlay.querySelector('.beagu-levelup-close').addEventListener('click',closeLevelUp);
  overlay.addEventListener('click',e=>{if(e.target===overlay)closeLevelUp();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!overlay.hidden)closeLevelUp();});
  overlay.querySelector('#beaguLevelUpToggle').addEventListener('click',e=>{
    const show=codeInput.type==='password';
    codeInput.type=show?'text':'password';
    e.currentTarget.textContent=show?'숨기기':'표시';
    codeInput.focus();
  });
  overlay.querySelector('#beaguLevelUpForm').addEventListener('submit',async e=>{
    e.preventDefault();
    if(sending)return;
    const code=codeInput.value.trim();
    if(!/^[A-Za-z0-9-]{8,120}$/.test(code)){
      feedback.textContent='번호를 다시 확인해 주세요.';
      return;
    }
    sending=true;
    submit.disabled=true;
    feedback.textContent='인증번호를 확인하고 있습니다…';
    try{
      const response=await fetch(VERIFY_URL,{
        method:'POST',cache:'no-store',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'login',code})
      });
      const result=await response.json().catch(()=>({}));
      if(!response.ok||!Number.isInteger(result.level)||result.level<1||!(/^[a-f0-9]{64}$/).test(result.token||'')){
        feedback.textContent=response.status===429?'요청이 많습니다. 잠시 후 다시 시도해 주세요.':
          response.status===503?'인증 서버를 확인할 수 없습니다. 다시 시도해 주세요.':'번호가 올바르지 않습니다.';
        return;
      }
      sessionStorage.setItem(KEY,result.token);
      codeInput.value='';
      overlay.hidden=true;
      overlay.style.display='none';
      document.body.classList.remove('beagu-levelup-open');
      window.dispatchEvent(new Event('beagu:level-state-change'));
      window.dispatchEvent(new Event('beagu:challenge-access-granted'));
      await refresh();
      // Existing protected views initialize their data on page load.
      window.location.reload();
    }catch(_){
      feedback.textContent='서버에 연결할 수 없습니다. 다시 시도해 주세요.';
    }finally{
      sending=false;
      submit.disabled=false;
    }
  });
  const legacyForms=[
    '#lv1QuickForm','#loginForm','#compareLv1Form',
    '#challengeAccessForm','#tierCodeForm','[data-game-lv1-form]'
  ];
  for(const form of document.querySelectorAll(legacyForms.join(','))){
    form.style.setProperty('display','none','important');
    const button=document.createElement('button');
    button.type='button';
    button.className='beagu-levelup-trigger';
    button.textContent='레벨업 인증';
    button.setAttribute('data-beagu-open-levelup','');
    form.insertAdjacentElement('afterend',button);
  }
  for(const id of ['lv1QuickTitle','loginTitle','compareLv1Title','challengeAccessTitle','teacher-run-lv1-title']){
    const heading=document.getElementById(id);
    if(heading)heading.textContent='레벨업 인증';
  }
  for(const oldHelp of document.querySelectorAll('.beagu-auth-card .beagu-auth-help,.challenge-access-help')){
    oldHelp.innerHTML='<a href="survey.html">Lv.1 · 2026 참가</a><span aria-hidden="true"> · </span>'+
      '<a href="challenge.html">Lv.2 · 챌린지</a>';
  }
  for(const a of document.querySelectorAll('a')){
    if(/Lv\.1 인증하기|Lv\.1 인증 후 이용|참여코드 인증하기/.test(a.textContent||'')){
      a.textContent='레벨업 인증';
      a.setAttribute('href','#beagu-levelup');
      a.setAttribute('data-beagu-open-levelup','');
    }
  }
  document.addEventListener('click',e=>{
    const trigger=e.target.closest(triggerSelector);
    if(!trigger)return;
    e.preventDefault();
    openLevelUp();
  });

  void refresh();
})();
