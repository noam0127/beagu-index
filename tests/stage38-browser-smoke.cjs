#!/usr/bin/env node
"use strict";
// Real headless-browser smoke test of the immutable RC standalone preview.
// This does NOT create an Auth account, authenticate, deploy, or reach production.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");

const root = path.resolve("_preview_standalone_site");
const origin = "http://127.0.0.1:38738";
const routes = ["/index.html", "/admin.html", "/admin-updates.html", "/result.html", "/js/challenge.html"];
const productionHosts = new Set([
  "baeguindex.com",
  "www.baeguindex.com",
  "snvzwrexuqavnfvzgxqj.supabase.co",
]);
const stagingRef = "ycwuugggqbunlbwuzvbx";
const pinnedSha = "5c95aadad971901a8222f83c52e93bf901a3aeb7";

async function main() {
  assert.ok(fs.existsSync(path.join(root, "index.html")), "Offline bundle missing index.html");
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "stage38-release-manifest.json"), "utf8"));
  assert.equal(manifest.source_sha, pinnedSha);
  assert.equal(manifest.supabase_project_ref, stagingRef);
  assert.equal(manifest.deployment_status, "unverified");

  const server = spawn("python3", ["-m", "http.server", "38738", "--bind", "127.0.0.1", "--directory", root], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let browser;
  try {
    let ready = false;
    for (let attempt = 0; attempt < 35; attempt++) {
      try {
        const response = await fetch(origin + "/index.html", { signal: AbortSignal.timeout(1000) });
        if (response.ok) { ready = true; break; }
      } catch { /* server has not started yet */ }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    assert.ok(ready, "Local static review server unavailable");
    browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
    const forbiddenRequests = [];
    for (const file of routes) {
      const context = await browser.newContext({ serviceWorkers: "block" });
      const page = await context.newPage();
      const pageErrors = [];
      page.on("pageerror", error => pageErrors.push(error.message));
      await context.route("**/*", async route => {
        const url = route.request().url();
        let hostname = "";
        try { hostname = new URL(url).hostname.toLowerCase(); } catch { /* browser internal URL */ }
        if (productionHosts.has(hostname)) {
          forbiddenRequests.push(file + " -> " + hostname);
          await route.abort();
        } else {
          await route.continue();
        }
      });
      const response = await page.goto(origin + file, { waitUntil: "domcontentloaded", timeout: 30000 });
      assert.ok(response && response.status() === 200, file + " did not return HTTP 200");
      await page.waitForTimeout(600);
      assert.equal(new URL(page.url()).origin, origin, "Page left isolated review origin");
      const content = (await page.locator("body").innerText({ timeout: 10000 })).trim();
      assert.ok(content.length > 10, "Page body empty or unrendered: " + file);
      const productionLinks = await page.locator('a[href*="baeguindex.com"], link[href*="baeguindex.com"]').count();
      assert.equal(productionLinks, 0, "Isolated RC contains a clickable or canonical production-site link: " + file);
      console.log("PASS: browser rendered " + file + " (visible text chars: " + content.length + ")");
      if (file === "/admin.html") {
        await page.locator("#adminLogin").waitFor({ state: "visible", timeout: 12000 });
        assert.equal(await page.locator("#adminMfa").isVisible(), false,
          "Unauthenticated user reached MFA screen");
        assert.equal(await page.locator("#adminDashboard").isVisible(), false,
          "Unauthenticated user reached admin dashboard");
        await page.locator("#adminEmail").fill("stage38-nonexistent@example.invalid");
        await page.locator("#adminPassword").fill("nonexistent-stage38-password");
        await page.locator("#adminLoginForm button[type=submit]").click();
        await page.waitForFunction(
          () => (document.getElementById("adminNotice")?.textContent || "").includes("이메일 또는 비밀번호를 확인해 주세요."),
          null, { timeout: 15000 }
        );
        assert.equal(await page.locator("#adminDashboard").isVisible(), false);
        assert.equal(await page.locator("#adminPassword").inputValue(), "",
          "Failed password was not erased from login form");
        console.log("PASS: real browser invalid login denied, dashboard/MFA hidden, password cleared");
      }
      if (file === "/admin-updates.html") {
        assert.equal(await page.locator('.release-site-link[aria-disabled="true"]').count(), 1,
          "Explicit production navigation was not disabled in isolated QA");
        await page.locator("#releaseLogin").waitFor({ state: "visible", timeout: 12000 });
        assert.equal(await page.locator("#releaseDashboard").isVisible(), false,
          "Unauthenticated user reached release controls");
        for (const id of ["releaseStageApply", "releaseProdApply", "releaseStageRollback", "releaseProdRollback"]) {
          assert.equal(await page.locator("#" + id).isEnabled(), false,
            "Unauthenticated release button was enabled: " + id);
        }
        console.log("PASS: real browser release center access denied; deploy/rollback controls hidden and disabled");
      }
      if (pageErrors.length) {
        console.log("WARN: browser JS errors on " + file + " (count: " + pageErrors.length + ")");
      }
      await context.close();
    }
    assert.deepEqual(forbiddenRequests, [], "Browser attempted production network requests: " + forbiddenRequests.join(", "));
    console.log("PASS: browser made no requests to production domain or production Supabase host");
    console.log("PASS: isolated offline review browser smoke complete (NO LOGIN, NO MFA, NO DEPLOY)");
  } finally {
    if (browser) await browser.close();
    server.kill("SIGTERM");
  }
}
main().catch(error => { console.error("FAIL: " + error.message); process.exitCode = 1; });
