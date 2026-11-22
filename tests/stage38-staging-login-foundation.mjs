import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const path="docs/releases/templates/stage38-staging-login-foundation.sql";
assert.ok(existsSync(path),"Owner-review-only staging login template is missing");
const text=readFileSync(path,"utf8");
const executable=text.split("\n").filter(line=>!line.trimStart().startsWith("--")).join("\n");
assert.match(text,/REVIEW-ONLY \/ NOT AN ACTIVE MIGRATION/);
assert.match(text,/STAGING ONLY|STAGING_ONLY|TARGET: isolated Supabase ycwuugggqbunlbwuzvbx ONLY/);
assert.match(text,/NEVER APPLY TO production Supabase snvzwrexuqavnfvzgxqj/);
assert.match(executable,/^\s*BEGIN;/);
assert.match(executable,/COMMIT;\s*$/);
assert.equal((executable.match(/CREATE TABLE public\./g)||[]).length,2);
assert.match(executable,/CREATE TABLE public\.beagu_level_codes\s*\(/);
assert.match(executable,/CREATE TABLE public\.beagu_login_budget\s*\(/);
assert.match(executable,/CREATE FUNCTION public\.beagu_consume_login_budget\(\)/);
assert.match(executable,/RETURNS boolean/);
assert.match(executable,/SECURITY INVOKER/);
assert.doesNotMatch(executable,/SECURITY DEFINER/i);
assert.match(executable,/SET search_path TO ''/);
assert.match(executable,/current_setting\('app\.stage38_approved_target_ref', true\)/);
assert.match(executable,/IS DISTINCT FROM 'ycwuugggqbunlbwuzvbx'/);
assert.match(executable,/to_regclass\('stage_private\.fake_schools'\) IS NULL/);
assert.match(executable,/to_regclass\('stage_private\.members'\) IS NULL/);
assert.match(executable,/to_regclass\('public\.beagu_site_release_state_v1'\) IS NOT NULL/);
assert.match(executable,/to_regclass\('beagu_private\.challenge_identity_codes'\) IS NOT NULL/);
assert.match(executable,/STAGE38_STAGING_ONLY_TARGET_GUARD_FAILED/);
assert.match(executable,/STAGE38_LOGIN_FOUNDATION_ALREADY_EXISTS_REVIEW_REQUIRED/);
assert.doesNotMatch(executable,/\bIF NOT EXISTS\b/i);
for(const name of ["beagu_login_budget","beagu_level_codes"]) {
  assert.match(executable,new RegExp("ALTER TABLE public\\."+name+" ENABLE ROW LEVEL SECURITY"));
  assert.match(executable,new RegExp("REVOKE ALL ON TABLE public\\."+name+" FROM PUBLIC, anon, authenticated"));
}
assert.match(executable,/GRANT SELECT ON TABLE public\.beagu_level_codes TO service_role/);
assert.match(executable,/GRANT SELECT, INSERT, UPDATE, DELETE\s+ON TABLE public\.beagu_login_budget TO service_role/);
assert.match(executable,/REVOKE ALL ON FUNCTION public\.beagu_consume_login_budget\(\)\s+FROM PUBLIC, anon, authenticated/);
assert.match(executable,/GRANT EXECUTE ON FUNCTION public\.beagu_consume_login_budget\(\)\s+TO service_role/);
assert.match(executable,/WHERE public\.beagu_login_budget\.attempts < 60/);
assert.match(executable,/RETURN COALESCE\(v_attempts BETWEEN 1 AND 60, false\)/);
assert.match(executable,/code_sha256 text NOT NULL UNIQUE CHECK \(code_sha256 ~ '\^\[a-f0-9\]\{64\}\$'\)/);
assert.match(executable,/access_level smallint NOT NULL CHECK \(access_level IN \(1, 2\)\)/);
// The application code is server-only. Never bootstrap a publicly usable code,
// create real users, or weaken RLS in a review template.
assert.doesNotMatch(executable,/\bINSERT\s+INTO\s+public\.beagu_level_codes\b/i);
assert.doesNotMatch(executable,/\b(?:CREATE|ALTER)\s+(?:ROLE|USER)\b/i);
assert.doesNotMatch(executable,/\b(?:DISABLE ROW LEVEL SECURITY|BYPASSRLS)\b/i);
assert.doesNotMatch(executable,/\bGRANT\s+(?:ALL|EXECUTE|SELECT|INSERT|UPDATE|DELETE)[\s\S]{0,150}\bTO\s+(?:PUBLIC|anon|authenticated)\b/i);
assert.doesNotMatch(executable,/\b(?:auth\.users|auth\.sessions|storage\.objects|http\.|net\.http_|pg_read_file)\b/i);
assert.doesNotMatch(executable,/\b(?:service_role_key|sb_secret_|SUPABASE_SERVICE_ROLE_KEY)\b/i);
assert.doesNotMatch(executable,/\bSET\s+app\.stage38_approved_target_ref\s*=/i,
  "Reviewed template may not self-authorize its session marker");
console.log("PASS: Stage38 staging-only login DDL is inactive, guarded, synthetic-only, RLS-on, service-role-only, and rate-limited.");
console.log("NOTE: SQL semantic execution and operator/project identity still require separate approved testing.");
