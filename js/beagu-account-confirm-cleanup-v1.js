(() => {
  'use strict';
  // Confirmation URLs may contain temporary Auth parameters. Never expose them
  // to analytics, app scripts, referrers or a later navigation.
  try {
    if (location.hash || location.search)
      history.replaceState(null,'',location.pathname);
  } catch (_) { /* Navigation stays on the confirmation landing page. */ }
})();
