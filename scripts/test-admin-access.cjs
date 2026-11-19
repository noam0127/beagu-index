/* First-stage regression checks. These do NOT substitute for real-user MFA E2E. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const {execFileSync} = require("node:child_process");
const read = path => fs.readFileSync(path,"utf8");
execFileSync(process.execPath,["--check","js/beagu-admin-access-v1.js"],{stdio:"inherit"});
const page=read("admin.html"),client=read("js/beagu-admin-access-v1.js");
const gate=read("supabase/functions/beagu-admin-access/index.ts");
const sql=read("supabase/migrations/20261120_admin_access_mfa_audit.sql");
assert.match(page,/id="adminLoginForm"/);
assert.match(page,/id="adminMfaForm"/);
assert.doesNotMatch(page,/visit-stats|search-telemetry|arcade-leaderboard/);
assert.match(client,/auth\.signInWithPassword/);
assert.match(client,/auth\.mfa\.enroll/);
assert.match(client,/auth\.mfa\.challengeAndVerify/);
assert.match(client,/gate\("verify"\)/);
assert.doesNotMatch(client,/service_role|SUPABASE_SERVICE_ROLE_KEY|\.signUp\(/);
assert.match(gate,/db\.auth\.getUser\(jwt\)/);
assert.match(gate,/claims\.aal !== "aal2"/);
assert.match(gate,/beagu_admin_accounts/);
assert.match(gate,/account\?\.enabled/);
assert.match(sql,/enable row level security/gi);
assert.match(sql,/revoke all on table public\.beagu_admin_accounts from public, anon, authenticated/);
assert.match(sql,/revoke all on table public\.beagu_admin_audit_events from public, anon, authenticated/);
assert.doesNotMatch(sql,/grant .* to authenticated/i);

// Signed administrators must never enter ordinary visit/search tables.
const exclusion = read("supabase/migrations/20261120_admin_visit_search_exclusion.sql");
assert.match(exclusion,/auth\.uid\(\)/);
assert.match(exclusion,/return null/i);
assert.match(exclusion,/before insert on beagu_private\.visits/i);
assert.match(exclusion,/before insert on public\.school_search_events/i);

// Games use Auth identity on the server, before any session or score INSERT.
const arcadeEdge=read("supabase/functions/arcade-leaderboard/index.ts");
const gameClient=read("js/arcade-leaderboard-v1.js");
execFileSync(process.execPath,["--check","js/arcade-leaderboard-v1.js"],{stdio:"inherit"});
assert.match(arcadeEdge,/authenticatedAdmin\(req\)/);
assert.match(arcadeEdge,/admin:boolean;invalid:boolean/);
assert.match(arcadeEdge,/excluded:true/);
assert.ok(arcadeEdge.indexOf("if(actor.admin)") < arcadeEdge.indexOf("const hash=await ipHash(req)"));
assert.match(gameClient,/options\.headers\.Authorization="Bearer "\+token/);
assert.match(gameClient,/data\.excluded===true/);
for(const page of ["teacher-volleyball.html","teacher-run.html"]){
  const markup=read(page);
  const sdk=markup.indexOf("js/supabase-config.js");
  const game=markup.indexOf("js/arcade-leaderboard-v1.js");
  assert(sdk !== -1 && game !== -1 && sdk < game);
}

console.log("admin-access static/syntax checks passed; MFA browser E2E pending admin provisioning");