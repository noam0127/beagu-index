"use strict";
const assert=require("node:assert/strict");
const {readFileSync}=require("node:fs");
const code=readFileSync("tests/fixtures/stage38-staging-admin-dashboard-v1/index.ts","utf8");
for (const pattern of [
  /admin\.auth\.getUser\(jwt\)/,
  /beagu_admin_accounts/,
  /claims\.aal!=="aal2"/,
  /beagu_admin_active_mfa_session/,
  /!claims\.session_id/,
  /admin_dashboard_read/,
  /beagu_admin_audit_events/,
  /origin_not_allowed/,
  /beagu_admin_dashboard_v1/,
  /beagu_admin_live_traffic_v1/,
  /beagu_admin_page_perf_v1/,
  /beagu_admin_telemetry_health_v2/,
  /beagu_admin_referral_funnel_v1/,
]) assert.match(code,pattern);
assert.doesNotMatch(code,/https:\/\/(?:www\.)?baeguindex\.com/);
const guard=code.indexOf('if(origin&&!allowed.has(origin))');
const options=code.indexOf('if(req.method==="OPTIONS")');
const auth=code.indexOf('admin.auth.getUser(jwt)');
const dashboard=code.indexOf('admin.rpc("beagu_admin_dashboard_v1"');
assert.ok(guard!==-1 && options>guard,"Forbidden origins must be denied before preflight");
assert.ok(auth!==-1 && dashboard>auth,"JWT must be authenticated before data RPC");
assert.ok(code.includes('allowed.has(origin)?{"Access-Control-Allow-Origin":origin}:{}'),
  "Unknown origins may not receive CORS approval");
console.log("PASS: staging dashboard requires real auth, MFA, session, roles and audit; denies production origins");
