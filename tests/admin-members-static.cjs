const assert = require("node:assert/strict");
const fs = require("node:fs");
const {execFileSync} = require("node:child_process");
const read = file => fs.readFileSync(file,"utf8");
const html = read("admin.html");
const browser = read("js/beagu-admin-members-v1.js");
const access = read("js/beagu-admin-access-v1.js");
const backend = read("supabase/functions/beagu-admin-members-v1/index.ts");
const sql = read("supabase/migrations/20261121172000_admin_member_sms_status_v1.sql");
execFileSync(process.execPath,["--check","js/beagu-admin-members-v1.js"],{stdio:"inherit"});
execFileSync(process.execPath,["--check","js/beagu-admin-access-v1.js"],{stdio:"inherit"});
for (const id of [
  "adminMemberManagement","adminMembersSearch","adminMembersRows","adminMembersPrev",
  "adminMembersNext","adminMemberDetailPanel","adminMemberReason","adminMemberSuspend24",
  "adminMemberSuspend7","adminMemberRestore","adminMemberActionStatus"
]) assert(html.includes('id="'+id+'"'),"Missing member UI "+id);
assert.match(html,/js\/beagu-admin-members-v1\.js\?v=/);
assert.match(access,/BeaguMembersAdmin\?\.mount\(proof\.role\)/);
assert.match(access,/BeaguMembersAdmin\?\.reset\(\)/);
assert.match(backend,/beagu_admin_active_mfa_session/);
assert.match(backend,/db\.auth\.getUser\(token\)/);
assert.match(backend,/actor\.role !== "owner"/);
assert.match(backend,/cannot_moderate_admin/);
assert.match(backend,/cannot_moderate_self/);
assert.match(backend,/auth\.admin\.listUsers/);
assert.match(backend,/auth\.admin\.updateUserById/);
assert.match(backend,/beagu_admin_audit_events/);
assert.match(backend,/beagu_admin_member_sms_status_v1/);
assert.ok(!browser.includes("SUPABASE_SERVICE_ROLE_KEY"),"No service key in browser");
assert.ok(!backend.includes("phone_e164"),"Do not expose phone numbers");
assert.match(sql,/REVOKE ALL ON FUNCTION public\.beagu_admin_member_sms_status_v1\(uuid\[\]\) FROM PUBLIC, anon, authenticated/i);
assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.beagu_admin_member_sms_status_v1\(uuid\[\]\) TO service_role/i);
console.log("PASS: member UI, JS syntax, MFA/owner gate, audit, and privacy contract");
