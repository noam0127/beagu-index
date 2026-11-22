"use strict";
const assert=require("node:assert/strict");
const {readFileSync}=require("node:fs");
const read=p=>readFileSync(p,"utf8");
const original=read("supabase/migrations/20261120_telemetry_guard_decision_monitoring.sql");
const gateway=read("supabase/migrations/20261120_telemetry_gateway_v2.sql");
const stage=read("supabase/migrations/stage38_staging_admin_telemetry_health_rpc.sql");
const regression=read("tests/stage38-staging-telemetry-health-regression.sql");
function section(source, begin, end) {
 const a=source.indexOf(begin),b=source.indexOf(end,a);
 assert.ok(a>=0&&b>a,"Source migration section changed: "+begin);
 return source.slice(a,b).trim();
}
const sections=[
 section(gateway,"create table if not exists beagu_private.beagu_telemetry_source_windows_v2","-- No IP or user-agent"),
 section(original,"create table if not exists beagu_private.beagu_telemetry_guard_decisions_v2","create or replace function beagu_private.beagu_note_telemetry_guard_v2"),
 section(original,"create or replace function beagu_private.beagu_note_telemetry_guard_v2","-- Preserve all established limits"),
 section(original,"create or replace function public.beagu_telemetry_guard_v2","-- Only return cumulative aggregates"),
 section(original,"create or replace function public.beagu_admin_telemetry_health_v2()","-- Keep only 7 days")
];
for (const part of sections) assert.ok(stage.includes(part),"Staging telemetry definition drifted from authoritative production SQL");
assert.match(stage,/ycwuugggqbunlbwuzvbx/);
assert.match(stage,/snvzwrexuqavnfvzgxqj/);
assert.match(stage,/revoke all on function public\.beagu_telemetry_guard_v2\(text,uuid,text\) from public,anon,authenticated/i);
assert.match(stage,/revoke all on function public\.beagu_admin_telemetry_health_v2\(\)\s+from public,anon,authenticated/i);
assert.match(stage,/grant execute on function public\.beagu_admin_telemetry_health_v2\(\) to service_role/i);
assert.match(stage,/grant execute on function public\.beagu_telemetry_guard_v2\(text,uuid,text\) to service_role/i);
assert.doesNotMatch(stage,/\bcron\.schedule\(/i);
assert.doesNotMatch(stage,/\bGRANT\s+EXECUTE\s+.*\bto\s+(anon|authenticated)\b/i);
assert.match(regression,/\bBEGIN;/);
assert.match(regression,/\bROLLBACK;/);
assert.match(regression,/SET LOCAL ROLE anon;/);
assert.match(regression,/SET LOCAL ROLE service_role;/);
assert.match(regression,/guard_source_limited/);
assert.match(regression,/guard_id_rotation_limited/);
assert.match(regression,/saved_visits_24h/);
assert.match(regression,/human_false_positive_rate_measured/);
console.log("PASS: staging telemetry health, source limits, secret-only access and rolled-back fixture contract match original SQL");
