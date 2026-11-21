import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {preflightReleaseConflicts} from
 "../supabase/functions/beagu-release-manager-v1/release-conflict-preflight.mjs";
import {summarizeReleasePaths} from
 "../supabase/functions/beagu-release-manager-v1/release-impact-evidence.mjs";

const SHA=n=>String(n).padStart(40,"a");
const entry=(number,paths,{headRef="feat/"+number,baseRef="main",status="complete"}={})=>{
 const impact=summarizeReleasePaths(paths.map(path=>({filename:path,status:"modified"})));
 impact.status=status;
 return {number,head_sha:SHA(number),head_ref:headRef,base_ref:baseRef,impact};
};
const set=(...open)=>({status:"ok",open,impact_summary:{
 status:"observed",not_scanned:0
}});
const inspect=(...open)=>preflightReleaseConflicts(set(...open));
const risk=(report,code)=>report.pairs.flatMap(x=>x.risks).find(x=>x.code===code);

test("real #193/#199 overlap: shared Edge API and release test file",()=>{
 const a=entry(193,[
  "supabase/functions/beagu-release-manager-v1/index.ts",
  "tests/site-release-center.mjs","js/beagu-admin-updates-v1.js"
 ]);
 const b=entry(199,[
  "supabase/functions/beagu-release-manager-v1/index.ts",
  "tests/site-release-center.mjs","scripts/release-manager/worker.py"
 ]);
 const r=inspect(a,b);
 assert.equal(r.status,"observed");
 assert.equal(r.pair_count,1);
 assert.equal(r.review_required_pairs,1);
 assert.equal(r.high_risk_pairs,1);
 assert.equal(r.pairs[0].status,"review_required");
 assert.deepEqual(r.pairs[0].shared_paths,[
  "supabase/functions/beagu-release-manager-v1/index.ts",
  "tests/site-release-center.mjs"
 ]);
 assert.equal(risk(r,"same_file_changed").level,"high");
 assert.equal(r.pairs[0].three_way_merge,"not_tested");
 assert.equal(r.pairs[0].eligible_for_release,false);
});

test("two separate files of same Edge Function require API and auth review",()=>{
 const r=inspect(entry(1,["supabase/functions/login/index.ts"]),
  entry(2,["supabase/functions/login/helpers.ts"]));
 assert.equal(r.pairs[0].shared_paths.length,0);
 assert.equal(risk(r,"shared_edge_function").identifier,"login");
 assert.equal(risk(r,"shared_edge_function").level,"high");
});

test("different Edge Functions do not imply a direct file/domain collision",()=>{
 const r=inspect(entry(1,["supabase/functions/login/index.ts"]),
  entry(2,["supabase/functions/statistics/index.ts"]));
 assert.equal(r.review_required_pairs,0);
 assert.equal(r.no_observed_overlap_pairs,1);
 assert.equal(r.pairs[0].status,"no_observed_overlap");
 assert.equal(r.integrated_tests_passed,false);
 assert.equal(r.version_creation_approved,false);
});

test("parallel SQL migrations flagged for manual table/RLS/order review",()=>{
 const r=inspect(entry(1,["supabase/migrations/20261121_a.sql"]),
  entry(2,["supabase/migrations/20261122_b.sql"]));
 const x=risk(r,"parallel_db_migrations");
 assert.equal(x.level,"review");
 assert.equal(x.paths.length,2);
 assert.equal(risk(r,"same_file_changed"),undefined);
});

test("same SQL migration is a high risk exact overlap",()=>{
 const name="supabase/migrations/20261122_members.sql";
 const r=inspect(entry(1,[name]),entry(2,[name]));
 assert.equal(risk(r,"same_file_changed").level,"high");
 assert.equal(risk(r,"parallel_db_migrations"),undefined);
});

test("different deployment/CI files require manual release-pipeline review",()=>{
 const r=inspect(
  entry(1,[".github/workflows/site-release-manager-validation.yml"]),
  entry(2,["scripts/release-manager/worker.py"])
 );
 assert.equal(risk(r,"parallel_deployment_ci_changes").level,"review");
});

test("shared public data domain requires consistency and approval review",()=>{
 const r=inspect(entry(1,["data/public-schools.json"]),
  entry(2,["data/public-compare-school-directory-v1.json"]));
 assert.equal(risk(r,"parallel_published_data").paths.length,2);
});

test("same head SHA from different PRs flagged as duplication",()=>{
 const one=entry(1,["docs/a.md"]),two=entry(2,["docs/b.md"]);
 two.head_sha=one.head_sha;
 const r=inspect(one,two);
 assert.equal(risk(r,"same_head_sha").level,"review");
});

test("stacked PR relationship is noted, not automatically marked safe",()=>{
 const r=inspect(
  entry(201,["docs/a.md"],{headRef:"feature/step5"}),
  entry(205,["docs/b.md"],{baseRef:"feature/step5"})
 );
 assert.equal(r.pairs[0].stacked_relationship,true);
 assert.equal(r.pairs[0].eligible_for_release,false);
});

test("incomplete file inventory cannot give a false clean outcome",()=>{
 const a=entry(1,["js/a.js"],{status:"partial"});
 const b=entry(2,["js/b.js"]);
 const r=inspect(a,b);
 assert.equal(r.status,"partial");
 assert.equal(r.incomplete_pairs,1);
 assert.equal(r.pairs[0].status,"inspection_incomplete");
 assert.equal(risk(r,"incomplete_file_inventory").level,"unknown");
});

test("truncated inventory files are treated as incomplete even if labeled complete",()=>{
 const a=entry(1,["js/a.js"]);a.impact.file_count=999;
 const r=inspect(a,entry(2,["js/b.js"]));
 assert.equal(r.incomplete_pairs,1);
});

test("unscanned PRs and partially retrieved GitHub listing make summary partial",()=>{
 const more=Array.from({length:8},(_,i)=>entry(i+1,["js/a"+i+".js"]));
 let result=preflightReleaseConflicts(set(...more),{maxPRs:6});
 assert.equal(result.status,"partial");
 assert.equal(result.uninspected_prs,2);
 assert.equal(result.pair_count,15);
 result=preflightReleaseConflicts({...set(...more.slice(0,2)),status:"partial"},{maxPRs:6});
 assert.equal(result.status,"partial");
});

test("no matching paths is not evidence of successful Git merge",()=>{
 const r=inspect(entry(1,["js/header.js"]),entry(2,["styles/footer.css"]));
 assert.equal(r.pairs[0].status,"no_observed_overlap");
 assert.equal(r.actual_merge_performed,false);
 assert.equal(r.integrated_tests_passed,false);
 assert.equal(r.production_deployment_approved,false);
});

test("a single PR cannot produce a green collision result",()=>{
 const r=inspect(entry(1,["js/header.js"]));
 assert.equal(r.status,"insufficient_prs");
 assert.equal(r.pair_count,0);
});

test("invalid inputs and bad SHA fail safely",()=>{
 assert.throws(()=>preflightReleaseConflicts({open:[]},{maxPRs:1}),/invalid_conflict_input/);
 const a=entry(1,["js/a.js"]);a.head_sha="invalid";
 const r=inspect(a,entry(2,["js/b.js"]));
 assert.equal(r.status,"partial");
 assert.equal(r.pairs[0].status,"inspection_incomplete");
});

test("read-only owner API and UI consume preflight result with no promotion",()=>{
 const edge=readFileSync("supabase/functions/beagu-release-manager-v1/index.ts","utf8");
 const html=readFileSync("admin-updates.html","utf8");
 const ui=readFileSync("js/beagu-admin-updates-v1.js","utf8");
 assert.match(edge,/import \{preflightReleaseConflicts\} from "\.\/release-conflict-preflight\.mjs"/);
 assert.match(edge,/preflightReleaseConflicts\(workInbox/);
 assert.match(edge,/input\.inspect_work===true/);
 assert.match(html,/id="releaseConflictHeading"/);
 assert.match(html,/id="releaseConflictPairs"/);
 assert.match(ui,/renderConflictPreflight\(\)/);
 assert.match(ui,/실제 병합·통합 테스트: 미실행/);
 assert.doesNotMatch(ui,/innerHTML\s*=/);
});
