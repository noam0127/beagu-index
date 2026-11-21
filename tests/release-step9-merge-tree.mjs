import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";

const manifest=JSON.parse(readFileSync("docs/releases/v2-step9-integration-manifest.json","utf8"));
const SHA=/^[0-9a-f]{40}$/;
function git(...args){
 return execFileSync("git",args,{encoding:"utf8",timeout:12000}).trim();
}
function filesBetween(a,b){
 return git("diff","--name-only",a,b).split("\n").filter(Boolean).sort();
}
function blob(sha,path){
 return git("rev-parse",sha+":"+path);
}

test("integration manifest pins five exact PR heads and an immutable main snapshot",()=>{
 for(const field of ["main_snapshot_sha","common_ancestor_sha","source_stack_head_sha","merged_commit_sha","merged_tree_sha"])
  assert.match(manifest[field],SHA,field);
 assert.deepEqual(manifest.pr_stack.map(x=>x.number),[193,201,205,208,211]);
 assert.equal(manifest.pr_stack.at(-1).sha,manifest.source_stack_head_sha);
 assert.equal(new Set(manifest.pr_stack.map(x=>x.sha)).size,5);
 assert.equal(manifest.changed_files.length,20);
 assert.equal(new Set(manifest.changed_files).size,20);
});

test("two-parent integration commit includes pinned latest main and selected PR stack",()=>{
 const commit=git("cat-file","-p",manifest.merged_commit_sha);
 const parents=commit.split("\n").filter(x=>x.startsWith("parent ")).map(x=>x.slice(7));
 assert.deepEqual(parents,[manifest.main_snapshot_sha,manifest.source_stack_head_sha]);
 assert.equal(git("rev-parse",manifest.merged_commit_sha+"^{tree}"),manifest.merged_tree_sha);
 assert.equal(git("merge-base",manifest.main_snapshot_sha,manifest.source_stack_head_sha),
  manifest.common_ancestor_sha);
 assert.equal(git("merge-base","--is-ancestor",manifest.merged_commit_sha,"HEAD")||"", "");
});

test("file edits from selected PR stack are disjoint from edits made to main",()=>{
 const prFiles=filesBetween(manifest.common_ancestor_sha,manifest.source_stack_head_sha);
 const mainFiles=filesBetween(manifest.common_ancestor_sha,manifest.main_snapshot_sha);
 assert.deepEqual(prFiles,[...manifest.changed_files].sort());
 const overlap=prFiles.filter(x=>mainFiles.includes(x));
 assert.deepEqual(overlap,[]);
 assert.equal(manifest.disjoint_path_count,prFiles.length);
});

test("integration tree contains the exact source PR stack blobs without overwriting main",()=>{
 const prFiles=filesBetween(manifest.common_ancestor_sha,manifest.source_stack_head_sha);
 const mainFiles=filesBetween(manifest.common_ancestor_sha,manifest.main_snapshot_sha);
 for(const path of prFiles)
  assert.equal(blob(manifest.merged_commit_sha,path),blob(manifest.source_stack_head_sha,path),path);
 for(const path of mainFiles)
  assert.equal(blob(manifest.merged_commit_sha,path),blob(manifest.main_snapshot_sha,path),path);
 assert.deepEqual(filesBetween(manifest.main_snapshot_sha,manifest.merged_commit_sha),prFiles);
});

test("contested PRs are explicitly deferred and deployment gates remain closed",()=>{
 assert.deepEqual(manifest.deferred_prs.map(x=>x.number),[198,199,195]);
 for(const row of manifest.deferred_prs)assert.match(row.sha,SHA);
 for(const key of ["sql_migrations_applied","edge_functions_deployed","staging_deployed",
  "production_deployed","release_version_created","main_merged"])
  assert.equal(manifest[key],false,key);
 assert.equal(manifest.semantic_integration_tests,"not_verified");
 assert.ok(manifest.approval_requirements.length>=4);
});
