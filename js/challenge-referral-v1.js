(() => {
  'use strict';
  const panel = document.getElementById('challengeReferralPanel');
  const linkField = document.getElementById('challengeReferralLink');
  const copyButton = document.getElementById('copyChallengeReferral');
  const status = document.getElementById('challengeReferralStatus');
  const progress = document.getElementById('challengeReferralProgress');
  const title = document.getElementById('challengeReferralTitle');
  const tag = document.getElementById('challengeReferralTag');
  const note = document.getElementById('challengeReferralNote');
  const more = document.getElementById('challengeReferralMore');
  const copyAfter = document.getElementById('copyChallengeReferralAfter');
  if (![panel, linkField, copyButton, status, progress, title, tag, note, more, copyAfter].every(Boolean)) return;

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
    panel.classList.toggle('is-lv2', upgraded);
    panel.dataset.state = upgraded ? 'earned' : 'pending';
    title.textContent = upgraded ? 'Lv2 참여코드' : '나의 전용 조사 링크';
    tag.textContent = upgraded ? '유효한 추천 참여 확인' : '추천 승급 준비 중';
    linkField.setAttribute('aria-label', upgraded ? '내 Lv2 참여코드' : '내 전용 조사 링크');
    linkField.value = upgraded ? (lastIdentity?.code || '') : currentLink;
    copyButton.textContent = upgraded ? '코드 복사' : '링크 복사';
    more.hidden = !upgraded || !currentLink;
    note.textContent = upgraded
      ? '기존 고유번호가 Lv2 참여코드로 표시됩니다. 정식 계정 로그인 및 포스트잇 작성 권한은 별도입니다.'
      : '기존 고유번호는 변경되지 않습니다. 설문과 연결되기 전에는 추천 실적이 인정되지 않습니다.';
  }
  const reset = () => {
    ++generation;
    currentLink = '';
    linkField.value = '';
    linkField.hidden = true;
    copyButton.hidden = true;
    copyButton.disabled = true;
    progress.textContent = '';
    renderState(false);
    status.textContent = '전용 조사 링크 발급 및 설문 연동을 준비하고 있습니다.';
  };
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
    lastIdentity = {visitor:detail.visitor,code:detail.code};
    if (!upgraded) status.textContent = '전용 조사 링크 발급 상태를 확인 중입니다.';
    try {
      const response = await fetch(endpoint, {
        method: 'POST', cache: 'no-store',
        headers: {'Content-Type':'application/json', 'X-Beagu-Session':token},
        body: JSON.stringify({
          action: 'issue', visitor:detail.visitor, identityCode:detail.code,
          deviceSecret:deviceSecret(),
        }),
      });
      if (!active || seq !== generation) return;
      const payload = await response.json().catch(() => ({}));
      if (response.status === 503 && payload.error === 'REFERRAL_NOT_READY') {
        status.textContent = '전용 조사 링크는 현재 준비 중입니다. 자동 승급 연동이 완료되면 활성화됩니다.';
        return;
      }
      if (!response.ok) throw Error(payload.error || 'UNAVAILABLE');
      if (typeof payload.link !== 'string' ||
          !/^https:\/\/baeguindex\.com\/survey\.html\?ref=[a-f0-9]{64}$/.test(payload.link))
        throw Error('INVALID_LINK');
      currentLink = payload.link;
      linkField.hidden = false;
      copyButton.hidden = false;
      copyButton.disabled = false;
      // The card changes only for a server-confirmed credit, not a link click
      // or a client-stored level. Missing/inconsistent fields fail closed.
      const promoted = Number(payload.level) === 2 &&
        Number(payload.validReferrals) >= 1 && payload.provisional === true;
      const newlyPromoted = promoted && !upgraded;
      renderState(promoted);
      if (newlyPromoted) window.dispatchEvent(new Event('beagu:level-state-change'));
      progress.textContent = promoted ? '추천 설문 1건 확인 · Lv2 자격 획득' : '유효한 추천 0 / 1건';
      status.textContent = promoted
        ? '전용 링크를 통한 유효한 설문 참여가 확인되었습니다. Lv2 참여코드가 활성화되었습니다.'
        : '내 전용 조사 링크가 준비되었습니다. 동료에게 공유할 수 있습니다.';
    } catch (_) {
      if (!active || seq !== generation) return;
      if (!upgraded) status.textContent = '전용 링크를 확인하지 못했습니다. 링크 발급 기능이 준비 중이거나 소유자 인증이 필요합니다.';
    }
  }
  async function copyValue(value, description, selectOnFail = false) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      status.textContent = description + '를 복사했습니다.';
    } catch (_) {
      if (selectOnFail) {
        linkField.focus();
        linkField.select();
        status.textContent = description + '를 선택했습니다. 직접 복사해 주세요.';
      } else {
        status.textContent = '복사가 지원되지 않습니다. 나의 전용 조사 링크 화면에서 다시 복사해 주세요.';
      }
    }
  }
  copyButton.addEventListener('click', () => {
    const value = upgraded ? lastIdentity?.code : currentLink;
    void copyValue(value, upgraded ? 'Lv2 참여코드' : '전용 조사 링크', true);
  });
  copyAfter.addEventListener('click', () => {
    void copyValue(currentLink, '전용 조사 링크');
  });
  window.addEventListener('beagu:challenge-access-granted', () => { active = true; });
  window.addEventListener('beagu:challenge-access-revoked', () => {
    active = false; lastIdentity = null; reset();
  });
  window.addEventListener('beagu:identity-ready', e => { void load(e.detail); });
  window.addEventListener('focus', () => {
    if (active && lastIdentity) void load(lastIdentity);
  });
  document.addEventListener('visibilitychange', () => {
    if (active && lastIdentity && !document.hidden) void load(lastIdentity);
  });
  // A confirmed respondent may submit while this page is open; refresh
  // quietly rather than requiring the referrer to reload the page.
  setInterval(() => {
    if (active && !upgraded && lastIdentity && !document.hidden) void load(lastIdentity);
  }, 60000);
  reset();
})();
