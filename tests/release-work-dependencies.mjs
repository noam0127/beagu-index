import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {extractDeclaredDependencies,annotateWorkDependencies} from
 "../supabase/functions/beagu-release-manager-v1/release-work-dependencies.mjs";
import {collectGitHubWorkInbox} from
 "../supabase/functions/beagu-release-manager-v1/github-work-inbox.mjs";

const SHA="a".repeat(40);
const REPO="noam0127/beagu-index";
function raw(number,{state="open",draft=false,base_ref="main",head_ref="work/"+number,
 body="",merged=false}={}){
 return {number,title:"Work "+number,html_url:"https://github.com/"+REPO+"/pull/"+number,
  state,draft,body,merged_at:merged?"2026-11-21T05:30:00Z":null,
  base:{ref:base_ref},head:{sha:SHA,ref:head_ref},
  updated_at:"2026-11-22T00:00:00Z",merge_commit_sha:merged?SHA:null};
}
async function inbox(...items){
 const collected=await collectGitHubWorkInbox(async()=>items);
 return annotateWorkDependencies(collected);
}
function get(i,n){
 return [...i.open,...i.recently_merged,...i.merged_elsewhere,...i.closed_unmerged]
  .find(x=>x.number===n);
}

test("only explicit dependency lines are parsed; incidental PR mentions ignored",()=>{
 const body="Fixes #8\nRead PR #9\nDepends on: #193, #198\nBlocked-by: #201\n선행 PR: #205\n- Requires #210\n";
 assert.deepEqual(extractDeclaredDependencies(body),[193,198,201,205,210]);
 assert.deepEqual(extractDeclaredDependencies("Related to #193. No blockers"),[]);
 assert.deepEqual(extractDeclaredDependencies(null),[]);
});

test("independent review PR can proceed only to integration VALIDATION",async()=>{
 const i=await inbox(raw(7));
 const x=get(i,7);
 assert.equal(x.integration_gate,"ready_for_validation");
 assert.equal(x.integration_tests,"not_checked");
 assert.equal(x.staging_verification,"not_checked");
 assert.equal(x.production_verification,"not_checked");
 assert.equal(x.release_inclusion,"unverified");
 assert.equal(i.dependency_summary.integrated_code_verified,false);
});

test("draft remains in development and not declared integration-ready",async()=>{
 const i=await inbox(raw(8,{draft:true}));
 assert.equal(get(i,8).integration_gate,"in_development");
});

test("declared active dependency blocks review PR",async()=>{
 const i=await inbox(raw(10,{body:"Depends on: #11"}),raw(11,{draft:true}));
 assert.equal(get(i,10).integration_gate,"waiting_for_dependency");
 assert.deepEqual(get(i,10).dependencies.map(x=>x.number),[11]);
 assert.equal(i.dependency_summary.blocked_count,1);
});

test("stacked PR base branch is an inferred dependency",async()=>{
 const i=await inbox(raw(193,{head_ref:"feat/release-snapshots"}),
  raw(201,{base_ref:"feat/release-snapshots",head_ref:"step5"}));
 const x=get(i,201);
 assert.equal(x.integration_gate,"waiting_for_dependency");
 assert.equal(x.dependencies[0].number,193);
 assert.deepEqual(x.dependencies[0].sources,["stacked_branch"]);
});

test("unknown dependency is blocked rather than considered satisfied",async()=>{
 const i=await inbox(raw(20,{body:"Depends-on: #5000"}));
 assert.equal(get(i,20).integration_gate,"blocked_unknown_dependency");
 assert.equal(get(i,20).dependencies[0].state,"not_in_snapshot");
});

test("abandoned dependency and a different-branch merge both block",async()=>{
 const i=await inbox(raw(21,{body:"Depends-on: #22, #23"}),
  raw(22,{state:"closed"}),
  raw(23,{state:"closed",merged:true,base_ref:"dev"}));
 const current=get(i,21);
 assert.equal(current.integration_gate,"blocked_abandoned_dependency");
 assert.deepEqual(current.dependencies.map(x=>x.state),["closed_unmerged","merged_other_base"]);
});

test("merged main dependency demands ancestry review; not an approved release",async()=>{
 const i=await inbox(raw(30,{body:"Depends-on: #31"}),
  raw(31,{state:"closed",merged:true}));
 assert.equal(get(i,30).integration_gate,"requires_ancestry_review");
 assert.equal(get(i,31).integration_gate,"merged_snapshot_unverified");
 assert.equal(get(i,31).staging_verification,"not_checked");
 assert.equal(get(i,30).dependencies[0].evidence,"merged_to_main_ancestry_unverified");
});

test("cycle catches all nodes even if encountered via a separate root",async()=>{
 const i=await inbox(raw(1,{body:"Depends-on: #2"}),
  raw(2,{body:"Depends-on: #3"}),raw(3,{body:"Depends-on: #2"}));
 assert.equal(get(i,2).integration_gate,"blocked_cycle");
 assert.equal(get(i,3).integration_gate,"blocked_cycle");
 assert.equal(get(i,1).integration_gate,"waiting_for_dependency");
 assert.equal(i.dependency_summary.dependency_cycle_count,2);
});

test("self-dependency is a cycle",async()=>{
 const i=await inbox(raw(77,{body:"Depends-on: #77"}));
 assert.equal(get(i,77).integration_gate,"blocked_cycle");
});

test("unresolved non-main base branch requires manual review",async()=>{
 const i=await inbox(raw(99,{base_ref:"unknown/feature"}));
 assert.equal(get(i,99).integration_gate,"requires_base_review");
 assert.equal(get(i,99).requires_base_review,true);
});

test("ambiguous same-head branches are blocked for human review",async()=>{
 const i=await inbox(raw(12,{head_ref:"same"}),raw(13,{head_ref:"same"}),
  raw(14,{base_ref:"same"}));
 assert.equal(get(i,14).integration_gate,"blocked_ambiguous_base");
 assert.deepEqual(get(i,14).dependencies,[]);
});

test("truncated GitHub PR list cannot be considered fully integration-ready",async()=>{
 const collected=await collectGitHubWorkInbox(async()=>[raw(1)],{perPage:1,maxPages:1});
 const graph=annotateWorkDependencies(collected);
 assert.equal(graph.status,"partial");
 assert.equal(get(graph,1).integration_gate,"cannot_verify_full_inbox");
 assert.equal(graph.dependency_summary.inspection_complete,false);
});

test("invalid PR records make the graph incomplete, never a false green status",async()=>{
 const collected=await collectGitHubWorkInbox(async()=>[
  raw(1),
  {...raw(2),head:{sha:"not-a-valid-sha",ref:"invalid"}}
 ]);
 const graph=annotateWorkDependencies(collected);
 assert.equal(graph.status,"partial");
 assert.equal(graph.reason,"invalid_pr_metadata");
 assert.equal(graph.skipped_invalid,1);
 assert.equal(get(graph,1).integration_gate,"cannot_verify_full_inbox");
 assert.equal(graph.dependency_summary.inspection_complete,false);
});

test("normalizer does not retain untrusted PR body text or incidental references",async()=>{
 const input=raw(42,{body:"A text that may contain private details.\nDepends on: #13"});
 const i=await inbox(input);
 const x=get(i,42);
 assert.deepEqual(x.declared_dependencies,[13]);
 assert.equal(Object.hasOwn(x,"body"),false);
 assert.equal(x.integration_gate,"blocked_unknown_dependency");
});

test("repository URL and normalized PR statuses still enforce strict trust",async()=>{
 const i=await inbox(raw(30,{state:"closed",merged:true}),raw(31,{state:"closed",merged:true,base_ref:"develop"}));
 assert.equal(get(i,30).status,"merged_to_main");
 assert.equal(get(i,31).status,"merged_other_base");
 assert.equal(get(i,31).integration_gate,"not_merged_to_main");
});

test("dependency API and UI actually consume the graph",()=>{
 const edge=readFileSync("supabase/functions/beagu-release-manager-v1/index.ts","utf8");
 const ui=readFileSync("js/beagu-admin-updates-v1.js","utf8");
 const collect=readFileSync("supabase/functions/beagu-release-manager-v1/github-work-inbox.mjs","utf8");
 assert.match(edge,/import \{annotateWorkDependencies\} from "\.\/release-work-dependencies\.mjs"/);
 assert.match(edge,/workInbox=annotateWorkDependencies\(await collectGitHubWorkInbox\(/);
 assert.match(collect,/declared_dependencies:extractDeclaredDependencies\(raw\.body\)/);
 assert.match(ui,/release_inclusion/); // display or verify tracking state
 assert.match(ui,/선행 작업:/);
 assert.match(ui,/통합 테스트·시험\/운영 배포는 별도 검증/);
 assert.doesNotMatch(ui,/innerHTML\s*=/);
});
