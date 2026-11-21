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
  let canonicalLink = '';
  let lastIdentity = null;
  let upgraded = false;
  let ownResponseVerified = false;
  function renderState(earned) {
    upgraded = earned === true;
    // A name change never mints a new code. The existing personal code stays unchanged.
    identityPanel.classList.toggle('is-lv2', upgraded);
    identityPanel.dataset.referralState = upgraded ? 'earned'
      : ownResponseVerified ? 'inactive' : 'pending';
    // A-04: The same pre-issued Lv2 code can authenticate at Lv1 if
    // its owner's 2026 survey response is server-verified. Referral approval
    // elevates only the permission, not the code string.
    identityTitle.textContent = upgraded ? 'Lv2 참여코드'
      : ownResponseVerified ? 'Lv2 참여코드(비활성)' : '나의 고유번호';
    identityTag.textContent = upgraded ? 'Lv.2 달성 ✦'
      : ownResponseVerified ? 'Lv.1 인증 가능' : '인증 대기';
    identityReward.hidden = !upgraded && !ownResponseVerified;
    identityReward.textContent = upgraded
      ? 'Lv.2 인증 가능 · 기존 번호 그대로 사용하세요.'
      : ownResponseVerified
      ? '현재 Lv.1 인증 가능 · 유효한 추천 참여가 승인되면 같은 번호로 Lv.2가 됩니다.'
      : '';
    copyIdentityCode.textContent = upgraded || ownResponseVerified ? '코드 복사' : '번호 복사';

    // Invitation links must remain visible and copyable after promotion.
    title.textContent = '나의 전용 조사 링크';
    tag.textContent = upgraded ? '추천 1건 확인' : '링크 공유하기';
    panel.dataset.state = upgraded ? 'earned' : 'pending';
    linkField.value = currentLink;
    linkField.setAttribute('aria-label', '내 전용 조사 링크');
    copyButton.textContent = '링크 복사';
    note.textContent = upgraded
      ? '번호는 그대로 유지돼요. 전용 링크도 계속 공유할 수 있어요.'
      : ownResponseVerified
      ? '2026 본인 설문 참여가 확인되었습니다. 이 Lv2 참여코드(비활성)도 Lv1 인증에 사용할 수 있고, 유효한 추천 1건이면 같은 번호로 Lv2가 됩니다.'
      : '이 번호는 발급되었지만 2026 본인 설문 응답 확인 전에는 레벨 인증에 사용할 수 없습니다.';
  }
  function reset() {
    ++generation;
    currentLink = '';
    canonicalLink = '';
    lastIdentity = null;
    ownResponseVerified = false;
    linkField.value = '';
    linkField.hidden = true;
    copyButton.hidden = true;
    copyButton.disabled = true;
    progress.textContent = '';
    renderState(false);
    status.textContent = '전용 조사 링크를 불러오고 있어요.';
  }
  function unknownVerification(reason) {
    // A transport error or backend pause must not leave stale premium
    // visuals. The independent server continues to authorize all access.
    const prior = upgraded || ownResponseVerified;
    ownResponseVerified = false;
    renderState(false);
    if (prior) window.dispatchEvent(new Event('beagu:level-state-change'));
    status.textContent = reason;
    progress.textContent = '추천·참여코드 상태 확인 불가';
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
    if (!detail || typeof detail.visitor !== 'string' ||
        typeof detail.code !== 'string') return;
    // A different owner/code must never inherit another owner's
    // referral URL, even while the new request is still in flight.
    if (lastIdentity &&
        (lastIdentity.visitor !== detail.visitor || lastIdentity.code !== detail.code))
      reset();
    const seq = ++generation;
    const token = sessionStorage.getItem(sessionKey) || '';
    if (!/^[a-f0-9]{64}$/.test(token)) {
      unknownVerification('참여 세션을 확인할 수 없습니다. 다시 인증해 주세요.');
      return;
    }
    lastIdentity = {visitor: detail.visitor, code: detail.code};
    status.textContent = '본인 참여 및 추천 승인 상태를 서버에서 확인 중이에요.';
    try {
      const response = await fetch(endpoint, {
        method: 'POST', cache: 'no-store',
        headers: {'Content-Type': 'application/json', 'X-Beagu-Session': token},
        body: JSON.stringify({
          action: 'issue', visitor: detail.visitor, identityCode: detail.code,
          deviceSecret: deviceSecret()
        })
      });
      if (!active || seq !== generation ||
          sessionStorage.getItem(sessionKey) !== token) return;
      const payload = await response.json().catch(() => ({}));
      if (!active || seq !== generation ||
          sessionStorage.getItem(sessionKey) !== token) return;
      if (response.status === 503 && payload.error === 'REFERRAL_NOT_READY') {
        unknownVerification('참여코드 확인 기능이 준비 중입니다. 확인 전에는 Lv2 달성으로 표시하지 않습니다.');
        return;
      }
      if (!response.ok) throw Error(payload.error || 'UNAVAILABLE');
      if (typeof payload.link !== 'string' ||
          !/^https:\/\/baeguindex\.com\/survey\.html\?ref=[a-f0-9]{64}$/.test(payload.link))
        throw Error('INVALID_LINK');
      // A quality-reviewed Lv2 promotion changes permissions, not the
      // original invitation. Preserve the FIRST verified URL for this owner,
      // even if a later response omits the optional short-code alias.
      // A different canonical HMAC URL indicates a server inconsistency:
      // never silently replace the link that the teacher already shared.
      if (canonicalLink && canonicalLink !== payload.link)
        throw Error('REFERRAL_URL_CHANGED');
      if (!canonicalLink) canonicalLink = payload.link;
      if (!currentLink)
        currentLink = typeof payload.shortLink === 'string' &&
          /^https:\/\/baeguindex\.com\/r\/#[A-Za-z0-9_-]{8}$/.test(payload.shortLink)
          ? payload.shortLink : payload.link;
      linkField.hidden = false;
      copyButton.hidden = false;
      copyButton.disabled = false;

      // Only a server-approved, credited referral can upgrade the PERSONAL CODE.
      // A link visit, self-declared level, or incomplete payload cannot do so.
      const certified = payload.ownResponseVerified === true &&
        [1,2].includes(Number(payload.level));
      const promoted = certified && Number(payload.level) === 2 &&
        Number(payload.validReferrals) >= 1 && payload.provisional === true;
      const previousTier = upgraded ? 2 : ownResponseVerified ? 1 : 0;
      const nextTier = promoted ? 2 : certified ? 1 : 0;
      ownResponseVerified = certified;
      renderState(promoted);
      // Referrals can be revoked; the independent server-verified badge
      // needs a refresh after both promotion and downgrade.
      if (previousTier !== nextTier)
        window.dispatchEvent(new Event('beagu:level-state-change'));
      progress.textContent = promoted ? '유효한 추천 확인 · Lv2 활성화'
        : !certified ? '본인 설문 참여 확인 전'
        : '유효한 추천 확인 전 · Lv1 인증 가능';
      status.textContent = promoted
        ? 'Lv.2 달성! 기존 번호를 Lv2 참여코드로 사용하세요.'
        : certified ? '본인 2026 설문 참여 확인 · Lv2 참여코드(비활성), 현재 Lv1 인증 가능'
        : '본인 2026 설문 참여가 서버에서 확인되면 Lv1 인증이 가능합니다.';
    } catch (_) {
      if (!active || seq !== generation) return;
      unknownVerification('참여코드·추천 상태를 서버에서 확인하지 못했습니다. 다시 열거나 소유자 인증을 확인해 주세요.');
    }
  }
  copyButton.addEventListener('click', async () => {
    if (!active || copyButton.disabled || !currentLink) return;
    const requestedLink = currentLink;
    const seq = generation;
    try {
      await navigator.clipboard.writeText(requestedLink);
      if (active && seq === generation && currentLink === requestedLink)
        status.textContent = '전용 조사 링크를 복사했습니다.';
    } catch (_) {
      // An async clipboard failure after logout must not reopen or focus
      // the previous owner's private invitation field.
      if (!active || seq !== generation || currentLink !== requestedLink) return;
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
    // Continue polling even after promotion, so a revoked referral
    // cannot leave a stale Lv2 premium badge indefinitely.
    if (active && lastIdentity && !document.hidden) void load(lastIdentity);
  }, 60000);
  reset();
})();
