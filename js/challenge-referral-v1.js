(() => {
  'use strict';
  const get = id => document.getElementById(id);
  const panel = get('challengeReferralPanel');
  const linkField = get('challengeReferralLink');
  const copyButton = get('copyChallengeReferral');
  const status = get('challengeReferralStatus');
  const progress = get('challengeReferralProgress');
  const referralCount = get('challengeReferralCount');
  const retry = get('challengeReferralRetry');
  const share = get('shareChallengeReferral'), countHint=get('challengeReferralCountHint'), meter=get('challengeMilestoneProgress');
  const fallback=get('togetherCopyFallback'),stateLabel=get('togetherReferralState');
  const title = get('challengeReferralTitle');
  const tag = get('challengeReferralTag');
  const identityPanel = get('challengeIdentityPanel');
  const identityTitle = get('challengeIdentityTitle');
  const identityTag = get('challengeIdentityTag');
  const identityReward = get('challengeIdentityReward');
  const copyIdentityCode = get('copyIdentityCode');
  const vipMedal = get('challengeVipMedal');
  const certificateLevelBanner = get('certificateLevelBanner');
  const certificate = get('certificate');
  const certificateMedal = get('certificateMedal');
  const certificateThanks = get('certificateThanks');
  if (![panel, linkField, copyButton, status, progress, title, tag,
      identityPanel, identityTitle, identityTag, identityReward, copyIdentityCode, referralCount].every(Boolean)) return;

  const endpoint = SUPABASE_URL + '/functions/v1/beagu-referral-link-v1';
  const sessionKey = 'beagu-level-session-v1';
  const deviceKey = 'beagu-referral-device-secret-v1';
  let active = false;
  let generation = 0;
  let currentLink = '';
  let lastIdentity = null;
  let upgraded = false;
  let lastReferrals = 0;
  let lastSnapshot = '', activeToken='';
  function renderMeter(count,known=true){
    if(countHint)countHint.textContent=known?'서버 확인 완료 기준':'현재 확인 중 · 숫자 미확정';
    if(meter){if(known)meter.setAttribute('aria-valuenow',String(Math.min(1,count)));else meter.removeAttribute('aria-valuenow');meter.dataset.complete=known&&count>=1?'true':'false';}
  }
  function renderState(earned,count=lastReferrals) {
    upgraded = earned === true;
    // Verified Lv.2 login can show its visual tier, but cannot activate a
    // separate personal code without a server-confirmed referral.
    const verifiedLoginLevel=Number(get('challengeAccessPanel')?.getAttribute?.('data-challenge-verified-level') || get('challengeAccessPanel')?.getAttribute?.('data-auth-level') || 0);
    const premiumVisual=upgraded || verifiedLoginLevel>=2;
    const account3=verifiedLoginLevel===2&&get('challengeAccessPanel')?.dataset?.accountLevel==='3';
    const visualTier=account3?3:premiumVisual?2:1;
    if(document.body)document.body.dataset.challengeTier=String(visualTier);
    const personalVerified=verifiedLoginLevel===2&&get('challengeAccessPanel')?.dataset?.provisional==='false';
    identityPanel.hidden=account3||(personalVerified&&!upgraded);
    const loginPanel=get('challengeLoginCodePanel');if(loginPanel)loginPanel.hidden=verifiedLoginLevel<2||(!account3&&upgraded);
    const benefits=get('togetherBenefitsTitle'),list=get('togetherBenefitsList');
    if(benefits&&list){benefits.textContent=account3?'Lv.3 전용 혜택':'Lv.2 전용 혜택';
      const items=account3?['학교별 상세자료 열람','커뮤니티 참여권 획득','좋아요 누르기']:['확장 학교 상세자료 열람','최신 조사자료 열람','행정동 공동주택 평균 공시가격 열람','좋아요 누르기'];
      list.replaceChildren(...items.map(item=>{const li=document.createElement('li');li.textContent=item;return li;}));}
    identityPanel.classList.toggle('is-lv2', upgraded);
    identityPanel.dataset.referralState = upgraded ? 'earned' : 'pending';
    identityTitle.textContent = upgraded ? '추천으로 발급된 개인 Lv.2 참여코드' :
      premiumVisual ? 'Lv.2 참여코드 확인 중' : 'Lv.2 참여코드(비활성)';
    identityTag.textContent = upgraded ? '✓ Lv.2 인증 완료' :
      premiumVisual ? 'Lv.2 로그인 완료 · 개인 코드 미확정' : '승급 대기';
    if(certificateLevelBanner)certificateLevelBanner.textContent = 'Lv.'+visualTier+' 챌린지 달성';
    if(certificate)certificate.dataset.level = String(visualTier);
    const medalTitle=certificateMedal?.querySelector?.('strong');if(medalTitle)medalTitle.textContent=account3?'LV.3 CHALLENGE HONOR':'LV.2 CHALLENGE HONOR';
    if(stateLabel){stateLabel.hidden=!!currentLink&&count<1&&verifiedLoginLevel<2&&!upgraded;stateLabel.textContent=account3?'Lv.3 챌린지 달성':verifiedLoginLevel>=2?'Lv.2 인증 완료':upgraded?'Lv.2 참여코드 활성화 · 인증정보에서 확인':!currentLink?'추천 확인 중':count>=1?'권한 활성화 확인 중':'';}
    if(meter)meter.hidden=premiumVisual;
    copyIdentityCode.hidden = account3||!upgraded;
    copyIdentityCode.disabled = account3||!upgraded || !lastIdentity;
    if(vipMedal)vipMedal.hidden=!upgraded;
    if(certificateMedal)certificateMedal.hidden=!premiumVisual;
    if(certificateThanks){
      const thanksCount=Math.floor(count/10)*10;
      const thanks=[
        '함께해 주신 선생님들 덕분에 변화가 시작됩니다.',
        '더 나은 교직문화를 위한 연대에 감사드립니다.',
        '선생님들의 목소리가 더 멀리 전해지고 있습니다.',
        '참여를 이어 주신 모든 분께 깊이 감사드립니다.'
      ];
      certificateThanks.hidden=thanksCount<10;
      certificateThanks.textContent=thanksCount>=10?
        '감사의 훈장 · 유효한 추천 '+thanksCount.toLocaleString('ko-KR')+'명 달성! '+thanks[(Math.floor(count/10)-1)%thanks.length]:'';
    }
    identityReward.hidden = !upgraded;
    identityReward.textContent = upgraded
      ? '🏅 공식 Lv.2 참여코드가 활성화되었습니다. 함께해 주셔서 감사합니다.'
      : '';
    copyIdentityCode.textContent = upgraded ? '코드 복사' : '번호 복사';

    // Invitation links must remain visible and copyable after promotion.
    title.textContent = '나의 전용 조사 링크';
    tag.textContent = '링크 공유하기';
    referralCount.textContent = currentLink ? count.toLocaleString('ko-KR') + '건' : '확인 중';
    panel.dataset.state = upgraded ? 'earned' : 'pending';
    linkField.value = currentLink;
    linkField.setAttribute('aria-label', '내 전용 조사 링크');
    copyButton.textContent = '링크 복사';
    renderMeter(count,Boolean(currentLink));
    if(share){share.hidden=!currentLink;share.disabled=!currentLink;}
  }
  function reset() {
    ++generation;
    currentLink = '';
    linkField.value = '';
    linkField.hidden = true;
    copyButton.hidden = true;
    copyButton.disabled = true;
    progress.textContent = '';progress.hidden=true;
    if(fallback){fallback.hidden=true;fallback.value='';}
    lastReferrals=0;lastSnapshot='';
    if(retry)retry.hidden=true;
    renderState(false,0);
    referralCount.textContent = '확인 중';renderMeter(0,false);
    status.textContent = '전용 조사 링크를 불러오고 있어요.';
  }
  function deviceSecret() {
    const existing = localStorage.getItem(deviceKey);
    if (existing && /^[a-f0-9]{64}$/.test(existing)) return existing;
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const created = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(deviceKey, created);
    return created;
  }
  async function load(detail) {
    if (!active) return;
    const seq = ++generation;
    const token = sessionStorage.getItem(sessionKey) || '';
    if (!/^[a-f0-9]{64}$/.test(token)||token!==activeToken) return;
    if (!detail || typeof detail.visitor !== 'string' ||
        typeof detail.code !== 'string') return;
    lastIdentity = {visitor: detail.visitor, code: detail.code};
    if (!upgraded) status.textContent = '추천 현황 확인 중이에요.';
    try {
      const response = await fetch(endpoint, {
        method: 'POST', cache: 'no-store',
        headers: {'Content-Type': 'application/json', 'X-Beagu-Session': token},
        body: JSON.stringify({
          action: 'issue', visitor: detail.visitor, identityCode: detail.code,
          deviceSecret: (()=>{try{return deviceSecret();}catch{return '';}})()
        })
      });
      if (!active || seq !== generation || sessionStorage.getItem(sessionKey)!==token) return;
      const payload = await response.json().catch(() => ({}));
      if (!active || seq !== generation || sessionStorage.getItem(sessionKey)!==token) return;
      if (response.status === 503 && payload.error === 'REFERRAL_NOT_READY') {
        if (!upgraded) status.textContent = '설문 연결을 확인 중이에요.';
        if(retry)retry.hidden=false;
        return;
      }
      if (!response.ok) {const error=Error(payload.error || 'UNAVAILABLE');error.status=response.status;throw error;}
      if (typeof payload.link !== 'string' ||
          !/^https:\/\/baeguindex\.com\/survey\.html\?ref=[a-f0-9]{64}$/.test(payload.link))
        throw Error('INVALID_LINK');
      const rawCount=payload.validReferrals;
      if(typeof rawCount!=='number'||!Number.isSafeInteger(rawCount)||rawCount<0)throw Error('INVALID_REFERRAL_COUNT');
      const count=rawCount;
      currentLink = typeof payload.shortLink === 'string' &&
        /^https:\/\/baeguindex\.com\/r\/#[A-Za-z0-9_-]{8}$/.test(payload.shortLink)
        ? payload.shortLink : payload.link;
      linkField.hidden = false;
      if(retry)retry.hidden=true;
      copyButton.hidden = false;
      copyButton.disabled = false;

      // Only a server-approved, credited referral can upgrade the PERSONAL CODE.
      // A link visit, self-declared level, or incomplete payload cannot do so.
      const promoted = Number(payload.level) === 2 &&
        count >= 1 && payload.provisional === true;
      const newlyPromoted = promoted && !upgraded;
      lastReferrals=count;
      renderState(promoted,count);
      if (newlyPromoted) window.dispatchEvent(new Event('beagu:level-state-change'));
      progress.hidden=true;
      progress.textContent = promoted?'Lv.2 달성 · 누적 유효 추천 '+count.toLocaleString('ko-KR')+'건':'유효한 추천 '+count.toLocaleString('ko-KR')+' / 1건 · '+(count>=1?'활성화 확인 중':'1건부터 Lv.2 활성화');
      const snapshot=(promoted?'2':'1')+':'+count;
      if(snapshot!==lastSnapshot){
        lastSnapshot=snapshot;
        window.dispatchEvent(new CustomEvent('beagu:referral-status-changed',
          {detail:{level:promoted?2:1,validReferrals:count}}));
      }
      const loginLevel = Number(get('challengeAccessPanel')?.getAttribute('data-auth-level') || 0);
      status.textContent = promoted
        ? 'Lv.2 참여코드와 전용 조사 링크가 확인되었습니다.'
        : loginLevel >= 2
          ? '동료의 설문 참여가 확인되면 추천이 누적됩니다.'
          : '동료에게 링크를 보내 1명 이상 참여하면 Lv.2로 레벨업됩니다.';
    } catch (error) {
      if (!active || seq !== generation || sessionStorage.getItem(sessionKey)!==token) return;
      if(error?.status===401||error?.status===403){reset();window.dispatchEvent(new CustomEvent('beagu:referral-status-changed',{detail:{level:1,validReferrals:0}}));}
      else if(countHint&&lastSnapshot)countHint.textContent='마지막으로 확인된 실적 · 새로고침 필요';
      if(retry)retry.hidden=false;
      if(error?.status===403)status.textContent='소유자 확인에 실패했습니다. 처음 코드를 발급받은 브라우저에서 확인하거나 저장 설정을 확인해 주세요.';
      else if(error?.status===401)status.textContent='인증이 만료되었습니다. 다시 인증한 뒤 링크를 확인해 주세요.';
      else status.textContent='전용 조사 링크를 불러오지 못했습니다. 연결을 확인하고 다시 시도해 주세요.';
    }
  }
  retry?.addEventListener('click',()=>{if(active&&lastIdentity)void load(lastIdentity)});
  copyButton.addEventListener('click', async () => {
    if (!active || !currentLink || sessionStorage.getItem(sessionKey)!==activeToken) return;
    try {
      await navigator.clipboard.writeText(currentLink);
      status.textContent = '전용 조사 링크를 복사했습니다.';
    } catch (_) {
      linkField.focus();
      linkField.select();
      status.textContent = '링크를 선택했습니다. 직접 복사해 주세요.';
    }
  });
  share?.addEventListener('click',async()=>{
    if(!active||!currentLink||sessionStorage.getItem(sessionKey)!==activeToken)return;
    const url=currentLink,token=activeToken;
    const stillCurrent=()=>active&&currentLink===url&&activeToken===token&&sessionStorage.getItem(sessionKey)===token;
    const text='2026 배구지수 조사에 함께해 주세요!\n\n선생님들의 참여로 전국 초등학교의 근무환경을 함께 기록하고 있습니다.\n\n아래 링크를 통해 조사에 참여하실 수 있습니다.\n\n'+url;
    try{
      if(!navigator.clipboard?.writeText)throw Error('UNAVAILABLE');
      await navigator.clipboard.writeText(text);
      if(!stillCurrent())return;
      status.textContent='공유 문구를 복사했습니다.';
      if(fallback){fallback.value='';fallback.hidden=true;}
    }catch(_){
      if(!stillCurrent())return;
      if(fallback){fallback.value=text;fallback.hidden=false;fallback.focus();fallback.select();}
      status.textContent='공유 문구를 선택했습니다. 직접 복사해 주세요.';
    }
  });
  window.addEventListener('beagu:challenge-access-granted', () => {const token=sessionStorage.getItem(sessionKey)||'';if(token!==activeToken){lastIdentity=null;activeToken=token;reset();}active=true;renderState(upgraded,lastReferrals);});
  window.addEventListener('beagu:challenge-access-revoked', () => {
    active = false; activeToken=''; lastIdentity = null; reset();
  });
  window.addEventListener('beagu:challenge-verified-level-changed',()=>{
    if(!active||sessionStorage.getItem(sessionKey)!==activeToken)return;
    const before=certificate?.dataset.level;
    renderState(upgraded,lastReferrals);
    if(before!==certificate?.dataset.level)window.dispatchEvent(new Event('beagu:referral-status-changed'));
  });
  window.addEventListener('beagu:identity-ready', e => {void load(e.detail);});
  window.addEventListener('focus', () => {
    if (active && lastIdentity) void load(lastIdentity);
  });
  document.addEventListener('visibilitychange', () => {
    if (active && lastIdentity && !document.hidden) void load(lastIdentity);
  });
  setInterval(() => {
    if (active && lastIdentity && !document.hidden) void load(lastIdentity);
  }, 60000);
  reset();
})();
