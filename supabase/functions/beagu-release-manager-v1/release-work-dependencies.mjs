/**
 * Pure PR dependency graph and evidence-aware work states.
 * No network, database writes, timers, browser globals, or deployment actions.
 * A merged PR is NOT proof of a saved release, staging test, or production deploy.
 */

const PR_REF=/#([1-9][0-9]{0,6})\b/g;

/** Recognize only explicit dependency directives, never incidental PR links. */
export function extractDeclaredDependencies(body){
 if(typeof body!=="string"||!body)return [];
 const out=new Set();
 for(const line of body.slice(0,12000).split(/\r?\n/)){
  if(out.size>=20)break;
  const match=line.match(/^\s*(?:[-*]\s*)?(?:depends[\s-]*on|blocked[\s-]*by|requires|선행\s*PR|의존\s*PR)\s*[:：]?\s*(.*)$/i);
  if(!match)continue;
  for(const ref of match[1].matchAll(PR_REF)){
   const n=Number(ref[1]);
   if(Number.isSafeInteger(n)&&n>0)out.add(n);
   if(out.size>=20)break;
  }
 }
 return [...out].sort((a,b)=>a-b);
}

/**
 * Enrich the read-only inbox returned by collectGitHubWorkInbox().
 *
 * "ready_for_validation" means only that no known dependency blocks the next
 * integration CHECK. It does not authorize merge, version creation, or deploy.
 */
export function annotateWorkDependencies(inbox){
 if(!inbox||typeof inbox!=="object")throw Error("invalid_work_inbox");
 const groups=["open","recently_merged","merged_elsewhere","closed_unmerged"];
 const rows=[];
 for(const group of groups){
  const value=inbox[group];
  if(value!==undefined&&!Array.isArray(value))throw Error("invalid_work_group");
  for(const row of value||[]){
   if(!row||!Number.isSafeInteger(row.number)||row.number<=0)
    throw Error("invalid_work_row");
   rows.push(row);
  }
 }
 const known=new Map(rows.map(row=>[row.number,row]));
 if(known.size!==rows.length)throw Error("duplicate_work_rows");
 const byBranch=new Map();
 for(const row of rows){
  if(row.head_ref){
   const refs=byBranch.get(row.head_ref)||[];
   refs.push(row.number);
   byBranch.set(row.head_ref,refs);
  }
 }
 const dependenciesByNumber=new Map();
 const needsBaseReview=new Set();
 const ambiguousBase=new Set();
 for(const row of rows){
  const found=new Map();
  for(const num of row.declared_dependencies||[]){
   if(Number.isSafeInteger(num)&&num>0)
    found.set(num,new Set(["declared"]));
  }
  // A PR whose base equals exactly one known PR's head branch is stacked.
  if(row.base_ref&&row.base_ref!=="main"){
   const candidates=(byBranch.get(row.base_ref)||[]).filter(n=>n!==row.number);
   if(candidates.length===1){
    const candidate=candidates[0];
    const sources=found.get(candidate)||new Set();
    sources.add("stacked_branch");
    found.set(candidate,sources);
   }else if(candidates.length>1){
    ambiguousBase.add(row.number);
   }else if(row.status==="draft"||row.status==="review"){
    needsBaseReview.add(row.number);
   }
  }
  dependenciesByNumber.set(row.number,[...found].map(([number,sources])=>({
   number,sources:[...sources]
  })).sort((a,b)=>a.number-b.number));
 }
 // Detect all nodes in a cycle, not merely the first node discovered.
 const color=new Map(),stack=[],cycleNodes=new Set();
 function dfs(number){
  const current=color.get(number)||0;
  if(current===2)return;
  if(current===1){
   const at=stack.indexOf(number);
   if(at>=0)for(const node of stack.slice(at))cycleNodes.add(node);
   return;
  }
  color.set(number,1);
  stack.push(number);
  for(const dep of dependenciesByNumber.get(number)||[])
   if(known.has(dep.number))dfs(dep.number);
  stack.pop();
  color.set(number,2);
 }
 for(const row of rows)dfs(row.number);
 let blocked=0,review=0,ready=0,cyclic=0;
 const assessed=new Map();
 for(const row of rows){
  const dependencies=(dependenciesByNumber.get(row.number)||[]).map(dep=>{
   const target=known.get(dep.number);
   return {...dep,
    state:target?.status||"not_in_snapshot",
    url:target?.url||null,
    // Merged dependency still requires an ancestry/commit validation.
    evidence:target?.status==="merged_to_main"?
     "merged_to_main_ancestry_unverified":"not_proven_in_release"};
  });
  const missing=dependencies.some(dep=>dep.state==="not_in_snapshot");
  const abandoned=dependencies.some(dep=>[
   "closed_unmerged","merged_other_base"].includes(dep.state));
  const active=dependencies.some(dep=>[
   "draft","review"].includes(dep.state));
  const mergedDependency=dependencies.some(dep=>dep.state==="merged_to_main");
  const cycle=cycleNodes.has(row.number);
  const incomplete=inbox.status!=="ok";
  let gate;
  if(row.status==="closed_unmerged")gate="closed_no_merge";
  else if(row.status==="merged_other_base")gate="not_merged_to_main";
  else if(row.status==="merged_to_main")gate="merged_snapshot_unverified";
  else if(cycle)gate="blocked_cycle";
  else if(abandoned)gate="blocked_abandoned_dependency";
  else if(missing)gate="blocked_unknown_dependency";
  else if(active)gate="waiting_for_dependency";
  else if(ambiguousBase.has(row.number))gate="blocked_ambiguous_base";
  else if(needsBaseReview.has(row.number))gate="requires_base_review";
  else if(mergedDependency)gate="requires_ancestry_review";
  else if(incomplete)gate="cannot_verify_full_inbox";
  else if(row.status==="draft")gate="in_development";
  else gate="ready_for_validation";
  if(gate.startsWith("blocked_")||gate==="waiting_for_dependency")blocked++;
  else if(gate==="ready_for_validation")ready++;
  else if(!["closed_no_merge","not_merged_to_main","merged_snapshot_unverified"].includes(gate))review++;
  if(cycle)cyclic++;
  assessed.set(row.number,{
   ...row,
   dependencies,
   integration_gate:gate,
   dependency_cycle:cycle,
   requires_base_review:needsBaseReview.has(row.number)||ambiguousBase.has(row.number),
   // These always require explicit verified release-SHA evidence in later steps.
   release_inclusion:"unverified",
   integration_tests:"not_checked",
   staging_verification:"not_checked",
   production_verification:"not_checked"
  });
 }
 const enriched={...inbox};
 for(const group of groups)enriched[group]=(inbox[group]||[]).map(x=>assessed.get(x.number));
 enriched.dependency_summary={
  blocked_count:blocked,
  review_required_count:review,
  ready_for_integration_validation:ready,
  dependency_cycle_count:cyclic,
  inspection_complete:inbox.status==="ok",
  // A green graph is never equivalent to completed code-integration tests.
  integrated_code_verified:false
 };
 return enriched;
}
