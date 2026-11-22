"use strict";
const assert=require("node:assert/strict");
const {readFileSync}=require("node:fs");
const read=(file)=>readFileSync(file,"utf8");
const original=read("supabase/migrations/20261120_admin_dashboard_v1.sql");
const staged=read("tests/fixtures/stage38-staging-dashboard-rpc.sql");
const tables=read("tests/fixtures/stage38-staging-dashboard-tables.sql");
const test=read("tests/stage38-staging-dashboard-aggregate-regression.sql");
assert.ok(staged.includes(original.trim()),"Staging dashboard must preserve the exact original source migration");
for(const s of [staged,tables,test]){
  assert.match(s,/ycwuugggqbunlbwuzvbx/);
  assert.match(s,/snvzwrexuqavnfvzgxqj/);
}
assert.match(original,/revoke all on function public\.beagu_admin_dashboard_v1\(text\) from public, anon, authenticated/i);
assert.match(original,/grant execute on function public\.beagu_admin_dashboard_v1\(text\) to service_role/i);
const entities=[
 "beagu_private.participants",
 "beagu_private.school_view_daily",
 "beagu_private.school_view_admin_exclusions",
 "public.school_search_events",
 "public.arcade_game_sessions",
 "public.arcade_game_scores"
];
for(const entity of entities){
  const e=entity.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
  assert.match(tables,new RegExp("CREATE TABLE IF NOT EXISTS "+e,"i"));
  assert.match(tables,new RegExp("ALTER TABLE "+e+" ENABLE ROW LEVEL SECURITY","i"));
  assert.match(tables,new RegExp("REVOKE ALL ON "+e+" FROM PUBLIC,anon,authenticated","i"));
  assert.match(tables,new RegExp("GRANT SELECT ON "+e+" TO service_role","i"));
}
assert.match(tables,/beagu_skip_admin_school_event/);
assert.match(tables,/beagu_skip_admin_school_view_daily/);
assert.match(tables,/game='volleyball_25' AND win_time_tenths BETWEEN 1 AND 36000/);
assert.match(tables,/arcade_game_scores_session_id_key|session_id uuid NOT NULL UNIQUE/);
assert.match(tables,/arcade_limit_game_record_insert is NOT included/);
assert.doesNotMatch(tables,/\bGRANT\s+INSERT\s+ON\s+public\.arcade_game_scores/i);
assert.match(test,/\bBEGIN;/);
assert.match(test,/\bROLLBACK;/);
assert.match(test,/SET LOCAL ROLE service_role;/);
assert.match(test,/SET LOCAL ROLE anon;/);
assert.match(test,/stage38\.level1_baseline/);
assert.match(test,/school_views'->>'total'/);
assert.match(test,/insufficient_privilege/);
console.log("PASS: staging comprehensive dashboard exact SQL parity, private six-table scaffold, baseline-aware synthetic rollback");
