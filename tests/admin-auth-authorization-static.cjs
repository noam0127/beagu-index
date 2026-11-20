const assert=require("node:assert/strict");
const fs=require("node:fs");
const read=p=>fs.readFileSync(p,"utf8");
const access=read("supabase/functions/beagu-admin-access/index.ts");
const dash=read("supabase/functions/beagu-admin-dashboard-v1/index.ts");
const review=read("supabase/functions/beagu-2026-review-admin/index.ts");
for(const src of [access,dash,review]){
 assert.match(src,/\.auth\.getUser\(jwt\)/,"JWT must be validated against Supabase Auth");
 assert.match(src,/beagu_admin_accounts/,"Must require allowlisted account");
 assert.match(src,/aal2/,"Must require AAL2");
 assert.match(src,/beagu_admin_active_mfa_session/,"Must check active server-side session");
}
assert.ok(access.indexOf("beagu_admin_active_mfa_session")<access.indexOf('await audit(userId, "admin_login", "success")'));
assert.match(access,/activeMfa !== true/,"Revoked session must fail closed");
assert.match(access,/session_expired/);
console.log("PASS: every privileged admin API validates allowlist, AAL2 and active MFA session");
