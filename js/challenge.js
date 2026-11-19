(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const status = byId('status'), capture = byId('capture'), retry = byId('retry');
  const participantNo = byId('participantNo');
  const identityCode = byId('identityCode'), copyIdentityCode = byId('copyIdentityCode');
  const identityCopyFeedback = byId('identityCopyFeedback');
  const identityEndpoint = SUPABASE_URL + '/functions/v1/beagu-challenge-identity';
  const levelSessionKey = 'beagu-level-session-v1';
  const identityRecovery = byId('identityRecovery');
  const legacyIdentityInput = byId('legacyIdentityInput');
  const legacyIdentityConfirm = byId('legacyIdentityConfirm');
  const deviceProofKey = 'beagu-challenge-proof-v1';
  function deviceProof() {
    const valid = /^[a-f0-9]{64}$/;
    let proof = localStorage.getItem(deviceProofKey) || '';
    if (!valid.test(proof)) {
      proof = Array.from(crypto.getRandomValues(new Uint8Array(32)),
        n => n.toString(16).padStart(2, '0')).join('');
      localStorage.setItem(deviceProofKey, proof);
    }
    return proof;
  }
  const referralEndpoint = SUPABASE_URL + '/functions/v1/beagu-referral-v1';
  const referralProgress = byId('referralProgress');
  const referralLevel = byId('referralLevel');
  const copyReferral = byId('copyReferralLink');
  const referralFeedback = byId('referralFeedback');
  const lv2Link = byId('referralLv2Link');
  let inviteUrl = null;
  async function loadReferral() {
    if (!accessGranted || !personalCode || !window.beaguVisitor) return;
    const issuedCode = personalCode;
    let token = '';
    try { token = sessionStorage.getItem(levelSessionKey) || ''; } catch (_) {}
    if (!token) return;
    try {
      const res = await deadline(fetch(referralEndpoint, {
        method: 'POST', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', 'X-Beagu-Session': token },
        body: JSON.stringify({ action: 'enroll',
          visitor: window.beaguVisitor, identityCode: issuedCode })
      }), 12000, 'referral timeout');
      if (!res.ok) throw new Error('REFERRAL_NOT_READY');
      const data = await res.json();
      if (!accessGranted || personalCode !== issuedCode) return;
      if (!/^https:\/\/baeguindex\.com\/survey\.html\?ref=[A-Za-z0-9_-]{43}$/.test(data.inviteUrl))
        throw new Error('INVALID_INVITE');
      inviteUrl = data.inviteUrl;
      const success = data.validReferrals === 1 ? 1 : 0;
      referralProgress.textContent = '유효 추천 ' + success + '/1명';
      const upgraded = data.level === 2 && success === 1;
      referralLevel.textContent = upgraded ? '활성화' : '잠금';
      lv2Link.hidden = !upgraded;
      copyReferral.disabled = false;
      referralFeedback.textContent = upgraded
        ? '레벨2가 열렸습니다.'
        : '한 분만 설문에 참여해도 레벨2가 열립니다.';
    } catch (_) {
      if (!accessGranted || personalCode !== issuedCode) return;
      inviteUrl = null;
      copyReferral.disabled = true;
      lv2Link.hidden = true;
      referralLevel.textContent = '잠금';
      referralProgress.textContent = '유효 추천 확인 전';
      referralFeedback.textContent = '초대 기능을 준비하고 있습니다.';
    }
  }
  let imageUrl = null, participant = null, personalCode = null, busy = false, accessGranted = false;
  const deadline = (promise, ms, message) => {
    let timer;
    return Promise.race([Promise.resolve(promise), new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    })]).finally(() => clearTimeout(timer));
  };

  async function prepare() {
    if (!accessGranted || busy) return;
    busy = true;
    capture.disabled = true;
    retry.hidden = true;
    retry.disabled = true;
    try {
      if (!window.beaguVisitor) throw new Error('STORAGE_UNAVAILABLE');
      if (participant === null || personalCode === null) {
        status.textContent = '참여 순번과 고유번호를 확인하고 있습니다.';
        identityCode.textContent = '고유번호 확인 중';
        let sessionToken = '';
        try { sessionToken = sessionStorage.getItem(levelSessionKey) || ''; } catch (_) {}
        if (!sessionToken) throw new Error('레벨1 인증이 필요합니다. 다시 인증해 주세요.');
        const response = await deadline(fetch(identityEndpoint, {
          method: 'POST', cache: 'no-store',
          headers: { 'Content-Type': 'application/json', 'X-Beagu-Session': sessionToken },
          body: JSON.stringify({
            action: 'issue', visitor: window.beaguVisitor,
            deviceProof: deviceProof(),
            ...(legacyIdentityInput.value.trim()
              ? {legacyIdentityCode: legacyIdentityInput.value.trim()} : {})
          })
        }), 15000, '연결이 지연되고 있습니다. 다시 시도해주세요.');
        if (!accessGranted) return;
        if (response.status === 403) {
          const problem = await response.json().catch(() => ({}));
          if (problem.error === 'LEGACY_PROOF_REQUIRED') {
            identityRecovery.hidden = false;
            throw new Error('기존에 발급한 고유번호를 한 번 확인해 주세요.');
          }
        }
        if (response.status === 401 || response.status === 403)
          throw new Error('레벨1 인증이 만료되었습니다. 다시 인증해 주세요.');
        if (!response.ok) throw new Error('고유번호 발급에 실패했습니다. 다시 시도해주세요.');
        const data = await response.json();
        if (!accessGranted) return;
        const n = Number(data.participantNo);
        const code = data.identityCode;
        if (!Number.isSafeInteger(n) || n < 1 ||
            typeof code !== 'string' || !/^(?:BG26-(?:[A-F0-9]{4}-){4}[A-F0-9]{4}|BG26-[A-HJ-NP-Z2-9]{6}-[A-HJ-NP-Z2-9]{6}|[A-HJ-NP-Z2-9]{10})$/.test(code)) {
          throw new Error('발급 결과를 확인하지 못했습니다. 다시 시도해주세요.');
        }
        participant = n;
        personalCode = code;
        identityRecovery.hidden = true;
        legacyIdentityInput.value = '';
        void loadReferral();
        participantNo.textContent = n.toLocaleString('ko-KR') + '번째';
        identityCode.textContent = code;
        copyIdentityCode.disabled = false;
        identityCopyFeedback.textContent = '';
        if (window.BeaguChallengeProgress) void window.BeaguChallengeProgress.refresh();
      }
      if (!accessGranted) return;
      status.textContent = '인증 이미지를 준비하고 있습니다.';
      if (typeof html2canvas !== 'function') throw new Error('이미지 기능을 불러오지 못했습니다. 페이지를 새로고침해주세요.');
      if (document.fonts) await deadline(document.fonts.ready, 10000, '글꼴 로딩이 지연되고 있습니다. 다시 시도해주세요.');
      const canvas = await deadline(html2canvas(byId('certificate'), {
        scale: 2, backgroundColor: '#ffffff', logging: false
      }), 20000, '이미지 생성이 지연되고 있습니다. 다시 시도해주세요.');
      const blob = await deadline(new Promise(resolve => canvas.toBlob(resolve, 'image/png')), 10000, '이미지 변환에 실패했습니다. 다시 시도해주세요.');
      if (!blob) throw new Error('이미지를 생성하지 못했습니다. 다시 시도해주세요.');
      if (!accessGranted) return;
      if (imageUrl) URL.revokeObjectURL(imageUrl);
      imageUrl = URL.createObjectURL(blob);
      capture.disabled = false;
      status.textContent = '';
    } catch (error) {
      if (participant === null) participantNo.textContent = '순번 조회 실패';
      if (personalCode === null) {
        identityCode.textContent = '고유번호 발급 실패';
        copyIdentityCode.disabled = true;
      }
      status.textContent = error.message === 'STORAGE_UNAVAILABLE'
        ? '브라우저 저장 공간을 허용한 뒤 페이지를 새로고침해주세요.'
        : error.message || '처리하지 못했습니다. 다시 시도해주세요.';
      retry.hidden = false;
    } finally {
      busy = false;
      retry.disabled = false;
    }
  }

  capture.addEventListener('click', () => {
    if (!accessGranted || !imageUrl) return;
    try {
      const link = document.createElement('a');
      link.href = imageUrl;
      link.download = '2026-배구지수-챌린지.png';
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      link.remove();
      status.textContent = '이미지 저장을 요청했습니다. 브라우저의 다운로드 목록에서 확인해 주세요.';
    } catch (_) {
      status.textContent = '이미지 저장에 실패했습니다. 다시 시도해주세요.';
    }
  });

  copyIdentityCode.addEventListener('click', async () => {
    if (!accessGranted || !personalCode) return;
    try {
      if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error('UNAVAILABLE');
      await navigator.clipboard.writeText(personalCode);
      identityCopyFeedback.textContent = '고유번호를 복사했습니다. 개인적으로 보관해 주세요.';
    } catch (_) {
      identityCopyFeedback.textContent = '복사가 지원되지 않습니다. 번호를 길게 눌러 직접 복사해 주세요.';
    }
  });

  copyReferral.addEventListener('click', async () => {
    if (!accessGranted || !inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      referralFeedback.textContent = '초대 링크를 복사했습니다.';
    } catch (_) {
      referralFeedback.textContent = '이 브라우저에서는 링크를 복사할 수 없습니다.';
    }
  });
  legacyIdentityConfirm.addEventListener('click', () => {
    if (!legacyIdentityInput.value.trim()) return;
    void prepare();
  });
  retry.addEventListener('click', prepare);
  // 뒤로가기로 복원되는 페이지에서는 이미지 URL을 유지합니다.
  window.addEventListener('pagehide', event => {
    if (!event.persisted && imageUrl) URL.revokeObjectURL(imageUrl);
  });
  window.addEventListener('beagu:challenge-access-revoked', () => {
    accessGranted = false;
    participant = null;
    personalCode = null;
    identityRecovery.hidden = true;
    legacyIdentityInput.value = '';
    inviteUrl = null;
    copyReferral.disabled = true;
    lv2Link.hidden = true;
    referralLevel.textContent = '잠금';
    referralProgress.textContent = '유효 추천 확인 중';
    referralFeedback.textContent = '초대 기능 준비 중';
    identityCode.textContent = '고유번호 확인 중';
    copyIdentityCode.disabled = true;
    identityCopyFeedback.textContent = '';
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    imageUrl = null;
    capture.disabled = true;
    participantNo.textContent = '순번 확인 중';
    status.textContent = '';
    retry.hidden = true;
  });
  window.addEventListener('beagu:challenge-access-granted', () => {
    accessGranted = true;
    void prepare();
  });
})();

