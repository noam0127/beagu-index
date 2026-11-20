(() => {
  'use strict';
  const get = id => document.getElementById(id);
  const panel = get('challengeReferralPanel');
  const linkField = get('challengeReferralLink');
  const copyButton = get('copyChallengeReferral');
  const status = get('challengeReferralStatus');
  const progress = get('challengeReferralProgress');
  const title = get('challengeReferralTitle');
  const tag = get('challengeReferralTag');
  const note = get('challengeReferralNote');
  const identityPanel = get('challengeIdentityPanel');
  const identityTitle = get('challengeIdentityTitle');
  const identityTag = get('challengeIdentityTag');
  const identityReward = get('challengeIdentityReward');
  const copyIdentityCode = get('copyIdentityCode');
  if (![panel, linkField, copyButton, status, progress, title, tag, note,
      identityPanel, identityTitle, identityTag, identityReward, copyIdentityCode].every(Boolean)) return;

  const endpoint = SUPABASE_URL + '/functions/v1/beagu-referral-link-v1';
  const sessionKey = 'beagu-level-session-v1';
  const deviceKey = 'beagu-referral-device-secret-v1';
  let active = false;
  let generation = 0;
  let currentLink = '';
  let lastIdentity = null;
  let upgraded = false;
  function renderState(earned) {
    upgraded = earned === true;
    // A name change never mints a new code. The existing personal code stays unchanged.
    identityPanel.classList.toggle('is-lv2', upgraded);
    identityPanel.dataset.referralState = upgraded ? 'earned' : 'pending';
    identityTitle.textContent = upgraded ? 'Lv2 참여코드' : '나의 고유번호';
    identityTag.textContent = upgraded ? 'Lv2(임시) 달성 ✦' : '개인 보관';
    identityReward.hidden = !upgraded;
    identityReward.textContent = upgraded
      ? '유효한 추천 설문 1건 확인 · Lv2 자격을 획득했습니다. 정식 계정 및 포스트잇 작성 권한은 별도입니다.'
      : '';
    copyIdentityCode.textContent = upgraded ? '코드 복사' : '번호 복사';

    // Invitation links must remain visible and copyable after promotion.
    title.textContent = '나의 전용 조사 링크';
    tag.textContent = upgraded ? '추천 1건 인정' : '추천 대기';
    panel.dataset.state = upgraded ? 'earned' : 'pending';
    linkField.value = currentLink;
    linkField.setAttribute('aria-label', '내 전용 조사 링크');
    copyButton.textContent = '링크 복사';
    note.textContent = upgraded
      ? '기존 고유번호는 Lv2 참여코드로 표시되며, 전용 조사 링크는 계속 사용할 수 있습니다.'
      : '기존 고유번호는 변경되지 않습니다. 유효한 추천 설문이 확인되어야 Lv2로 승급합니다.';
  }
  function reset() {
    ++generation;
    currentLink = '';
    linkField.value = '';
    linkField.hidden = true;
    copyButton.hidden = true;
    copyButton.disabled = true;
    progress.textContent = '';
    renderState(false);
    status.textContent = '전용 조사 링크 상태를 확인하고 있습니다.';
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
    if (!upgraded) status.textContent = '추천 참여 확인 중입니다.';
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
        if (!upgraded) status.textContent = '전용 조사 링크의 설문 연동을 확인 중입니다.';
        return;
      }
      if (!response.ok) throw Error(payload.error || 'UNAVAILABLE');
      if (typeof payload.link !== 'string' ||
          !/^https:\/\/baeguindex\.com\/survey\.html\?ref=[a-f0-9]{64}$/.test(payload.link))
        throw Error('INVALID_LINK');
      currentLink = typeof payload.shortLink === 'string' &&
        /^https:\/\/baeguindex\.com\/r\/#[A-Za-z0-9_-]{8}$/.test(payload.shortLink)
        ? payload.shortLink : payload.link;
      linkField.hidden = false;
      copyButton.hidden = false;
      copyButton.disabled = false;

      // Only a server-approved, credited referral can upgrade the PERSONAL CODE.
      // A link visit, self-declared level, or incomplete payload cannot do so.
      const promoted = Number(payload.level) === 2 &&
        Number(payload.validReferrals) >= 1 && payload.provisional === true;
      const newlyPromoted = promoted && !upgraded;
      renderState(promoted);
      if (newlyPromoted) window.dispatchEvent(new Event('beagu:level-state-change'));
      progress.textContent = promoted ? '유효한 추천 1 / 1건 · Lv2 승급 완료' : '유효한 추천 0 / 1건';
      status.textContent = promoted
        ? '추천 설문 참여가 확인되었습니다. 위의 고유번호가 Lv2 참여코드로 전환되었습니다.'
        : '전용 조사 링크가 준비되었습니다. 동료에게 공유할 수 있습니다.';
    } catch (_) {
      if (!active || seq !== generation) return;
      if (!upgraded) status.textContent = '추천 정보를 확인하지 못했습니다. 다시 열거나 소유자 인증을 확인해 주세요.';
    }
  }
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
  window.addEventListener('beagu:challenge-access-granted', () => {active = true;});
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
    if (active && !upgraded && lastIdentity && !document.hidden) void load(lastIdentity);
  }, 60000);
  reset();
})();
