(() => {
  'use strict';
  const isShortLink = /\/r\/(?:index\.html)?$/.test(location.pathname);
  const ref = isShortLink ? location.hash.slice(1) : new URLSearchParams(location.search).get('ref');
  if (!isShortLink && !ref) return;
  const notice = document.getElementById('referralNotice');
  const fallback = document.getElementById('referralFallback');
  const feedback = document.getElementById('referralSubmitFeedback');
  const cfg = window.BEAGU_REFERRAL_FORM_CONFIG || {};
  const CHECKIN_URL = 'https://ycwuugggqbunlbwuzvbx.supabase.co/functions/v1/beagu-referral-checkin-v1';
  const validRef = /^(?:[a-f0-9]{64}|[A-Za-z0-9_-]{8})$/.test(ref || '');
  const validEntry = /^entry\.\d{3,20}$/.test(cfg.entryName || '');
  function failure(message) {
    document.documentElement.classList.remove('beagu-referral-pending');
    if (notice) { notice.hidden = false; notice.textContent = message; }
    if (fallback) fallback.hidden = false;
    if (feedback) feedback.textContent = message;
  }
  function browserVisitor() {
    // Retain the existing pseudonym to help prevent duplicate referral credits.
    const key = 'beagu-visitor-v1';
    const valid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
    try {
      const existing = localStorage.getItem(key);
      if (valid.test(existing || '')) return existing;
    } catch (_) {}
    const created = crypto.randomUUID();
    try { localStorage.setItem(key, created); } catch (_) {}
    return created;
  }
  if (!validRef) { failure('올바르지 않은 추천 링크입니다. 일반 설문을 이용해 주세요.'); return; }
  if (!validEntry) { failure('추천 설문 연결을 확인할 수 없습니다. 일반 설문을 이용해 주세요.'); return; }
  // Check-in alone does not grant Lv.2; only verified Google Forms submissions do.
  void (async () => {
    try {
      const res = await fetch(CHECKIN_URL, {
        method: 'POST', cache: 'no-store',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({action: 'checkin', ref, respondent: browserVisitor()})
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || typeof data.proof !== 'string' ||
          !/^BR1\.[a-f0-9]{64}\.[a-f0-9-]{36}\.\d{10}\.[a-f0-9]{64}$/.test(data.proof))
        throw Error('CHECKIN_UNAVAILABLE');
      const form = new URL(cfg.formUrl);
      if (form.protocol !== 'https:' || form.hostname !== 'docs.google.com' ||
          !form.pathname.startsWith('/forms/d/e/'))
        throw Error('FORM_CONFIG_INVALID');
      form.searchParams.set('usp', 'pp_url');
      form.searchParams.set(cfg.entryName, data.proof);
      // Best-effort signal immediately before handing off to Google Forms.
      // Does NOT establish that the Form loaded or that an answer was submitted.
      const handoff = JSON.stringify({action:'handoff',proof:data.proof});
      try {
        if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
          navigator.sendBeacon(CHECKIN_URL,new Blob([handoff],{type:'text/plain'}));
        } else {
          void fetch(CHECKIN_URL,{
            method:'POST',cache:'no-store',keepalive:true,
            headers:{'Content-Type':'text/plain'},body:handoff
          }).catch(()=>{});
        }
      } catch (_) { /* A failed tracking ping must not block the survey. */ }
      location.replace(form.toString());
    } catch (_) {
      failure('추천 인증을 연결하지 못했습니다. 다시 시도하거나 일반 설문에 참여해 주세요.');
    }
  })();
})();