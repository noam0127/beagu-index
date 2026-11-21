import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
// Run v2 GitHub PR inbox tests under the existing release-manager CI workflow.
import "./release-github-work-inbox.mjs";
import "./release-work-dependencies.mjs";
const source=path=>readFileSync(path,"utf8");

test("release center includes all 4 buttons and two independent histories",()=>{
 const html=source("admin-updates.html");
 for(const id of ["releaseStageApply","releaseStageRollback","releaseProdApply",
  "releaseProdRollback","releaseStageHistory","releaseProdHistory",
  "releaseVersionInput","releaseSummaryInput","releaseDraftForm","releaseQueueText",
  "releaseStageSelect","releaseProdSelect","releasePendingLog","releaseVersionCatalog",
  "releasePendingStatus","releaseOpenPullRequests"]){
  assert.ok(html.includes('id="'+id+'"'),id);
 }
 assert.match(source("admin.html"),/admin-updates\.html/);
});

test("controls are wired to server, not just decorative",()=>{
 const js=source("js/beagu-admin-updates-v1.js");
 for(const action of ["stage_apply","stage_rollback","prod_apply","prod_rollback",
   "create_version","version_id","status","confirmed_tested"])assert.ok(js.includes(action),action);
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
 const catalog=source("supabase/migrations/20261121_site_release_version_catalog.sql");
 assert.match(catalog,/alter table public\.beagu_site_release_versions_v1 enable row level security/i);
 assert.match(catalog,/revoke all on public\.beagu_site_release_versions_v1 from public, anon, authenticated/i);
 assert.match(catalog,/sha text not null unique/i);
 assert.match(catalog,/version text not null unique/i);
});

test("server checks admin session and signed GitHub OIDC identity",()=>{
 const edge=source("supabase/functions/beagu-release-manager-v1/index.ts");
 for(const p of ["getUser(token)","beagu_admin_accounts","beagu_admin_active_mfa_session",
  "aal2","owner","jwtVerify","createRemoteJWKSet","workflow_ref",
  "beagu-release-worker","worker_next","worker_complete","worker_fail",
  "no_changes_since_production","test_confirmation_required","confirmed_tested",
  "create_version","releaseVersions","releaseVersion","version_id","staging_required"]){
  assert.ok(edge.includes(p),p);
 }
 assert.match(edge,/payload\.ref==="refs\/heads\/main"/);
 assert.match(edge,/payload\.repository===repo/);
 assert.match(edge,/\.eq\("target","staging"\)\.eq\("to_sha",selected\.sha\)/);
 assert.match(edge,/if\(!tested\)return error\("staging_required"/);
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
 assert.equal(await request("create_version"),401);
 assert.equal(await request("prod_apply"),401);
 assert.equal(await request("prod_rollback"),401);
});

test("release UI separates automatic work log from manual immutable versions",()=>{
 const html=source("admin-updates.html");
 const js=source("js/beagu-admin-updates-v1.js");
 assert.match(html,/ChatGPT 개발 작업 내역 · 자동 수집/);
 assert.match(html,/새 버전 생성 · 수동/);
 assert.match(html,/실제 웹에 적용할 검증된 버전/);
 assert.match(js,/request\("create_version"/);
 assert.match(js,/versions\.filter\(v=>v\.tested\)/);
 assert.match(js,/selected\?\{version_id:selected\.id/);
 assert.doesNotMatch(js,/innerHTML\s*=/);
});

test("unmerged PRs are only an inbox, and version creation verifies reviewed HEAD",()=>{
 const edge=source("supabase/functions/beagu-release-manager-v1/index.ts");
 const js=source("js/beagu-admin-updates-v1.js");
 assert.match(edge,/pulls\?state=all&sort=updated&direction=desc&per_page=/);
 assert.match(edge,/new_changes_detected/);
 assert.match(edge,/input\.expected_sha!==main\.sha/);
 assert.match(js,/expected_sha:pending\.head_sha/);
 assert.match(js,/renderWorkInProgress\(\)/);
 assert.match(js,/refreshTick%20!==0/);
});
