(() => {
  'use strict';
  const panel = document.getElementById('challengeReferralPanel');
  const linkField = document.getElementById('challengeReferralLink');
  const copyButton = document.getElementById('copyChallengeReferral');
  const status = document.getElementById('challengeReferralStatus');
  const progress = document.getElementById('challengeReferralProgress');
  if (!panel || !linkField || !copyButton || !status || !progress) return;

  const endpoint = SUPABASE_URL + '/functions/v1/beagu-referral-link-v1';
  const sessionKey = 'beagu-level-session-v1';
  const deviceKey = 'beagu-referral-device-secret-v1';
  let active = false;
  let generation = 0;
  let currentLink = '';
  const reset = () => {
    ++generation;
    currentLink = '';
    linkField.value = '';
    linkField.hidden = true;
    copyButton.hidden = true;
    copyButton.disabled = true;
    progress.textContent = '';
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
    status.textContent = '전용 조사 링크 발급 상태를 확인 중입니다.';
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
      linkField.value = currentLink;
      linkField.hidden = false;
      copyButton.hidden = false;
      copyButton.disabled = false;
      const promoted = Number(payload.level) === 2;
      progress.textContent = promoted ? '유효한 추천 1건 · 레벨2 자격 획득' : '유효한 추천 0 / 1건';
      status.textContent = promoted
        ? '레벨2 자격이 확인되었습니다. 다른 기기에서는 정식 로그인 계정이 필요합니다.'
        : '내 전용 조사 링크가 준비되었습니다. 동료에게 공유할 수 있습니다.';
    } catch (_) {
      if (!active || seq !== generation) return;
      status.textContent = '전용 링크를 확인하지 못했습니다. 링크 발급 기능이 준비 중이거나 소유자 인증이 필요합니다.';
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
      status.textContent = '링크를 선택했습니다. 복사하여 공유해 주세요.';
    }
  });
  window.addEventListener('beagu:challenge-access-granted', () => { active = true; });
  window.addEventListener('beagu:challenge-access-revoked', () => { active = false; reset(); });
  window.addEventListener('beagu:identity-ready', e => { void load(e.detail); });
  reset();
})();
