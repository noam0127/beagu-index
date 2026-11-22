import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Static verification ONLY: this script does not connect to any database.
const source=readFileSync("tests/stage38-staging-db-contract.sql","utf8");
assert.match(source,/EXPECTED PROJECT REF: ycwuugggqbunlbwuzvbx/);
assert.match(source,/NEVER execute on production ref snvzwrexuqavnfvzgxqj/);
assert.match(source,/WITH required\(component, object_type, object_name\) AS \(/);
assert.match(source,/FROM pg_class c/);
assert.match(source,/FROM pg_proc p/);
assert.match(source,/FROM presence/);

// Exclude comments and reject statement classes capable of writes or privileged
// operations. The real live read-only audit is performed separately.
const executable=source.split("\n")
  .filter(line=>!line.trimStart().startsWith("--")).join("\n");
assert.doesNotMatch(executable,
  /\b(INSERT|UPDATE|DELETE|TRUNCATE|MERGE|CREATE|DROP|ALTER|GRANT|REVOKE|COPY|CALL|DO|EXECUTE|PERFORM|LOCK|SET|RESET|VACUUM|ANALYZE|REFRESH|REINDEX)\b/i);
assert.match(executable,/^\s*WITH\s+/i);
assert.ok(executable.trimEnd().endsWith(";"));
assert.equal((executable.match(/;/g)||[]).length,1);

const items=[...executable.matchAll(/\('([^']+)','(table|rpc)','([a-z0-9_]+)'\)/g)]
  .map(m=>({component:m[1],kind:m[2],name:m[3]}));
assert.equal(items.length,38,"Expected exactly 27 relation paths + 11 RPC paths");
const keys=items.map(x=>x.component+":"+x.kind+":"+x.name);
assert.equal(new Set(keys).size,items.length,"Duplicate dependency within one API");
for(const key of [
  "level-api:table:schools",
  "level-api:table:beagu_level_codes",
  "level-api:rpc:beagu_consume_login_budget",
  "postit-api:table:beagu_school_report_yearly",
  "postit-api:rpc:beagu_postit_bind_verified_member",
  "admin-members:table:beagu_admin_audit_events",
  "admin-members:rpc:beagu_admin_active_mfa_session"
]) assert.ok(keys.includes(key),"Mandatory Stage38 dependency missing: "+key);

console.log("PASS: Stage38 read-only SQL inventory contains 27 relation + 11 RPC paths and no write statements.");
console.log("NOTE: static checks cannot establish that staging API/E2E works.");
