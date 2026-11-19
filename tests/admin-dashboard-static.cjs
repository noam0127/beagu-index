// Stage-2 admin dashboard security & UI checks (does not create Auth accounts).
const assert=require("node:assert/strict");
const fs=require("node:fs");
const {execFileSync}=require("node:child_process");
const file=p=>fs.readFileSync(p,"utf8");
execFileSync(process.execPath,["--check","js/beagu-admin-access-v1.js"],{stdio:"inherit"});
const html=file("admin.html"),client=file("js/beagu-admin-access-v1.js");
const api=file("supabase/functions/beagu-admin-dashboard-v1/index.ts");
const sql=file("supabase/migrations/20261120_admin_dashboard_v1.sql");
const sessionSql=file("supabase/migrations/20261120_admin_mfa_session_collector_guard.sql");
const home=file("index.html");
for(const text of ["adminDashboard","adminVisitChart","adminSearchChart","adminGameChart","adminGameCards","adminGameScores","adminAudit","adminSchoolRanking","adminMfa","adminLogin","adminPeriods"]){
 assert(html.includes('id="'+text+'"'),"Missing dashboard element "+text);
}
assert(!/visit-stats\.js|search-telemetry-v1\.js|arcade-leaderboard-v1\.js/.test(html),"No ordinary telemetry in admin page");
assert(!/href="admin\.html"|src="admin\.html"/.test(home),"Admin page must stay out of public navigation");
assert(/<meta name="robots" content="noindex,nofollow,noarchive">/.test(html));
assert(/gate\("verify"\)/.test(client) && /await loadMetrics\(\)/.test(client));
assert(/mfa\.challengeAndVerify/.test(client));
assert(/id="adminPasswordChangeForm"/.test(html));
assert(/auth\.updateUser\(\{password\}\)/.test(client));
assert(/minlength="16"/.test(html));
assert(!/adminNewPassword|adminConfirmPassword/.test(api),"No password fields in admin API");
assert(/auth\.getSession\(\)/.test(client));
assert(!/service_role|SUPABASE_SERVICE_ROLE_KEY/.test(client));
assert(/admin\.auth\.getUser\(jwt\)/.test(api));
assert(/claims\.aal!=="aal2"/.test(api));
assert(/beagu_admin_active_mfa_session/.test(api));
assert(/beagu_admin_accounts/.test(api));
assert(/beagu_admin_dashboard_v1/.test(api));
assert(/beagu_admin_audit_events/.test(api));
assert(/revoke all on function public\.beagu_admin_dashboard_v1\(text\) from public, anon, authenticated/i.test(sql));
assert(/grant execute on function public\.beagu_admin_dashboard_v1\(text\) to service_role/i.test(sql));
assert(/before insert on beagu_private\.school_view_daily/.test(sessionSql));
assert(!/service_role|SUPABASE_SERVICE_ROLE_KEY/.test(html));
console.log("PASS: admin dashboard syntax, MFA gating, user metrics, private aggregation, and unlisted public navigation");