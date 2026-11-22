#!/usr/bin/env node
"use strict";
// Actual HEADLESS CHROMIUM over an external third-party static CDN mirror.
// The mirror is credential-disabled and API-blocked: this is NOT Auth/MFA E2E.
// This test never logs in, sends passwords, calls a release controller,
// or accepts a production web/Supabase request.
const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const base = "https://raw.githack.com/noam0127/beagu-index/stage38-static-review-rc-5c95aad";
const pages = ["index.html", "admin.html", "admin-updates.html", "result.html", "js/challenge.html"];
const forbiddenHosts = new Set([
  "baeguindex.com", "www.baeguindex.com",
  "snvzwrexuqavnfvzgxqj.supabase.co",
  "ycwuugggqbunlbwuzvbx.supabase.co",
]);
async function fetchWithRetry(url, attempts = 18) {
  let lastError;
  for (let n = 0; n < attempts; n++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
      if (response.status === 200) return response;
      lastError = new Error("HTTP " + response.status);
    } catch (err) { lastError = err; }
    await new Promise(resolve => setTimeout(resolve, 3500));
  }
  throw new Error("Externally hosted URL never reached HTTP 200: " + url +
    " (" + lastError?.message + ")");
}
async function run() {
  const mirror = await fetchWithRetry(base + "/stage38-static-mirror.json");
  const meta = await mirror.json();
  assert.equal(meta.kind, "third-party-cdn-static-smoke-only");
  assert.equal(meta.source_sha, "5c95aadad971901a8222f83c52e93bf901a3aeb7");
  assert.equal(meta.login_enabled, false);
  assert.equal(meta.api_calls_enabled, false);
  assert.equal(meta.supabase_auth_mfa_browser_e2e_passed, false);
  assert.equal(meta.production_release_approved, false);
  const asset = await fetchWithRetry(base + "/js/supabase-config.js");
  assert.match(asset.headers.get("content-type") || "", /javascript|text\/plain/i);
  console.log("PASS: remote static manifest and JS asset returned HTTP 200");

  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  try {
    const attemptedForbidden = [];
    // raw.githack displays an explicit first-visit External Content Notice.
    // Use one isolated browser context so the review consent applies only to
    // this temporary CI session. No credentials or backend requests are sent.
    const context = await browser.newContext({ serviceWorkers: "block" });
    for (const file of pages) {
      const page = await context.newPage();
      page.on("request", req => {
        const host = new URL(req.url()).hostname.toLowerCase();
        if (forbiddenHosts.has(host)) attemptedForbidden.push(file + ":" + host);
      });
      await page.route("**/*", async route => {
        const host = new URL(route.request().url()).hostname.toLowerCase();
        if (forbiddenHosts.has(host)) {
          await route.abort();
        } else {
          await route.continue();
        }
      });
      const response = await page.goto(base + "/" + file, {
        waitUntil: "domcontentloaded", timeout: 45000,
      });
      assert.ok(response && response.status() === 200, "Hosted page is unavailable: " + file);
      assert.equal(new URL(page.url()).origin, new URL(base).origin,
        "Page redirected outside external preview origin: " + file);
      const ctype = response.headers()["content-type"] || "(none)";
      if ((await page.title()).includes("External Content Notice")) {
        const buttons = await page.locator("a,button").evaluateAll(nodes =>
          nodes.map(x => ({text:(x.textContent||"").trim().slice(0,75),
            href:x.getAttribute("href")||""})).filter(x => x.text).slice(0,12));
        console.log("NOTICE: raw.githack requires explicit first-visit review confirmation " +
          JSON.stringify(buttons));
        const proceed = page.locator("a,button").filter({ hasText: /Open the page/i }).first();
        assert.equal(await proceed.count(), 1,
          "RawGit external notice did not provide an explicit review action");
        await proceed.click({ timeout: 12000 });
        await page.waitForLoadState("domcontentloaded", { timeout: 25000 });
        console.log("PASS: raw.githack external content notice acknowledged in disposable Chromium context");
      }
      console.log("DIAG: hosted " + file + " content_type=" + ctype +
        " title=" + JSON.stringify(await page.title()) +
        " preview_marker=" + (await page.content()).includes("stage38-public-static-warning"));
      await page.locator("#stage38-public-static-warning").waitFor({
        state: "visible", timeout: 16000,
      });
      const warning = (await page.locator("#stage38-public-static-warning").innerText()).trim();
      assert.match(warning, /로그인\/개인정보 입력 금지/);
      assert.equal(await page.locator("#stage38-cdn-static-guard").count(), 1,
        "Missing credential blocking code: " + file);
      const policy = await page.locator('meta[http-equiv="Content-Security-Policy"]').evaluateAll(
        nodes => nodes.map(n => n.getAttribute("content") || "").join(" | ")
      );
      assert.match(policy, /connect-src 'none'/);
      assert.match(policy, /form-action 'none'/);
      const disabled = await page.evaluate(() =>
        [...document.querySelectorAll('input[type="password"], input[type="email"]')]
          .every(x => x.disabled)
      );
      assert.equal(disabled, true, "Credential fields active on public CDN: " + file);
      const txt = (await page.locator("body").innerText()).trim();
      assert.ok(txt.length >= 30, "Hosted page has no body content: " + file);
      console.log("PASS: hosted Chromium " + file +
        " visible, password-disabled, API-blocked; chars=" + txt.length);
      await page.close();
    }
    await context.close();
    assert.deepEqual(attemptedForbidden, [], "External static preview attempted forbidden servers");
    console.log("PASS: hosted Chromium made 0 production/staging Supabase network requests");
    console.log("NOTICE: This is STATIC hosted smoke only, not MFA browser E2E or release approval");
  } finally {
    await browser.close();
  }
}
run().catch(e => {
  console.error("FAIL: " + e.message);
  process.exitCode = 1;
});
