import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const json=JSON.parse(readFileSync("docs/releases/v2-step11-readiness-observation.json","utf8"));
const workflow=readFileSync(".github/workflows/site-release-manager-validation.yml","utf8");
const worker=readFileSync("scripts/release-manager/worker.py","utf8");
const server=readFileSync("supabase/functions/beagu-release-manager-v1/index.ts","utf8");

test("staging database and release API were read-only inspected and are NOT ready",()=>{
 assert.equal(json.staging_metadata.public_tables_observed,0);
 assert.equal(json.staging_metadata.release_manager_edge_function_present,false);
 assert.ok(json.staging_metadata.edge_function_slugs_observed.includes("beagu-stage-preview"));
 assert.equal(json.release_gate,"blocked");
 assert.ok(json.blocker_codes.includes("staging_public_schema_missing"));
 assert.ok(json.blocker_codes.includes("staging_release_edge_function_missing"));
 assert.equal(json.candidate.sandbox_db_migrations,"blocked_no_staging_business_schema");
 assert.equal(json.candidate.sandbox_rls,"blocked_no_staging_business_schema");
});

test("green CI must not be presented as browser, RLS or Auth E2E success",()=>{
 assert.equal(json.candidate.deployed_candidate_browser_e2e,"not_performed");
 assert.equal(json.candidate.sandbox_auth_integration,"blocked_no_staging_business_schema");
 assert.equal(json.candidate.staging_candidate_deployed,false);
 assert.equal(json.candidate.production_candidate_deployed,false);
 assert.equal(json.candidate.owner_approval,false);
 assert.equal(json.candidate.existing_deployed_preview_http,
  "check_via_ci_read_only_existing_version");
});

test("all quality checks run read-only and include actual integrated TypeScript",()=>{
 assert.match(workflow,/denoland\/setup-deno@v2/);
 assert.match(workflow,/deno check supabase\/functions\/beagu-release-manager-v1\/index\.ts/);
 assert.match(workflow,/python3 tests\/release-step11-offline-integration\.py/);
 assert.match(workflow,/node --test tests\/release-step11-readiness\.mjs/);
 assert.match(workflow,/python3 tests\/staging-http-smoke\.py/);
 assert.match(workflow,/permissions:\s*\n\s*contents: read/);
 assert.doesNotMatch(workflow,/actions\/deploy-pages@/);
 assert.doesNotMatch(workflow,/mcp__Supabase__execute_sql|supabase db push/);
});

test("security locks remain enforced after integrating three contested PRs",()=>{
 assert.match(server,/const PRODUCTION_RELEASES_PAUSED=true;/);
 assert.match(server,/!SHA\.test\(String\(prev\.from_sha\|\|""\)\)/);
 assert.match(worker,/plan\.get\("target"\) != "staging"/);
 assert.match(worker,/isolate_preview_backend\(preview_dir\)/);
 assert.match(worker,/overlay_approved_directory\(OUTPUT, approved_blob\)/);
});

test("readiness observation is advisory data, not an approval credential",()=>{
 assert.match(json.evidence_warning,/advisory/);
 assert.match(json.evidence_warning,/must never be trusted/);
 assert.equal(json.schema_version,1);
 assert.ok(json.blocker_codes.length>=5);
});
