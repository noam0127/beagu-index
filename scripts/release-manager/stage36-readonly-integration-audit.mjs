#!/usr/bin/env node
// Stage36 only: inspect pinned upstream commits and merge-tree conflicts.
// No checkout, merge, ref updates, SQL execution, deployment or real APIs.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync,spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';

const manifest=JSON.parse(fs.readFileSync(
 'docs/releases/v1.1.0-stage36-premerge-manifest.json','utf8'));
const HEX=/^[a-f0-9]{40}$/;
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',maxBuffer:8*1024*1024}).trim();
assert.equal(manifest.schema_version,1);
assert.equal(manifest.repository,'noam0127/beagu-index');
const head=git('rev-parse','HEAD');
const main=manifest.anchor.main_sha;
assert.ok(HEX.test(head)&&HEX.test(main)&&HEX.test(manifest.anchor.phase_sha));
execFileSync('git',['merge-base','--is-ancestor',manifest.anchor.phase_sha,head]);
assert.deepEqual(manifest.explicitly_excluded,[216]);
for(const [name,val] of Object.entries(manifest.release_conditions)){
 assert.equal(val,false,name+' is not an approved release condition');
}
const changes=(base,tip)=>{
 const mb=git('merge-base',base,tip);
 return git('diff','--name-only','--diff-filter=ACMR',mb,tip)
  .split('\n').map(x=>x.trim()).filter(Boolean);
};
const branchDiff=new Set(changes(main,head));
const marker=(tip,pathName)=>git('cat-file','-e',tip+':'+pathName);
for(const keep of manifest.must_preserve_main)marker(main,keep);
const compare=(base,tip)=>{
 const result=spawnSync('git',['merge-tree','--write-tree',base,tip],
  {encoding:'utf8',maxBuffer:8*1024*1024});
 const lines=String(result.stdout||'').split('\n');
 const conflictPaths=lines.filter(line=>/\bCONFLICT \(/.test(line))
  .map(line=>line.match(/ in (.+)$/)?.[1]||line).slice(0,100);
 return {clean:result.status===0,conflicting:result.status===1,
  conflict_paths:conflictPaths,code:result.status,
  error:String(result.stderr||'').slice(0,350)};
};
const mainMerge=compare(main,head);
assert.ok([0,1].includes(mainMerge.code),mainMerge.error);
const prRows=[];
for(const candidate of manifest.candidates){
 assert.ok(Number.isInteger(candidate.pr)&&HEX.test(candidate.sha));
 git('cat-file','-e',candidate.sha+'^{commit}');
 const files=changes(main,candidate.sha);
 const shared=files.filter(x=>branchDiff.has(x)).sort();
 for(const item of candidate.known_shared_files||[]){
  assert.ok(shared.includes(item),'Missing known overlapping PR file: '+item);
 }
 const merge=compare(head,candidate.sha);
 assert.ok([0,1].includes(merge.code),merge.error);
 prRows.push({
  pr:candidate.pr,sha:candidate.sha,area:candidate.area,
  files_changed:files.length,direct_overlap_paths:shared,
  overlap_count:shared.length,
  merge_tree_clean:merge.clean,
  merge_tree_conflict_paths:merge.conflict_paths,
  semantic_collision_review_required:true
 });
}
assert.ok(prRows.find(x=>x.pr===240)?.overlap_count>=3);
const report={
 schema_version:1,kind:'stage36_readonly_pinned_premerge',
 repository:manifest.repository,main_sha:main,phase_qa_head:head,
 included_workstreams:prRows,
 main_vs_phase_merge_tree:{
  clean:mainMerge.clean,conflict_paths:mainMerge.conflict_paths
 },
 must_preserve_main:manifest.must_preserve_main,
 excluded_draft_prs:manifest.explicitly_excluded,
 merge_performed:false,deploy_performed:false,real_db_access:false,
 mobile_browser_qa:'separate_offline_chromium_job',
 release_ready:false,
 reasons:[
  'PR240 modifies same admin/member/Edge files as v1.1.0 Stage15/32/34',
  'PR240 and Stage34 define different DB member directory implementations; resolve semantically',
  'PR241 includes independent release-worker and QA hosting workflows; do not merge nested drafts blindly',
  'main contains 2026 three-stage pipeline/13-item/one-response safety migrations which must be preserved',
  'independent staging Auth/DB, encrypted backup restore, legal publication review and Owner/AAL2 approval not verified'
 ]
};
const destination=process.env.BEAGU_STAGE36_REPORT||
 path.join(os.tmpdir(),'beagu-stage36-premerge.json');
fs.writeFileSync(destination,JSON.stringify(report,null,2)+'\n');
console.log('PASS: pinned Stage36 read-only merge-tree audit. PR240 overlaps: '+
 report.included_workstreams.find(x=>x.pr===240).overlap_count+
 '; main vs phase clean='+mainMerge.clean+
 '; release_ready=false; no merge and no deployment');
for(const p of prRows){
 console.log('PR #'+p.pr+': overlap='+p.overlap_count+
  ', dry-run clean='+p.merge_tree_clean+
  ', conflict_files='+p.merge_tree_conflict_paths.length);
}
