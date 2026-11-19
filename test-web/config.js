/* Test-only public settings. Login, signup, and API remain DISABLED pending
 * test Auth SMTP, Turnstile, Function Secrets, and live two-account verification.
 * Do not copy production service keys into any frontend file. */
window.BEAGU_STAGE_CONFIG = Object.freeze({
  enabled:false,
  projectRef:'ycwuugggqbunlbwuzvbx',
  endpoint:'https://ycwuugggqbunlbwuzvbx.supabase.co/functions/v1/beagu-test-v1',
  siteOrigin:'https://baegu-index-test.vercel.app',
  turnstileSiteKey:''
});
