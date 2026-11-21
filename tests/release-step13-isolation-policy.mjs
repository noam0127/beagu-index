import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const file=p=>readFileSync(p,"utf8");
const legacy=file(".github/workflows/beagu-release-controller.yml");
const isolated=file(".github/workflows/staging-isolated-artifact-validation.yml");
const source=file("scripts/release-manager/build-isolated-staging.py");
const stageTest=file("tests/release-step13-standalone-staging.py");
const readiness=JSON.parse(file("docs/releases/v2-step13-staging-readiness.json"));

test("shared GitHub Pages controller is explicitly paused in development code",()=>{
 assert.match(legacy,/approved-release:\n(?:\s*#[^\n]*\n)*\s*if: \$\{\{ false \}\}/);
 assert.match(legacy,/actions\/deploy-pages@v4/);
 assert.equal(readiness.production_pages_job_disabled_in_live_main,false);
 assert.equal(readiness.production_pages_job_disabled_in_development_code,true);
});

test("isolated staging workflow has read-only perms and no publishing authorization",()=>{
 assert.match(isolated,/permissions:\s*\n\s*contents: read/);
 assert.match(isolated,/ref: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/);
 assert.match(isolated,/actions\/upload-artifact@v4/);
 assert.match(isolated,/retention-days: 1/);
 assert.match(isolated,/if: github\.event\.pull_request\.head\.repo\.full_name == github\.repository/);
 assert.doesNotMatch(isolated,/^\s*(?:pages|id-token): write/m);
 assert.doesNotMatch(isolated,/^\s*(?:uses|run):[^\n]*(?:deploy-pages|supabase db push|vercel --prod)/m);
 assert.doesNotMatch(isolated,/ACTIONS_ID_TOKEN_REQUEST_TOKEN/);
});

test("standalone staging never uses shared production CNAME or _preview",()=>{
 assert.match(source,/if \(dest \/ "CNAME"\)\.exists\(\) or \(dest \/ "_preview"\)\.exists\(\)/);
 assert.match(source,/BLOCKED_ROOT = \{"CNAME"/);
 assert.match(source,/source_files/);
 assert.match(stageTest,/self\.assertFalse\(\(destination \/ "CNAME"\)\.exists\(\)\)/);
 assert.match(stageTest,/self\.assertFalse\(\(destination \/ "_preview"\)\.exists\(\)\)/);
});

test("offline builder denies live host, forbids production Supabase and external write channels",()=>{
 assert.match(source,/LIVE_REF = "snvzwrexuqavnfvzgxqj"/);
 assert.match(source,/STAGE_REF = "ycwuugggqbunlbwuzvbx"/);
 assert.match(source,/host in \("baeguindex\.com", "www\.baeguindex\.com"\)/);
 assert.match(source,/form-action 'self'/);
 assert.match(source,/frame-src 'self'/);
 assert.match(source,/connect-src 'self'/);
 assert.match(source,/live_key|LIVE_KEY/);
 assert.match(source,/source_files/);
 assert.match(stageTest,/assertNotIn\(builder\.LIVE_REF/);
 assert.match(stageTest,/assertNotIn\(builder\.LIVE_KEY/);
});

test("no staging host, DB schema, Auth, RLS or approval is inferred from offline artifact",()=>{
 assert.equal(readiness.readiness,"blocked");
 assert.equal(readiness.independent_staging_host_configured,false);
 assert.equal(readiness.staging_public_business_tables_observed,0);
 assert.equal(readiness.staging_release_manager_edge_function_verified,false);
 assert.equal(readiness.staging_artifact_hosted,false);
 assert.equal(readiness.browser_network_isolation_verified,false);
 assert.equal(readiness.approval_to_publish,false);
 assert.equal(readiness.non_authoritative_note.includes("not accept"),true);
});

test("step12 immutable version and production release locks remain active",()=>{
 const edge=file("supabase/functions/beagu-release-manager-v1/index.ts");
 assert.match(edge,/const RELEASE_VERSION_CREATION_PAUSED=true;/);
 assert.match(edge,/const PRODUCTION_RELEASES_PAUSED=true;/);
 assert.match(edge,/\["create_version","register","stage_apply"\]\.includes\(action\)/);
});
