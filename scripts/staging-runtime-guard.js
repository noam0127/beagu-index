/* Staging-only runtime isolation, loaded synchronously before page scripts.
 * This is a defense-in-depth policy: the hosting CSP must also restrict
 * connect-src to the assigned staging Supabase project.
 */
(function () {
  "use strict";
  const PROD_HOSTS = new Set(["baeguindex.com", "www.baeguindex.com"]);
  const STAGE_SUPABASE = "ycwuugggqbunlbwuzvbx.supabase.co";
  function forbidden(target) {
    if (target === null || target === undefined || target === "") return false;
    try {
      const value = target && typeof target.url === "string" ? target.url : String(target);
      const parsed = new URL(value, location.href);
      const host = parsed.hostname.toLowerCase();
      const releaseAction = host === STAGE_SUPABASE &&
        /^\/functions\/v1\/beagu-release-(?:manager|worker)(?:-v[0-9]+)?(?:\/|$)/.test(parsed.pathname);
      // A staging visitor must never reach the real survey by navigating
      // to a Google Forms short link or by receiving a server-supplied URL.
      // This does not block Google OAuth (accounts.google.com).
      const liveSurvey = host === "forms.gle" || host === "forms.google.com" ||
        (host === "docs.google.com" && /^\/forms(?:\/|$)/.test(parsed.pathname));
      return PROD_HOSTS.has(host) || releaseAction || liveSurvey ||
        (host.endsWith(".supabase.co") && host !== STAGE_SUPABASE);
    } catch (_error) {
      return false;
    }
  }
  function note() {
    const el = document.getElementById("beagu-staging-navigation-warning");
    if (el) el.textContent = "시험 환경에서는 운영 웹·운영 DB 접근이 차단됩니다.";
  }
  function reject() {
    note();
    throw new DOMException("Blocked by the isolated staging policy", "SecurityError");
  }
  function stopEvent(event, url) {
    if (!forbidden(url)) return;
    event.preventDefault();
    note();
  }
  document.addEventListener("click", function (event) {
    const a = event.target instanceof Element && event.target.closest("a[href]");
    if (a) stopEvent(event, a.href);
  }, true);
  document.addEventListener("auxclick", function (event) {
    const a = event.target instanceof Element && event.target.closest("a[href]");
    if (a) stopEvent(event, a.href);
  }, true);
  document.addEventListener("submit", function (event) {
    stopEvent(event, event.target && event.target.action);
  }, true);
  const nativeFetch = window.fetch;
  if (typeof nativeFetch === "function") {
    window.fetch = function (input) {
      if (forbidden(input)) {
        note();
        return Promise.reject(new TypeError("Blocked by isolated staging policy"));
      }
      return nativeFetch.apply(this, arguments);
    };
  }
  const nativeXhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    if (forbidden(url)) reject();
    return nativeXhrOpen.apply(this, arguments);
  };
  if (typeof navigator.sendBeacon === "function") {
    const nativeBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function (url, payload) {
      if (forbidden(url)) {
        note();
        return false;
      }
      return nativeBeacon(url, payload);
    };
  }
  const nativeOpen = window.open;
  if (typeof nativeOpen === "function") {
    window.open = function (url) {
      if (forbidden(url)) {
        note();
        return null;
      }
      return nativeOpen.apply(this, arguments);
    };
  }
  const nativeFormSubmit = HTMLFormElement.prototype.submit;
  HTMLFormElement.prototype.submit = function () {
    if (forbidden(this.action)) reject();
    return nativeFormSubmit.apply(this, arguments);
  };
  if (typeof window.WebSocket === "function") {
    const NativeWebSocket = window.WebSocket;
    window.WebSocket = class StagingWebSocket extends NativeWebSocket {
      constructor(url, protocols) {
        if (forbidden(url)) reject();
        if (arguments.length > 1) super(url, protocols);
        else super(url);
      }
    };
  }
  if (typeof window.EventSource === "function") {
    const NativeEventSource = window.EventSource;
    window.EventSource = class StagingEventSource extends NativeEventSource {
      constructor(url, options) {
        if (forbidden(url)) reject();
        if (arguments.length > 1) super(url, options);
        else super(url);
      }
    };
  }
}());
