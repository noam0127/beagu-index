import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Static lint only. The SQL is executed separately on the isolated staging DB.
const source=readFileSync("tests/stage38-staging-column-parity.sql","utf8");
assert.match(source,/EXPECTED_PROJECT_REF: ycwuugggqbunlbwuzvbx/);
assert.match(source,/NEVER_RUN_ON_PRODUCTION_REF: snvzwrexuqavnfvzgxqj/);
const sql=source.split("\n").filter(x=>!x.trimStart().startsWith("--")).join("\n");
assert.match(sql,/^\s*WITH expected\(/i);
assert.equal((sql.match(/;/g)||[]).length,1);
assert.match(sql,/to_regnamespace\('stage_private'\) IS NOT NULL/);
assert.match(sql,/to_regclass\('stage_private\.fake_schools'\) IS NOT NULL/);
assert.match(sql,/BLOCKED_SCHEMA_DRIFT/);
assert.match(sql,/PRESENT_NEEDS_RUNTIME_VERIFICATION/);
assert.doesNotMatch(sql,/\b(INSERT|UPDATE|DELETE|TRUNCATE|MERGE|CREATE|DROP|ALTER|GRANT|REVOKE|COPY|CALL|DO|EXECUTE|PERFORM|LOCK|RESET|VACUUM|REFRESH|REINDEX)\b/i,
  "The catalog audit may not change data or privileges");
const rows=[...sql.matchAll(/\('public','([a-z0-9_]+)','([a-z0-9_]+)'\)/g)]
  .map(m=>({table:m[1],column:m[2]}));
assert.equal(rows.length,22,"Expected 22 reviewed column gaps");
assert.equal(new Set(rows.map(x=>x.table+"."+x.column)).size,rows.length);
const expected={
  beagu_2026_results_snapshot:8,
  beagu_admin_accounts:2,
  beagu_metric_catalog:4,
  beagu_release_metrics_v2:8
};
for (const [table,count] of Object.entries(expected)) {
  assert.equal(rows.filter(x=>x.table===table).length,count,
    "Column contract changed without review for "+table);
}
assert.deepEqual(new Set(rows.map(x=>x.table)),new Set(Object.keys(expected)));
console.log("PASS: Stage38 22 missing-column staging-only SQL audit is static, read-only, schema-scoped and fail-closed.");
console.log("NOTE: this check does not prove that any staging migration has been applied.");
