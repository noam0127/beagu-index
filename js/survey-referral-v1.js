(() => {
  'use strict';
  const ref = new URLSearchParams(location.search).get('ref');
  if (!ref) return; // Existing ordinary survey link is untouched.
  const original = document.getElementById('officialSurveyLink');
  const feedback = document.getElementById('referralSurveyFeedback');
  const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
  if (!tokenPattern.test(ref || '')) {
    original.hidden = true;
    feedback.textContent = '초대 링크를 확인해 주세요.';
    return;
  }
  const config = window.BEAGU_REFERRAL_FORM || {};
  if (!/^\d{5,20}$/.test(config.tokenEntryId || '') ||
      !/^\d{5,20}$/.test(config.deviceEntryId || '') ||
      config.tokenEntryId === config.deviceEntryId) {
    original.hidden = true; // Do not silently route a referral to a non-prefilled Form.
    feedback.textContent = '추천 설문 연결을 준비하고 있습니다.';
    return;
  }
  const key = 'beagu-visitor-v1';
  const validUUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  let visitor = '';
  try {
    visitor = localStorage.getItem(key) || '';
    if (!validUUID.test(visitor)) {
      visitor = crypto.randomUUID();
      localStorage.setItem(key, visitor);
    }
  } catch {
    // Form remains usable for ordinary participation, but can't claim a referral
    // without a stable device id. Never generate an untracked identifier.
    original.hidden = true;
    feedback.textContent = '초대 인증을 위해 브라우저 저장 공간을 허용해 주세요.';
    return;
  }
  const form = new URL(original.href);
  form.searchParams.set('usp', 'pp_url');
  form.searchParams.set('entry.' + config.tokenEntryId, ref);
  form.searchParams.set('entry.' + config.deviceEntryId, visitor);
  original.href = form.toString();
  original.rel = 'noopener noreferrer';
  original.textContent = '초대받은 설문 참여하기 ↗';
  feedback.textContent = '동료 선생님 한 분이 제출하면 초대한 분에게 레벨2가 열립니다.';
})();
