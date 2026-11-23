/* Independent read-only sandbox. Set the verified Render HTTPS origin only
 * AFTER the external service is actually connected and its SHA is checked.
 * This is intentionally disabled by default. Do not add secrets.
 * This target never provides authorization for production deployment.
 */
window.BEAGU_INDEPENDENT_PREVIEW = Object.freeze({
  origin: ""
});
