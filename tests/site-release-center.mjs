import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const source=path=>readFileSync(path,"utf8");

test("release center includes all 4 buttons and two independent histories",()=>{
 const html=source("admin-updates.html");
 for(const id of ["releaseStageApply","releaseStageRollback","releaseProdApply",
  "releaseProdRollback","releaseStageHistory","releaseProdHistory",
  "releaseVersionInput","releaseSummaryInput","releaseDraftForm","releaseQueueText"]){
  assert.ok(html.includes('id="'+id+'"'),id);
 }
 assert.match(source("admin.html"),/admin-updates\.html/);
});

test("controls are wired to server, not just decorative",()=>{
 const js=source("js/beagu-admin-updates-v1.js");
 for(const action of ["stage_apply","stage_rollback","prod_apply","prod_rollback",
   "register","status","confirmed_tested"])assert.ok(js.includes(action),action);
 assert.match(js,/\.textContent\s*=/);
 assert.doesNotMatch(js,/innerHTML\s*=/);
});

test("private release queue has RLS and only service role access",()=>{
 const sql=source("supabase/migrations/20261121_site_release_manager.sql");
 assert.match(sql,/alter table public\.beagu_site_release_state_v1 enable row level security/i);
 assert.match(sql,/alter table public\.beagu_site_release_jobs_v1 enable row level security/i);
 assert.match(sql,/alter table public\.beagu_site_release_history_v1 enable row level security/i);
 assert.match(sql,/revoke all on public\.beagu_site_release_state_v1/i);
 assert.match(sql,/from public, anon, authenticated/i);
 assert.match(sql,/one_active_job/i);
});

test("server checks admin session and signed GitHub OIDC identity",()=>{
 const edge=source("supabase/functions/beagu-release-manager-v1/index.ts");
 for(const p of ["getUser(token)","beagu_admin_accounts","beagu_admin_active_mfa_session",
  "aal2","owner","jwtVerify","createRemoteJWKSet","workflow_ref",
  "beagu-release-worker","worker_next","worker_complete","worker_fail",
  "no_changes_since_production","test_confirmation_required","confirmed_tested"]){
  assert.ok(edge.includes(p),p);
 }
 assert.match(edge,/payload\.ref==="refs\/heads\/main"/);
 assert.match(edge,/payload\.repository===repo/);
});

test("the old workflow may no longer deploy main automatically",()=>{
 const legacy=source(".github/workflows/deploy-github-pages-direct.yml");
 assert.doesNotMatch(legacy,/\bpush:/);
 assert.match(legacy,/if: \$\{\{ false \}\}/);
 const release=source(".github/workflows/beagu-release-controller.yml");
 assert.match(release,/cron: '\*\/5 \* \* \* \*'/);
 assert.match(release,/id-token: write/);
 assert.match(release,/fetch-depth: 0/);
 assert.match(release,/actions\/deploy-pages@v4/);
});

test("anonymous admin commands are denied by server",async()=>{
 const url="https://snvzwrexuqavnfvzgxqj.supabase.co/functions/v1/beagu-release-manager-v1";
 const key="sb_publishable_WbByHRhd0RmNiRrYHaINXQ_u5dfegL2";
 const request=async action=>{
  const res=await fetch(url,{method:"POST",signal:AbortSignal.timeout(15000),headers:{
   "apikey":key,"Content-Type":"application/json","Origin":"https://baeguindex.com"},
   body:JSON.stringify({action,version:"1.0.0",summary:"malicious"} )});
  return res.status;
 };
 assert.equal(await request("status"),401);
 assert.equal(await request("stage_apply"),401);
 assert.equal(await request("prod_apply"),401);
 assert.equal(await request("prod_rollback"),401);
});

test("v2 step 3: production promotion and rollback are denied by the server itself",()=>{
 const sourceCode=source("supabase/functions/beagu-release-manager-v1/index.ts");
 assert.match(sourceCode,/const PRODUCTION_RELEASES_PAUSED=true;/);
 const admin=sourceCode.slice(sourceCode.indexOf("async function adminAction("),
   sourceCode.indexOf("async function workerAction("));
 assert.match(admin,/if\(PRODUCTION_RELEASES_PAUSED && \(action==="prod_apply"\|\|action==="prod_rollback"\)\)/);
 assert.match(admin,/return error\("production_release_paused",423,origin\)/);
 assert.ok(admin.indexOf('return error("production_release_paused"') <
   admin.indexOf("const s=await state();"));
});

test("v2 step 3: OIDC worker cannot claim queued production jobs or auto-refresh public data",()=>{
 const sourceCode=source("supabase/functions/beagu-release-manager-v1/index.ts");
 const worker=sourceCode.slice(sourceCode.indexOf("async function workerAction("));
 assert.match(worker,/PRODUCTION_RELEASES_PAUSED && job\?\.target==="production"/);
 assert.match(worker,/!PRODUCTION_RELEASES_PAUSED && !job&&s\.production_sha&&s\.public_data_blob_sha!==publicDataBlob/);
 assert.match(worker,/!PRODUCTION_RELEASES_PAUSED && !job&&!s\.production_sha/);
 assert.match(worker,/action==="worker_complete" && job\.target==="production"/);
 assert.match(worker,/public_data_blob_sha:approvedPublicDataBlob/);
 const python=source("scripts/release-manager/worker.py");
 assert.match(python,/if plan\.get\("target"\) != "staging"/);
 assert.match(python,/\["git", "cat-file", "blob", blob_sha\]/);
 assert.doesNotMatch(python,/git archive --format=tar HEAD data\/public-compare-school-directory-v1\.json/);
});
