/* Dynamic homepage footer notice. Static fallback remains visible if this request fails. */
(() => {
  "use strict";
  const body = document.getElementById("beaguHomeNoticeBody");
  if (!body || typeof SUPABASE_URL !== "string") return;
  const endpoint = SUPABASE_URL + "/functions/v1/beagu-home-notice-v1";
  const headers = { "apikey": SUPABASE_PUBLISHABLE_KEY };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6500);
  fetch(endpoint, { method: "GET", headers, cache: "no-store", signal: controller.signal })
    .then(async response => {
      if (!response.ok) throw Error("notice_unavailable");
      return response.json();
    })
    .then(data => {
      if (typeof data?.body === "string" && data.body.trim()) {
        // Render *only text*. Notice content must never be interpreted as HTML.
        body.textContent = data.body;
      }
    })
    .catch(() => { /* Keep checked-in fallback text on network errors. */ })
    .finally(() => clearTimeout(timeout));
})();
