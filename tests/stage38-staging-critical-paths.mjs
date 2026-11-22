import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql=readFileSync("tests/stage38-staging-critical-paths.sql","utf8");
const executable=sql.split("\n").filter(line=>!line.trimStart().startsWith("--")).join("\n");
assert.match(sql,/staging only: ycwuugggqbunlbwuzvbx/);
assert.match(sql,/Never run against production ref snvzwrexuqavnfvzgxqj/);
assert.match(executable,/^\s*WITH required\(/);
assert.equal((executable.match(/;/g)||[]).length,2,"Expected metadata and school-data readiness SELECTs");
assert.doesNotMatch(executable,/to_regnamespace\('stage_private'\)/,"No fake schema readiness filter");
assert.doesNotMatch(executable,/stage_private\.fake_schools/,"No fake school readiness filter");
assert.match(executable,/BLOCKED_NO_STAGING_SCHOOL_DATA/);
assert.match(executable,/BLOCKED_EMPTY_SCHOOL_SORT_VIEW/);
assert.doesNotMatch(executable,
  /\b(INSERT|UPDATE|DELETE|TRUNCATE|MERGE|CREATE|DROP|ALTER|GRANT|REVOKE|COPY|CALL|DO|EXECUTE|PERFORM|LOCK|SET|RESET|VACUUM|REFRESH)\b/i,
  "No writes, function execution, grants, or deployment in catalog audit");
const rows=[...executable.matchAll(/\('([a-z_]+)','(rpc|table)','([a-z_0-9]+)'\)/g)]
  .map(m=>({path:m[1],kind:m[2],dependency:m[3]}));
assert.equal(rows.length,18,"Expected 18 pinned action-dependency edges");
const paths=new Set(rows.map(x=>x.path));
assert.deepEqual([...paths].sort(),[
  "admin_member_list","admin_member_moderation","challenge_code_login",
  "participation_code_login","postit_link_member","postit_school_context"
]);
assert.equal(new Set(rows.map(x=>x.path+":"+x.kind+":"+x.dependency)).size,18);
for (const [path,kind,dependency] of [
  ["participation_code_login","rpc","beagu_consume_login_budget"],
  ["participation_code_login","table","beagu_level_codes"],
  ["challenge_code_login","rpc","beagu_earned_challenge_visitor"],
  ["postit_link_member","rpc","beagu_postit_bind_verified_member"],
  ["postit_school_context","table","schools"],
  ["admin_member_list","rpc","beagu_admin_active_mfa_session"],
  ["admin_member_list","rpc","beagu_admin_member_sms_status_v1"],
  ["admin_member_moderation","table","beagu_admin_audit_events"]
]) {
  assert.ok(rows.some(x=>x.path===path&&x.kind===kind&&x.dependency===dependency),
    "Missing mandatory preflight: "+path+" -> "+dependency);
}
assert.match(executable,/METADATA_PRESENT_REQUIRES_E2E/);
assert.match(executable,/BLOCKED_MISSING_DEPENDENCIES/);
console.log("PASS: Stage38 staging critical paths pinned to 18 catalog edges; query is read-only and release status stays blocked until E2E.");
