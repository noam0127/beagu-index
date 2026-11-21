import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const source=(name)=>readFileSync(name,"utf8");
const js=source("js/beagu-admin-updates-v1.js");
const server=source("supabase/functions/beagu-release-manager-v1/index.ts");
const python=source("scripts/release-manager/worker.py");
const approval=server.slice(server.indexOf("async function adminAction("),
 server.indexOf("async function workerAction("));
const worker=server.slice(server.indexOf("async function workerAction("));

test("#198 frontend production lock preserves immutable version dropdowns",()=>{
 assert.match(js,/const PRODUCTION_RELEASES_PAUSED=true/);
 assert.match(js,/el\("releaseProdApply"\)\.disabled=PRODUCTION_RELEASES_PAUSED/);
 assert.match(js,/el\("releaseProdRollback"\)\.disabled=PRODUCTION_RELEASES_PAUSED/);
 assert.match(js,/if\(PRODUCTION_RELEASES_PAUSED&&\["prod_apply","prod_rollback"\]\.includes\(action\)\)/);
 assert.match(js,/versions\.filter\(v=>v\.tested\)/);
 assert.match(js,/version_id:selected\.id/);
});

test("#199 owner MFA API rejects production promotions before DB state queries",()=>{
 assert.match(server,/const PRODUCTION_RELEASES_PAUSED=true/);
 assert.match(approval,/if\(PRODUCTION_RELEASES_PAUSED&&\(action==="prod_apply"\|\|action==="prod_rollback"\)\)/);
 const reject=approval.indexOf('return error("production_release_paused",423,origin)');
 assert.ok(reject>=0);
 assert.ok(reject<approval.indexOf("const s=await state();"));
 assert.match(server,/if\(error\|\|!id\|\|c\?\.sub!==id/);
});

test("#199 OIDC worker blocks queued production jobs and unattended data refresh",()=>{
 assert.match(worker,/if\(PRODUCTION_RELEASES_PAUSED&&job\?\.target==="production"\)/);
 assert.match(worker,/if\(!PRODUCTION_RELEASES_PAUSED&&!job&&!s\.production_sha\)/);
 assert.match(worker,/if\(!PRODUCTION_RELEASES_PAUSED&&!job&&s\.production_sha&&s\.public_data_blob_sha!==publicDataBlob\)/);
 assert.match(worker,/if\(PRODUCTION_RELEASES_PAUSED&&action==="worker_complete"&&job\.target==="production"\)/);
 assert.match(worker,/public_data_blob_sha:approvedPublicDataBlob/);
 assert.doesNotMatch(worker,/public_data_blob_sha:publicDataBlob\}\)\n   \.eq\("id",job\.id\)/);
});

test("staging first-deployment rollback rejects missing SHA before queue",()=>{
 assert.match(approval,/!SHA\.test\(String\(prev\.from_sha\|\|""\)\)/);
 assert.match(worker,/job\?\.action==="stage_rollback"/);
 assert.match(worker,/error_code:"no_staging_rollback"/);
 assert.match(js,/!\/\^\[0-9a-f\]\{40\}\$\/\.test\(String\(stageH\[0\]\.from_sha\|\|""\)\)/);
});

test("worker Python only packages explicit staging jobs and pinned directory blob",()=>{
 assert.match(python,/plan\.get\("target"\) != "staging"/);
 assert.match(python,/plan\.get\("action"\) not in \(/);
 assert.match(python,/raise RuntimeError\("Production publication is paused/);
 assert.match(python,/git", "cat-file", "blob", blob_sha/);
 assert.match(python,/overlay_approved_directory\(OUTPUT, approved_blob\)/);
 assert.doesNotMatch(python,/git archive --format=tar HEAD data\/public-compare-school-directory-v1\.json/);
});

test("#195 preview-only rewrite is present, source production config remains immutable",()=>{
 assert.match(python,/def isolate_preview_backend\(preview_dir\):/);
 assert.match(python,/if live_ref not in config\.read_text/);
 assert.match(python,/modified = body\.replace\(live_ref, stage_ref\)\.replace\(live_key, stage_key\)/);
 assert.match(python,/if live_ref in file\.read_text/);
 assert.match(python,/isolate_preview_backend\(preview_dir\)/);
 const page=source("tests/site-release-packaging.py");
 assert.match(page,/assert live in prod_config/);
 assert.match(page,/assert live not in stage_config/);
 assert.match(page,/assert stage in stage_config/);
 assert.match(page,/invalid staging release SHA/i);
});

test("collided files have no unresolved git conflict markers",()=>{
 for(const data of [js,server,python,source("tests/site-release-packaging.py")]){
  assert.doesNotMatch(data,/^<<<<<<< |^=======\s*$|^>>>>>>> /m);
 }
});

test("integration is not a release approval or staging deployment",()=>{
 const required=["docs/releases/v2-step9-integration-manifest.json",
  "docs/releases/v2-step8-conflict-preflight.md"];
 for(const file of required)assert.ok(source(file).length>100);
 assert.match(server,/create_version/);
 assert.match(python,/approved_blob/);
});
