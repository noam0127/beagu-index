import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {collectGitHubWorkInbox,normalizeWorkPull} from
  "../supabase/functions/beagu-release-manager-v1/github-work-inbox.mjs";

const SHA="a".repeat(40);
const OTHER="b".repeat(40);
function pr(number,overrides={}){
 return {
  number,
  title:"PR "+number,
  html_url:"https://github.com/noam0127/beagu-index/pull/"+number,
  state:"open",
  draft:false,
  merged_at:null,
  updated_at:"2026-11-22T00:00:00Z",
  head:{sha:SHA,ref:"feature/"+number},
  base:{ref:"main"},
  merge_commit_sha:null,
  ...overrides
 };
}

test("normalizer separates open draft and review without claiming deployment",()=>{
 const draft=normalizeWorkPull(pr(8,{draft:true}));
 const review=normalizeWorkPull(pr(9));
 assert.equal(draft.status,"draft");
 assert.equal(review.status,"review");
 assert.equal(draft.head_sha,SHA);
 assert.equal(draft.url,"https://github.com/noam0127/beagu-index/pull/8");
 assert.ok(!Object.hasOwn(draft,"deployed"));
});

test("merged to main differs from merged elsewhere and closed without merge",()=>{
 const done=normalizeWorkPull(pr(2,{state:"closed",merged_at:"2026-11-21T13:00:00Z",merge_commit_sha:OTHER}));
 const elsewhere=normalizeWorkPull(pr(3,{state:"closed",merged_at:"2026-11-21T13:00:00Z",base:{ref:"develop"}}));
 const abandoned=normalizeWorkPull(pr(4,{state:"closed"}));
 assert.equal(done.status,"merged_to_main");
 assert.equal(done.merge_sha,OTHER);
 assert.equal(elsewhere.status,"merged_other_base");
 assert.equal(abandoned.status,"closed_unmerged");
});

test("inbox rejects spoofed URLs, invalid hashes and invalid PR numbers",()=>{
 assert.equal(normalizeWorkPull(pr(1,{html_url:"https://evil.example/pull/1"})),null);
 assert.equal(normalizeWorkPull(pr(1,{head:{sha:"invalid",ref:"main"}})),null);
 assert.equal(normalizeWorkPull(pr(-2)),null);
 assert.equal(normalizeWorkPull({}),null);
});

test("pagination and deduplication include PRs beyond first page",async()=>{
 const first=[pr(1,{draft:true}),pr(2)];
 const second=[pr(2),pr(3,{state:"closed",merged_at:"2026-11-21T00:00:00Z"})];
 const third=[pr(4)];
 let called=[];
 const inbox=await collectGitHubWorkInbox(async(page,limit)=>{
  called.push([page,limit]);return [null,...[first,second,third]][page];
 },{perPage:2,maxPages:3});
 assert.deepEqual(called,[[1,2],[2,2],[3,2]]);
 assert.equal(inbox.status,"ok");
 assert.equal(inbox.total_seen,4);
 assert.equal(inbox.open_count,3);
 assert.equal(inbox.merged_to_main_count,1);
 assert.deepEqual(inbox.open.map(v=>v.number).sort(),[1,2,4]);
 assert.deepEqual(inbox.recently_merged.map(v=>v.number),[3]);
});

test("all initial pages fail: show error rather than empty success",async()=>{
 const inbox=await collectGitHubWorkInbox(async()=>{throw Error("rate limit")});
 assert.equal(inbox.status,"error");
 assert.equal(inbox.reason,"github_unavailable");
 assert.equal(inbox.fetched_pages,0);
 assert.equal(inbox.open_count,0);
});

test("later page fails: retain successful data and report partial",async()=>{
 const inbox=await collectGitHubWorkInbox(async(page)=>{
  if(page===1)return [pr(10),pr(11)];
  throw Error("page-2-failure");
 },{perPage:2,maxPages:3});
 assert.equal(inbox.status,"partial");
 assert.equal(inbox.open_count,2);
 assert.equal(inbox.fetched_pages,1);
 assert.equal(inbox.reason,"github_unavailable");
});

test("max-page boundary reports truncation rather than pretending exhaustive coverage",async()=>{
 const inbox=await collectGitHubWorkInbox(async()=>[pr(23),pr(24)],{perPage:2,maxPages:1});
 assert.equal(inbox.status,"partial");
 assert.equal(inbox.truncated,true);
 assert.equal(inbox.reason,"results_truncated");
});

test("non-main merge does not become releasable main work",async()=>{
 const inbox=await collectGitHubWorkInbox(async()=>[
  pr(1,{state:"closed",merged_at:"2026-11-22T00:00:00Z",base:{ref:"integration/test"}}),
  pr(2,{state:"closed",merged_at:"2026-11-22T00:00:00Z"}),
  pr(3,{state:"closed"}),
 ]);
 assert.equal(inbox.merged_to_main_count,1);
 assert.equal(inbox.merged_elsewhere_count,1);
 assert.equal(inbox.closed_unmerged_count,1);
 assert.deepEqual(inbox.recently_merged.map(x=>x.number),[2]);
});

test("read-only server and UI wiring exposes failures and merged items",()=>{
 const api=readFileSync("supabase/functions/beagu-release-manager-v1/index.ts","utf8");
 const html=readFileSync("admin-updates.html","utf8");
 const ui=readFileSync("js/beagu-admin-updates-v1.js","utf8");
 assert.match(api,/import \{collectGitHubWorkInbox\} from "\.\/github-work-inbox\.mjs"/);
 assert.match(api,/pulls\?state=all&sort=updated&direction=desc&per_page=/);
 assert.match(api,/work_inbox:workInbox/);
 assert.match(api,/commit_scan_error:commitScanError/);
 for(const id of ["releaseGitHubWorkStatus","releaseRecentlyMergedPullRequests"])
  assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(ui,/GitHub PR 조회 실패/);
 assert.match(ui,/main 병합됨 · 버전 포함 미검증/);
 assert.doesNotMatch(ui,/innerHTML\s*=/);
});
