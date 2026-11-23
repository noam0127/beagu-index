(() => {
  'use strict';
  const get = id => document.getElementById(id);
  const panel = get('challengeReferralPanel');
  const linkField = get('challengeReferralLink');
  const copyButton = get('copyChallengeReferral');
  const status = get('challengeReferralStatus');
  const progress = get('challengeReferralProgress');
  const retry = get('challengeReferralRetry');
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
    identityTitle.textContent = upgraded ? 'Lv.2 참여코드' : '나의 고유번호';
    identityTag.textContent = upgraded ? 'Lv.2 달성 ✦' : '개인 보관';
    identityReward.hidden = !upgraded;
    identityReward.textContent = upgraded
      ? 'Lv.2 달성! 위 코드를 참여코드로 사용하세요.'
      : '';
    copyIdentityCode.textContent = upgraded ? '코드 복사' : '번호 복사';

    // Invitation links must remain visible and copyable after promotion.
    title.textContent = '나의 전용 조사 링크';
    tag.textContent = upgraded ? '추천 1건 확인' : '링크 공유하기';
    panel.dataset.state = upgraded ? 'earned' : 'pending';
    linkField.value = currentLink;
    linkField.setAttribute('aria-label', '내 전용 조사 링크');
    copyButton.textContent = '링크 복사';
    note.textContent = upgraded
      ? '번호는 그대로 유지돼요. 전용 링크도 계속 공유할 수 있어요.'
      : '유효한 추천 1건이 확인되면 기존 번호가 Lv.2 참여코드로 바뀝니다.';
  }
  function reset() {
    ++generation;
    currentLink = '';
    linkField.value = '';
    linkField.hidden = true;
    copyButton.hidden = true;
    copyButton.disabled = true;
    progress.textContent = '';
    if(retry)retry.hidden=true;
    renderState(false);
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
      const promoted = Number(payload.level) === 2 &&
        Number(payload.validReferrals) >= 1 && payload.provisional === true;
      const newlyPromoted = promoted && !upgraded;
      renderState(promoted);
      if (newlyPromoted) window.dispatchEvent(new Event('beagu:level-state-change'));
      progress.textContent = promoted ? '유효한 추천 1 / 1건 · Lv2 승급 완료' : '유효한 추천 0 / 1건';
      status.textContent = promoted
        ? 'Lv.2 달성! 기존 고유번호를 참여코드로 사용하세요.'
        : '동료에게 링크를 보내세요. 설문 참여 1건이 확인되면 Lv.2!';
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
