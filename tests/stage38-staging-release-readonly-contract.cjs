"use strict";
const assert=require("node:assert/strict");
const {readFileSync}=require("node:fs");
const code=readFileSync("tests/fixtures/stage38-staging-release-manager-readonly-v1/index.ts","utf8");
for (const rx of [
  /isolated_preview_read_only/,
  /release_actions_enabled: false/,
  /hosted_preview_verified: false/,
  /if \(input\.action !== "status"\) return deny\(origin, 403, "staging_read_only"\)/,
  /db\.auth\.getUser\(bearer\)/,
  /claims\?\.aal !== "aal2"/,
  /claims\.session_id/,
  /beagu_admin_active_mfa_session/,
  /account\?\.role !== "owner"/,
  /account\.enabled !== true/,
  /owner_required/,
  /invalid_access_token/,
  /origin_not_allowed/,
  /http:\/\/localhost:8000/,
  /http:\/\/127\.0\.0\.1:38738/,
  /beagu_site_release_state_v1/,
  /beagu_site_release_history_v1/,
  /beagu_site_release_jobs_v1/,
]) assert.match(code,rx);
assert.doesNotMatch(code,/https:\/\/(?:www\.)?baeguindex\.com/i);
assert.doesNotMatch(code,/api\.github\.com|token\.actions\.githubusercontent\.com/i);
assert.doesNotMatch(code,/\b(?:fetch|enqueue|githubWorker|workerAction|adminAction)\s*\(/);
assert.doesNotMatch(code,/\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\("beagu_site_release/);
const forbiddenOrigin=code.indexOf('if (origin && !trusted.has(origin))');
const options=code.indexOf('if (request.method === "OPTIONS")');
assert.ok(forbiddenOrigin>=0 && forbiddenOrigin<options,"Untrusted origin OPTIONS must be denied");
const user=code.indexOf("db.auth.getUser(bearer)");
const action=code.indexOf('if (input.action !== "status")');
assert.ok(user>0 && action>user,"Owner JWT and AAL2 must be checked before status/writes");
console.log("PASS: isolated staging release API is owner/AAL2-only read status, no write/worker/GitHub/external navigation paths");
