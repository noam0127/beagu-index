/* Supabase Auth redirect targets: exact, environment-specific, fail closed.
 * Site URL / Redirect URLs must ALSO be configured in Supabase dashboard.
 * This browser helper NEVER grants access or changes server URL configuration.
 */
(() => {
  'use strict';
  const origin = 'https://baeguindex.com';
  const supportedPages = Object.freeze({
    challenge: 'challenge.html',
    postit: 'postit.html',
    adminEnroll: 'admin-enroll.html'
  });
  function resolve(page) {
    if (!Object.prototype.hasOwnProperty.call(supportedPages, page))
      throw new Error('UNRECOGNIZED_AUTH_REDIRECT');
    if (window.location.origin !== origin)
      throw new Error('AUTH_REDIRECT_ORIGIN_NOT_ALLOWED');
    const pathname = window.location.pathname || '/';
    const isPreview = pathname === '/_preview/' || pathname.startsWith('/_preview/');
    return origin + (isPreview ? '/_preview/' : '/') + supportedPages[page];
  }
  Object.defineProperty(window, 'BEAGU_AUTH_RETURN', {
    configurable: false, enumerable: false, writable: false,
    value: Object.freeze({resolve})
  });
})();
