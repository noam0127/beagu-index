/* Safe client-side landing handler for Supabase email/OAuth confirmation.
 * This UI does NOT create, link, or upgrade membership. Server authorization
 * remains authoritative in the separate Lv2/Lv3 APIs.
 */
(() => {
  'use strict';
  const status = document.getElementById('beaguAuthCallbackStatus');
  if (!status) return;
  const params = new URLSearchParams(window.location.search || '');
  const fragment = new URLSearchParams((window.location.hash || '').replace(/^#/, ''));
  const callbackKeys = ['code', 'error', 'error_code', 'token_hash', 'access_token', 'refresh_token'];
  const isCallback = callbackKeys.some(key => params.has(key) || fragment.has(key));
  if (!isCallback) return;

  const client = typeof supabaseClient !== 'undefined'
    ? supabaseClient : window.supabaseClient;
  const hasAuthError = params.has('error') || params.has('error_code') ||
    fragment.has('error') || fragment.has('error_code');
  const hasCode = params.has('code');
  const hasTokenHash = params.has('token_hash') || fragment.has('token_hash');
  const hasTokens = fragment.has('access_token') || fragment.has('refresh_token');
  const origin = window.location.origin;
  const path = window.location.pathname;
  const allowedPath = path === '/challenge.html' || path === '/postit.html' ||
    path === '/admin-enroll.html' || path === '/_preview/challenge.html' ||
    path === '/_preview/postit.html' || path === '/_preview/admin-enroll.html';

  function paint(kind, text) {
    status.dataset.state = kind;
    status.textContent = text;
    status.hidden = false;
  }
  function scrub() {
    try {
      const url = new URL(window.location.href);
      for (const key of ['code', 'error', 'error_code', 'error_description',
                         'token_hash', 'type', 'sb_flow_id']) {
        url.searchParams.delete(key);
      }
      // All Auth-related fragments contain bearer credentials or error details.
      // Never preserve them or echo them into the document.
      if (hasTokens || fragment.has('error') || fragment.has('error_code') ||
          fragment.has('token_hash') || fragment.has('type')) {
        url.hash = '';
      }
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    } catch (_) { /* Browsing history support is optional, not a login gate. */ }
  }
  if (origin !== 'https://baeguindex.com' || !allowedPath) {
    paint('error', '허용되지 않은 인증 복귀 주소입니다. 배구지수 공식 사이트에서 다시 로그인해 주세요.');
    scrub();
    return;
  }
  if (hasAuthError || hasTokenHash) {
    paint('error', hasTokenHash
      ? '인증 메일 링크 형식을 확인할 수 없습니다. 새로운 인증 메일을 요청해 주세요.'
      : '인증 링크가 만료되었거나 유효하지 않습니다. 새 인증 메일을 요청하거나 다시 로그인해 주세요.');
    scrub();
    return;
  }
  paint('checking', '계정 인증 상태를 안전하게 확인하고 있습니다.');
  if (!client || !client.auth) {
    paint('error', '인증 서비스에 연결하지 못했습니다. 페이지를 새로고침한 후 다시 시도해 주세요.');
    scrub();
    return;
  }

  void (async () => {
    try {
      // Supabase-js detects implicit or PKCE tokens in the URL on initialization.
      // getSession waits for initialization; don't exchange a valid code twice.
      let result = await client.auth.getSession();
      if (!result?.data?.session && hasCode &&
          typeof client.auth.exchangeCodeForSession === 'function') {
        // Fallback only if the client did not exchange the one-time PKCE code.
        result = await client.auth.exchangeCodeForSession(params.get('code'));
      }
      if (!result?.data?.session?.access_token || result.error) {
        paint('signin', '로그인이 확인되지 않았습니다. 이메일 인증을 완료했다면 계정으로 로그인해 주세요.');
        return;
      }
      // getSession is a local session hint. Only getUser() validates the token
      // against the Auth server; it must never grant Lv3 by itself.
      const verified = await client.auth.getUser();
      const person = verified?.data?.user;
      if (verified?.error || !person || person.is_anonymous ||
          !person.email_confirmed_at) {
        paint('signin', '이메일 인증이 아직 확인되지 않았습니다. 이메일을 다시 확인하거나 로그인해 주세요.');
        return;
      }
      paint('verified', '이메일 인증된 계정의 로그인 상태가 확인되었습니다. Lv3 권한은 별도의 참여코드·계정 연결 검증 후 적용됩니다.');
      try { window.dispatchEvent(new CustomEvent('beagu:auth-email-verified', {detail:{confirmed:true}})); }
      catch (_) {}
    } catch (_) {
      paint('error', '인증 상태를 확인하지 못했습니다. 인증 메일 또는 계정 로그인을 다시 확인해 주세요.');
    } finally {
      scrub();
    }
  })();
})();
