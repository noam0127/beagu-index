import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { inspectPreviewOrigin } from "../scripts/release-manager/staging-origin-gate.mjs";

const prod = "https://baeguindex.com/";
const matrix = [
  ["same-origin path preview", "https://baeguindex.com/_preview/", false, "same_origin"],
  ["same host alternate path", "https://baeguindex.com/beta/", false, "same_origin"],
  ["www production host", "https://www.baeguindex.com/_preview/", false, "production_cookie_domain_overlap"],
  ["subdomain with shared cookie scope", "https://test.baeguindex.com/", false, "production_cookie_domain_overlap"],
  ["same site deeper subdomain", "https://qa.test.baeguindex.com/", false, "production_cookie_domain_overlap"],
  ["insecure origin", "http://stage.example.net/", false, "invalid_preview_https_url"],
  ["credentials in URL", "https://user:pass@stage.example.net/", false, "invalid_preview_https_url"],
  ["query token in URL", "https://stage.example.net/?token=test", false, "invalid_preview_https_url"],
  ["fragment token in URL", "https://stage.example.net/#token=test", false, "invalid_preview_https_url"],
  ["localhost not a hosted independent site", "https://localhost:3000/", false, "invalid_preview_https_url"],
  ["ip address not a reviewed host", "https://192.0.2.10/", false, "ip_address_not_reviewed_host"],
  ["independent host but path-based deployment", "https://staging.example.net/_preview/", false, "preview_not_site_root"],
  ["independent synthetic host", "https://staging.example.net/", true, null],
  ["independent synthetic project host", "https://beagu-preview.pages.dev/", true, null],
];
for (const [label, url, pass, code] of matrix) {
  const outcome = inspectPreviewOrigin(prod, url);
  assert.equal(outcome.pass, pass, label);
  if (code) assert.ok(outcome.errors.includes(code), label);
}
assert.equal(inspectPreviewOrigin("http://baeguindex.com/", "https://stage.example.net/").pass, false);
const livePath = inspectPreviewOrigin(prod, "https://baeguindex.com/_preview/");
assert.equal(livePath.pass, false, "current preview must not qualify as an independent host");
assert.equal(livePath.note.includes("URL candidate check only"), true);

// CLI fail-closed behavior, without network or credentials.
const cli = "scripts/release-manager/staging-origin-gate.mjs";
assert.throws(() => execFileSync(process.execPath, [cli, prod, "https://baeguindex.com/_preview/"], {
  stdio: "pipe"
}), { status: 1 });
const ok = JSON.parse(execFileSync(process.execPath, [cli, prod, "https://staging.example.net/"], {
  encoding: "utf8"
}));
assert.equal(ok.pass, true);
assert.match(ok.note, /verify TLS/);
console.log("PASS: 38-stage independent preview URL gate rejects same origin, shared cookie domains and unsafe hosts.");
console.log("NOTE: URL shape only; DNS/TLS/Auth/browser session and actual preview deployment remain unverified.");
