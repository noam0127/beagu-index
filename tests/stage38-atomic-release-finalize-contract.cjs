"use strict";
const assert=require("node:assert/strict");
const {readFileSync}=require("node:fs");
const read=p=>readFileSync(p,"utf8");
const edge=read("supabase/functions/beagu-release-manager-v1/index.ts");
const staging=read("supabase/migrations/stage38_staging_atomic_release_finalize_v1.sql");
const migration=read("supabase/migrations/20261122_release_finalization_atomic_v1.sql");
const regression=read("tests/stage38-staging-atomic-release-lifecycle-regression.sql");
const marker="CREATE OR REPLACE FUNCTION public.beagu_site_release_finalize_v1(";
function body(s){
 const start=s.indexOf(marker);
 const end=s.indexOf("REVOKE ALL ON FUNCTION public.beagu_site_release_finalize_v1",start);
 assert.ok(start>=0 && end>start,"Atomic release RPC source missing");
 return s.slice(start,end).trim();
}
assert.equal(body(migration),body(staging),
 "Reviewed release migration must match the actually tested isolated staging DB function");
for(const sql of [migration,staging]){
 assert.match(sql,/SECURITY DEFINER/);
 assert.match(sql,/SET search_path = pg_catalog, public/);
 assert.match(sql,/FOR UPDATE/);
 assert.match(sql,/stale_release_pointer/);
 assert.match(sql,/staging_signoff_mismatch/);
 assert.match(sql,/release_action_target_mismatch/);
 assert.match(sql,/p_outcome='failed'/);
 assert.match(sql,/INSERT INTO public\.beagu_site_release_history_v1/);
 assert.match(sql,/UPDATE public\.beagu_site_release_jobs_v1/);
 assert.match(sql,/UPDATE public\.beagu_site_release_state_v1/);
 assert.match(sql,/GET DIAGNOSTICS rows_updated = ROW_COUNT/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.beagu_site_release_finalize_v1\(uuid,text,text\)\s+FROM PUBLIC,anon,authenticated/i);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.beagu_site_release_finalize_v1\(uuid,text,text\)\s+TO service_role/i);
 assert.doesNotMatch(sql,/\bcron\.schedule\(|\bGRANT\s+EXECUTE\s+.*?\bTO\s+(?:anon|authenticated)\b/i);
}
assert.match(migration,/DO NOT APPLY TO PRODUCTION WITHOUT/);
assert.match(staging,/ycwuugggqbunlbwuzvbx/);
assert.match(staging,/snvzwrexuqavnfvzgxqj/);
const finalizerCalls=[...edge.matchAll(/db\.rpc\("beagu_site_release_finalize_v1"/g)];
assert.equal(finalizerCalls.length,2,"Both success and failure must use atomic finalizer");
for(const x of [
 /p_outcome:"failed"/,/p_outcome:"deployed"/,/p_deployed_url:deployedUrl/,
 /githubWorker\(jwt\)/,/beagu_admin_active_mfa_session/,/test_confirmation_required/
])assert.match(edge,x);
const functionStart=edge.indexOf('if(action==="worker_complete"||action==="worker_fail")');
const functionEnd=edge.indexOf('Deno.serve(',functionStart);
assert.ok(functionStart>=0&&functionEnd>functionStart);
const workerBlock=edge.slice(functionStart,functionEnd);
assert.doesNotMatch(workerBlock,/from\("beagu_site_release_state_v1"\)\.update\(|from\("beagu_site_release_history_v1"\)\.insert\(|from\("beagu_site_release_jobs_v1"\)\.update\(/,
 "Worker API may not perform multi-request state/history/job writes");
for(const pattern of [
 /\bBEGIN;/,/\bROLLBACK;/,/overlapping release jobs/i,/stage_apply/,
 /prod_apply/,/prod_rollback/,/stage_rollback/,/data_refresh/,
 /stale pointer/i,/History insert error left a half-applied release/,
 /anon reached service-only release finalizer/i,/already_complete/
]) assert.match(regression,pattern);
console.log("PASS: actual staging SQL and proposed release finalizer match exactly, keep service-only security, cover crash rollback");
console.log("PASS: proposed worker completion/failure both call single atomic DB RPC, no separate pointer/history/job mutations");
