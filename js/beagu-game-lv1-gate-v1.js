/* Lv.1 game visibility gate. Uses the existing server-verified session. */
(() => {
  'use strict';
  const section = document.getElementById('teacher-run-feature');
  const game = document.getElementById('teacher-run-protected');
  const gate = document.getElementById('teacher-run-lv1-gate');
  if (!section && !(game && gate)) return;

  const sessionKey = 'beagu-level-session-v1';
  const endpoint = 'https://snvzwrexuqavnfvzgxqj.supabase.co/functions/v1/beagu-level-api';
  const frame = document.getElementById('teacher-run-frame');
  const homeContent = document.getElementById('teacher-run-home-content');
  const homeLock = document.getElementById('teacher-run-home-lock');
  const homeFeedback = homeLock?.querySelector('[data-lv1-gate-message]');
  const feedback = gate?.querySelector('[data-lv1-gate-message]');
  let serial = 0;
  let verifiedToken = '';
  // Both the homepage lock and the standalone game use the existing server-side login.
  const loginForm = (homeLock || gate)?.querySelector('[data-game-lv1-form]');
  const codeInput = loginForm?.querySelector('[data-game-lv1-code]');
  const loginButton = loginForm?.querySelector('[data-game-lv1-submit]');
  const loginMessage = loginForm?.querySelector('[data-game-lv1-message]');
  let loginPending = false;

  const getToken = () => {
    try { return sessionStorage.getItem(sessionKey) || ''; }
    catch (_) { return ''; }
  };

  function display(unlocked, message) {
    if (section) {
      // Always show the game card; only its playable content is gated.
      section.hidden = false;
      if (homeContent) homeContent.hidden = !unlocked;
      if (homeLock) homeLock.hidden = unlocked;
      if (homeFeedback) homeFeedback.textContent = message || 'Lv.1 인증 후 플레이할 수 있습니다.';
      if (frame) {
        if (unlocked && frame.dataset.src && frame.getAttribute('src') !== frame.dataset.src) {
          frame.setAttribute('src', frame.dataset.src);
        } else if (!unlocked && frame.hasAttribute('src')) {
          frame.removeAttribute('src');
        }
      }
    }
    if (game && gate) {
      game.hidden = !unlocked;
      gate.hidden = unlocked;
      if (feedback) feedback.textContent = message || 'Lv.1 인증 후 이용할 수 있습니다.';
    }
  }

  async function verify() {
    const request = ++serial;
    const token = getToken();
    if (token !== verifiedToken) display(false, token ? 'Lv.1 인증 상태를 확인하고 있습니다.' : 'Lv.1 인증 후 플레이할 수 있습니다.');
    if (!token) { verifiedToken = ''; display(false); return; }
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        cache: 'no-store',
        headers: {'Content-Type':'application/json','X-Beagu-Session':token},
        body: JSON.stringify({ action: 'verify' })
      });
      if (request !== serial || getToken() !== token) return;
      if (response.status === 401 || response.status === 403) {
        try { if (getToken() === token) sessionStorage.removeItem(sessionKey); } catch (_) {}
        verifiedToken = '';
        display(false, 'Lv.1 인증이 만료되었습니다. 다시 인증해 주세요.');
        window.dispatchEvent(new Event('beagu:level-state-change'));
        return;
      }
      if (!response.ok) throw new Error('VERIFY_UNAVAILABLE');
      const result = await response.json();
      if (request !== serial || getToken() !== token) return;
      const level = Number(result?.level);
      if (Number.isInteger(level) && level >= 1) {
        verifiedToken = token;
        display(true);
      } else {
        verifiedToken = '';
        display(false, 'Lv.1 인증 후 플레이할 수 있습니다.');
      }
    } catch (_) {
      if (request === serial) {
        verifiedToken = '';
        display(false, '인증 상태를 확인할 수 없습니다. 연결 상태를 확인해 주세요.');
      }
    }
  }

  // Keep access codes out of URLs, logs, analytics, and persistent storage.
  // The server returns a short-lived session token only after a valid code is checked.
  loginForm?.addEventListener('submit', async event => {
    event.preventDefault();
    if (loginPending || !codeInput || !loginButton) return;
    const code = codeInput.value.trim();
    if (code.length < 8 || code.length > 120) {
      if (loginMessage) loginMessage.textContent = '인증번호를 8자 이상 입력해 주세요.';
      codeInput.focus();
      return;
    }
    loginPending = true;
    loginButton.disabled = true;
    if (loginMessage) loginMessage.textContent = '인증번호를 확인하고 있습니다.';
    try {
      const response = await fetch(endpoint, {
        method: 'POST', cache: 'no-store',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({action:'login',code})
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || Number(data.level) < 1 ||
          typeof data.token !== 'string' || !data.token) throw new Error('LOGIN_FAILED');
      sessionStorage.setItem(sessionKey, data.token);
      verifiedToken = '';
      void verify();
      codeInput.value = '';
      if (loginMessage) loginMessage.textContent = '인증되었습니다. 게임을 열고 있습니다.';
      window.dispatchEvent(new Event('beagu:level-state-change'));
    } catch (_) {
      if (loginMessage) loginMessage.textContent = '인증에 실패했습니다. 인증번호 또는 연결 상태를 확인해 주세요.';
    } finally {
      loginPending = false;
      loginButton.disabled = false;
    }
  });

  const verifyIfVisible = () => { if (!document.hidden) void verify(); };
  window.addEventListener('beagu:level-state-change', verify);
  window.addEventListener('beagu:participation-authenticated', verify);
  window.addEventListener('beagu:participation-logged-out', verify);
  window.addEventListener('beagu:challenge-access-granted', verify);
  window.addEventListener('beagu:challenge-access-revoked', verify);
  window.addEventListener('pageshow', event => { if (event.persisted) void verify(); });
  window.addEventListener('focus', verifyIfVisible);
  document.addEventListener('visibilitychange', verifyIfVisible);
  void verify();
})();
