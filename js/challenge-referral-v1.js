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
  let lastSnapshot = '';
  function renderState(earned,count=lastReferrals) {
    upgraded = earned === true;
    // Verified Lv.2 login can show its visual tier, but cannot activate a
    // separate personal code without a server-confirmed referral.
    const verifiedLoginLevel=Number(get('challengeAccessPanel')?.getAttribute?.('data-auth-level') || 0);
    const premiumVisual=upgraded || verifiedLoginLevel>=2;
    identityPanel.classList.toggle('is-lv2', premiumVisual);
    identityPanel.dataset.referralState = upgraded ? 'earned' : 'pending';
    identityTitle.textContent = upgraded ? 'Lv.2 참여코드' :
      premiumVisual ? 'Lv.2 인증 회원 · 참여코드' : 'Lv.2 참여코드(비활성)';
    identityTag.textContent = upgraded ? '✓ Lv.2 인증 완료' :
      premiumVisual ? '✓ Lv.2 로그인 완료' : '승급 대기';
    // Captured tier follows a verified Lv.2 session or credited referral;
    // the personal code stays inactive until its own referral is confirmed.
    if(certificateLevelBanner)certificateLevelBanner.textContent = premiumVisual ? 'Lv.2 챌린지 달성' : 'Lv.1 챌린지 달성';
    if(certificate)certificate.dataset.level = premiumVisual ? '2' : '1';
    copyIdentityCode.hidden = !upgraded;
    copyIdentityCode.disabled = !upgraded || !lastIdentity;
    if(vipMedal)vipMedal.hidden=!premiumVisual;
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
    referralCount.textContent = count.toLocaleString('ko-KR') + '건';
    panel.dataset.state = upgraded ? 'earned' : 'pending';
    linkField.value = currentLink;
    linkField.setAttribute('aria-label', '내 전용 조사 링크');
    copyButton.textContent = '링크 복사';
  }
  function reset() {
    ++generation;
    currentLink = '';
    linkField.value = '';
    linkField.hidden = true;
    copyButton.hidden = true;
    copyButton.disabled = true;
    progress.textContent = '';
    lastReferrals=0;lastSnapshot='';
    if(retry)retry.hidden=true;
    renderState(false,0);
    referralCount.textContent = '확인 중';
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
    if (!/^[a-f0-9]{64}$/.test(token)) return;
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
          deviceSecret: deviceSecret()
        })
      });
      if (!active || seq !== generation) return;
      const payload = await response.json().catch(() => ({}));
      if (response.status === 503 && payload.error === 'REFERRAL_NOT_READY') {
        if (!upgraded) status.textContent = '설문 연결을 확인 중이에요.';
        return;
      }
      if (!response.ok) {const error=Error(payload.error || 'UNAVAILABLE');error.status=response.status;throw error;}
      if (typeof payload.link !== 'string' ||
          !/^https:\/\/baeguindex\.com\/survey\.html\?ref=[a-f0-9]{64}$/.test(payload.link))
        throw Error('INVALID_LINK');
      currentLink = typeof payload.shortLink === 'string' &&
        /^https:\/\/baeguindex\.com\/r\/#[A-Za-z0-9_-]{8}$/.test(payload.shortLink)
        ? payload.shortLink : payload.link;
      linkField.hidden = false;
      if(retry)retry.hidden=true;
      copyButton.hidden = false;
      copyButton.disabled = false;

      // Only a server-approved, credited referral can upgrade the PERSONAL CODE.
      // A link visit, self-declared level, or incomplete payload cannot do so.
      const rawCount=Number(payload.validReferrals);
      const count=Number.isSafeInteger(rawCount)&&rawCount>=0?rawCount:0;
      const promoted = Number(payload.level) === 2 &&
        count >= 1 && payload.provisional === true;
      const newlyPromoted = promoted && !upgraded;
      lastReferrals=count;
      renderState(promoted,count);
      if (newlyPromoted) window.dispatchEvent(new Event('beagu:level-state-change'));
      progress.textContent = '유효한 추천 '+count.toLocaleString('ko-KR')+' / 1건 · '+(promoted?'Lv.2 활성화':'1건부터 Lv.2 활성화');
      const snapshot=(promoted?'2':'1')+':'+count;
      if(snapshot!==lastSnapshot){
        lastSnapshot=snapshot;
        window.dispatchEvent(new CustomEvent('beagu:referral-status-changed',
          {detail:{level:promoted?2:1,validReferrals:count}}));
      }
      const loginLevel = Number(get('challengeAccessPanel')?.getAttribute('data-auth-level') || 0);
      status.textContent = promoted
        ? '동료에게 링크를 보내세요. 설문 참여가 확인되면 추천이 누적됩니다.'
        : loginLevel >= 2
          ? 'Lv.2 로그인은 확인됐습니다. 개인 참여코드는 추천 1건 확인 후 별도로 활성화됩니다.'
          : '동료에게 링크를 보내세요. 설문 참여가 확인되면 추천이 누적됩니다.';
    } catch (error) {
      if (!active || seq !== generation) return;
      if(retry)retry.hidden=false;
      if(error?.status===403)status.textContent='소유자 확인에 실패했습니다. 처음 코드를 발급받은 브라우저에서 확인하거나 저장 설정을 확인해 주세요.';
      else if(error?.status===401)status.textContent='인증이 만료되었습니다. 다시 인증한 뒤 링크를 확인해 주세요.';
      else status.textContent='전용 조사 링크를 불러오지 못했습니다. 연결을 확인하고 다시 시도해 주세요.';
    }
  }
  retry?.addEventListener('click',()=>{if(active&&lastIdentity)void load(lastIdentity)});
  copyButton.addEventListener('click', async () => {
    if (!currentLink) return;
    try {
      await navigator.clipboard.writeText(currentLink);
      status.textContent = '전용 조사 링크를 복사했습니다.';
    } catch (_) {
      linkField.focus();
      linkField.select();
      status.textContent = '링크를 선택했습니다. 직접 복사해 주세요.';
    }
  });
  window.addEventListener('beagu:challenge-access-granted', () => {
    active = true;
    renderState(upgraded,lastReferrals);
  });
  window.addEventListener('beagu:challenge-access-revoked', () => {
    active = false; lastIdentity = null; reset();
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
