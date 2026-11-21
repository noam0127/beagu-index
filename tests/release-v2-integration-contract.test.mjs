import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const manifest=JSON.parse(readFileSync(
  "docs/releases/release-v2-integration-contract-20261122.json","utf8"
));
const plan=readFileSync("docs/releases/v2-step4-integration-plan-20261122.md","utf8");
const SHA=/^[0-9a-f]{40}$/;

test("integration contract is pinned to a real observed baseline and is design-only",()=>{
 assert.equal(manifest.schema_version,1);
 assert.equal(manifest.status,"design_only_no_deployment");
 assert.equal(manifest.repository,"noam0127/beagu-index");
 assert.match(manifest.baseline_main_sha,SHA);
 assert.match(plan,/운영 웹·운영 Supabase 변경 금지/);
});

test("PR identities, immutable SHA and priority source roles are explicit",()=>{
 const source=manifest.source_prs;
 assert.deepEqual(source.map(p=>p.number),[193,198,199,195]);
 assert.equal(new Set(source.map(p=>p.number)).size,source.length);
 for(const pr of source){
  assert.match(pr.head_sha,SHA);
  assert.ok(pr.branch&&pr.purpose);
 }
 assert.deepEqual(source.filter(p=>p.required).map(p=>p.number),[193,198,199]);
 assert.equal(source.find(p=>p.number===195).required,false);
});

test("every independently inspected overlapping file is tracked exactly once",()=>{
 const required=[
  {prs:[193,198],paths:["js/beagu-admin-updates-v1.js"]},
  {prs:[193,199],paths:[
   "supabase/functions/beagu-release-manager-v1/index.ts",
   "tests/site-release-center.mjs"
  ]},
  {prs:[195,199],paths:[
   "scripts/release-manager/worker.py",
   "tests/site-release-packaging.py"
  ]}
 ];
 assert.deepEqual(
  manifest.overlap_matrix.map(x=>({prs:x.prs,paths:x.paths})),
  required
 );
 for(const overlap of manifest.overlap_matrix){
  assert.ok(overlap.risk);
  for(const p of overlap.prs) assert.ok(manifest.source_prs.some(x=>x.number===p));
 }
});

test("production safety and staging isolation cannot be silently omitted from design",()=>{
 const invariants=manifest.mandatory_invariants.join("\n");
 for(const phrase of [
  "No production deployment",
  "Production API rejects prod_apply and prod_rollback",
  "Worker cannot claim or complete production releases",
  "Automatic data_refresh cannot publish",
  "Preview backend must not use production Supabase",
  "immutable reviewed commit",
  "UI disabled controls cannot substitute for server authorization",
 ])assert.ok(invariants.includes(phrase),phrase);
 for(const gate of ["G0","G1","G2","G3","G4","G5","G6"])
  assert.match(plan,new RegExp("\\*\\*"+gate+" "));
 assert.match(plan,/별도 명시적 사용자 승인/);
});

test("planning PR cannot be mistaken for a merged or deployed system",()=>{
 assert.match(plan,/실제 병합 충돌이 0/);
 assert.match(plan,/실제 PR 내용을 비교/);
 assert.match(plan,/현재 #193은 선택 PR을 조합하지 않고/);
 assert.match(plan,/운영 DB에 설치되지 않았/);
});
