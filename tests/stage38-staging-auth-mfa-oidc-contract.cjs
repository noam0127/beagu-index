"use strict";
const assert = require("node:assert/strict");
const {readFileSync}=require("node:fs");
const code=readFileSync("tests/fixtures/stage38-staging-auth-mfa-oidc-once/index.ts","utf8");
for(const pattern of [
  /createRemoteJWKSet/,/jwtVerify\(bearer, jwks/,
  /audience: AUD/,/payload\.repository !== REPO/,/payload\.ref !== REF/,
  /payload\.workflow_ref === WORKFLOW/,/payload\.event_name === "push"/,
  /payload\.ref === "refs\/pull\/244\/merge"/,
  /payload\.head_ref === "hotfix\/v1\.1\.0-preview-backend-isolation"/,
  /payload\.base_ref === "main"/,
  /req\.headers\.has\("Origin"\)/,/SUPABASE_SERVICE_ROLE_KEY/,
  /url\.includes\(PROD_REF\)/,
  /auth\.admin\.createUser\(/,/email_confirm: true/,
  /auth\.signInWithPassword\(/,/aal === "aal1"/,
  /auth\.mfa\.enroll\(/,/auth\.mfa\.challenge\(/,/auth\.mfa\.verify\(/,
  /aal === "aal2"/,/beagu-admin-access/,/beagu-admin-dashboard-v1/,
  /beagu-release-manager-v1/,/staging_read_only/,
  /auth\.admin\.deleteUser\(id\)/,/\.delete\(\)\.eq\("user_id", id\)/,
  /finally \{/,
]) assert.match(code,pattern);
assert.doesNotMatch(code,/console\.(?:log|debug|error).*?(?:password|secret|access_token|totp)/i);
assert.doesNotMatch(code,/https:\/\/(?:www\.)?baeguindex\.com/i);
assert.doesNotMatch(code,/https:\/\/api\.github\.com/i);
assert.match(code,/checks,\s*cleanup:/);
console.log("PASS: temporary real TOTP test requires narrow GitHub OIDC, legitimate GoTrue Auth and account deletion in finally");
