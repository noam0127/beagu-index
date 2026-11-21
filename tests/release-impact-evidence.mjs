import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 classifyReleasePath,summarizeReleasePaths,summarizeReleaseChecks,inspectReleaseWorkInbox
} from "../supabase/functions/beagu-release-manager-v1/release-impact-evidence.mjs";
const SHA="a".repeat(40);
const row=n=>({number:n,head_sha:SHA,title:"PR "+n});
const fetchOk={
 fetchFiles:async(n)=>[{filename:n===1?"supabase/migrations/new.sql":"js/feature.js",status:"modified",additions:6,deletions:2}],
 fetchChecks:async(s)=>({total_count:1,check_runs:[{head_sha:s,name:"CI",status:"completed",conclusion:"success"}]})
};
test("classify migrations, edge functions, deployment, frontend, test, data",()=>{
 for(const [path,category] of Object.entries({
  "supabase/migrations/add.sql":"database_migration",
  "supabase/functions/access/index.ts":"edge_function",
  ".github/workflows/deploy.yml":"deployment_or_ci",
  "scripts/release-manager/worker.py":"deployment_or_ci",
  "tests/api.test.mjs":"test_code",
  "js/admin.js":"web_ui",
  "admin.html":"web_ui",
  "data/public-index.json":"published_data",
  "docs/releases/report.md":"documentation",
  "src/other.ts":"other_code"
 }))assert.equal(classifyReleasePath(path),category,path);
});
test("reject path traversal, absolute paths and control characters",()=>{
 for(const path of ["../secret","src/../secret","/absolute","bad\nname","src\\bad"])
  assert.equal(classifyReleasePath(path),"invalid");
});
test("file inventory deduplicates and computes risk flags, never assumes tests passed",()=>{
 const r=summarizeReleasePaths([
  {filename:"supabase/migrations/add.sql",additions:20,deletions:0,status:"added"},
  {filename:"supabase/functions/api/index.ts",additions:10,deletions:5,status:"modified"},
  {filename:"tests/api.test.mjs",additions:4,deletions:0,status:"added"},
  {filename:"tests/api.test.mjs",additions:4,deletions:0,status:"added"}
 ]);
 assert.equal(r.status,"complete");
 assert.equal(r.file_count,3);
 assert.equal(r.additions,34);
 assert.equal(r.deletions,5);
 assert.ok(r.risk_flags.includes("database_schema_review"));
 assert.ok(r.risk_flags.includes("edge_function_auth_review"));
 assert.deepEqual(r.tests_changed,["tests/api.test.mjs"]);
 assert.equal(Object.hasOwn(r,"tests_passed"),false);
});
test("invalid file metadata and failed file pages remain partial",()=>{
 const x=summarizeReleasePaths([{filename:"src/a.js"},{filename:"../oops"}]);
 assert.equal(x.status,"partial");
 assert.equal(x.reason,"invalid_path");
 const y=summarizeReleasePaths([{filename:"admin.html"}],{complete:false,reason:"github_file_list_unavailable"});
 assert.equal(y.status,"partial");
});
test("CI checks are tied to exact head SHA, not integration safety",()=>{
 const r=summarizeReleaseChecks({total_count:3,check_runs:[
  {head_sha:SHA,name:"security",status:"completed",conclusion:"success"},
  {head_sha:SHA,name:"unit",status:"completed",conclusion:"failure"},
  {head_sha:SHA,name:"browser",status:"in_progress"}
 ]},SHA);
 assert.equal(r.succeeded,1);
 assert.equal(r.failed,1);
 assert.equal(r.pending,1);
 assert.equal(r.integration_safety,"not_checked");
 const mismatch=summarizeReleaseChecks({total_count:1,check_runs:[
  {head_sha:"b".repeat(40),status:"completed",conclusion:"success"}
 ]},SHA);
 assert.equal(mismatch.status,"partial");
 assert.equal(mismatch.reason,"check_sha_mismatch");
});
test("CI pagination incompleteness disclosed",()=>{
 const r=summarizeReleaseChecks({total_count:2,check_runs:[
  {head_sha:SHA,name:"check1",status:"completed",conclusion:"success"}
 ]},SHA);
 assert.equal(r.status,"partial");
 assert.equal(r.reason,"check_runs_truncated");
});
test("PR impact calls classify both PRs with correct SHA",async()=>{
 const calls=[];
 const res=await inspectReleaseWorkInbox({status:"ok",open:[row(1),row(2)]},{
  fetchFiles:async(n,p,size,sha)=>{calls.push([n,p,size,sha]);return fetchOk.fetchFiles(n);},
  fetchChecks:fetchOk.fetchChecks
 });
 assert.deepEqual(calls.map(x=>x[0]),[1,2]);
 assert.equal(res.impact_summary.complete,2);
 assert.equal(res.impact_summary.status,"observed");
 assert.equal(res.impact_summary.integration_conflicts,"not_tested");
 assert.equal(res.open[0].impact.category_counts.database_migration,1);
 assert.equal(res.open[1].impact.category_counts.web_ui,1);
 assert.equal(res.open[0].checks.integration_safety,"not_checked");
});
test("failed GitHub requests must not become zero-file success",async()=>{
 const res=await inspectReleaseWorkInbox({status:"ok",open:[row(1)]},{
  fetchFiles:async()=>{throw Error("rate limit")},
  fetchChecks:async()=>{throw Error("denied")}
 });
 assert.equal(res.open[0].impact.status,"partial");
 assert.equal(res.open[0].impact.reason,"github_file_list_unavailable");
 assert.equal(res.open[0].checks.status,"unavailable");
});
test("partial file pagination preserves observed files and marks incomplete",async()=>{
 const files=Array.from({length:100},(_,i)=>({filename:"js/test"+i+".js"}));
 const res=await inspectReleaseWorkInbox({status:"ok",open:[row(1)]},{
  fetchFiles:async(n,p)=>p===1?files:Promise.reject(Error("page2")),
  fetchChecks:async()=>({total_count:0,check_runs:[]})
 });
 assert.equal(res.open[0].impact.status,"partial");
 assert.equal(res.open[0].impact.file_count,100);
});
test("unscanned PRs, partial inboxes and limits never claim complete",async()=>{
 const data={status:"ok",open:Array.from({length:9},(_,i)=>row(i+1))};
 const res=await inspectReleaseWorkInbox(data,fetchOk,{maxPRs:6});
 assert.equal(res.impact_summary.inspected_count,6);
 assert.equal(res.impact_summary.not_scanned,3);
 assert.equal(res.impact_summary.status,"partial");
 assert.equal(res.open[8].impact.status,"not_scanned");
 const partial=await inspectReleaseWorkInbox({status:"partial",open:[row(1)]},fetchOk);
 assert.equal(partial.impact_summary.status,"partial");
 await assert.rejects(()=>inspectReleaseWorkInbox(data,fetchOk,{maxPRs:1000}),/invalid_inspection_options/);
});
test("server and UI wire scan only on explicit request",()=>{
 const edge=readFileSync("supabase/functions/beagu-release-manager-v1/index.ts","utf8");
 const ui=readFileSync("js/beagu-admin-updates-v1.js","utf8");
 const html=readFileSync("admin-updates.html","utf8");
 assert.match(edge,/import \{inspectReleaseWorkInbox\} from "\.\/release-impact-evidence\.mjs"/);
 assert.match(edge,/input\.inspect_work===true/);
 assert.match(edge,/\/files\?per_page=/);
 assert.match(edge,/\/check-runs\?per_page=100/);
 assert.match(ui,/inspect_work:inspect/);
 assert.match(html,/id="releaseInspectPRs"/);
 assert.match(html,/id="releaseImpactStatus"/);
 assert.doesNotMatch(ui,/innerHTML\s*=/);
});
