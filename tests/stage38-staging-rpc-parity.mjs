import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const path="tests/stage38-staging-rpc-parity.sql";
const source=readFileSync(path,"utf8");
assert.match(source,/STAGING ONLY\s+ycwuugggqbunlbwuzvbx/);
assert.match(source,/PRODUCTION NEVER EXECUTE:\s+snvzwrexuqavnfvzgxqj/);
assert.match(source,/to_regnamespace\('stage_private'\) IS NOT NULL/);
assert.match(source,/to_regclass\('stage_private\.fake_schools'\) IS NOT NULL/);
assert.match(source,/pg_get_function_identity_arguments\(p\.oid\)/);
assert.match(source,/pg_get_function_result\(exact_oid\)/);
assert.match(source,/p\.prosecdef/);
assert.match(source,/has_function_privilege\('anon',exact_oid,'EXECUTE'\)/);
assert.match(source,/has_function_privilege\('authenticated',exact_oid,'EXECUTE'\)/);
const body=source.split("\n").filter(x=>!x.trimStart().startsWith("--")).join("\n");
assert.match(body,/^\s*WITH expected\(/);
assert.ok(body.trimEnd().endsWith(";"));
assert.equal((body.match(/;/g)||[]).length,1);
assert.doesNotMatch(body,
  /\b(INSERT|UPDATE|DELETE|TRUNCATE|MERGE|CREATE|DROP|ALTER|GRANT|REVOKE|COPY|CALL|DO|EXECUTE\s+FUNCTION|PERFORM|LOCK|SET|RESET|VACUUM|ANALYZE|REFRESH|REINDEX)\b/i,
  "Only catalog SELECT is permitted; no write/GRANT/security changes");
const records=[...body.matchAll(/\('([a-z0-9-]+)', '([a-z0-9_]+)', '([^']*)', '([^']+)', (true|false)\)/g)];
assert.equal(records.length,10,"Exactly 10 unique RPC contracts are required");
const names=records.map(m=>m[2]);
assert.equal(new Set(names).size,10);
for(const name of [
  "beagu_2026_lv2_released_question_results",
  "beagu_admin_active_mfa_session",
  "beagu_consume_login_budget",
  "beagu_has_earned_challenge_visitor",
  "beagu_postit_bind_verified_member",
  "beagu_postit_create_post_v2",
  "beagu_postit_create_comment_v2"
]){
  assert.ok(names.includes(name),"Missing RPC contract: "+name);
}
assert.match(body,/BLOCKED_MISSING_NAME/);
assert.match(body,/BLOCKED_SIGNATURE_MISMATCH/);
assert.match(body,/BLOCKED_RETURN_MISMATCH/);
assert.match(body,/REVIEW_SECURITY_MODE_DIFFERENCE/);
assert.match(body,/PRESENT_SIGNATURE_PARITY/);
assert.doesNotMatch(body,/(?:pg_get_functiondef|prosrc|auth\.users|service_role_key|password_hash)/i,
  "Do not read source bodies, user records or secrets in this preflight");

console.log("PASS: 10 stage-only RPC signatures, return contracts, privilege flags and invoker/definer modes audited read-only.");
console.log("NOTE: this static CI check does not prove that live staging is ready, authorized or deployed.");
