/**
 * Release v2 pre-merge conflict RISK scanner.
 *
 * This is read-only and file-list based. It DOES NOT perform Git's three-way
 * merge or validate that database/API changes coexist. A zero-risk result is
 * only "no observed file/domain overlap", never "safe to merge/deploy".
 */

const SHA=/^[0-9a-f]{40}$/;
const SENSITIVE_CATEGORIES=new Set([
 "database_migration","edge_function","deployment_or_ci","published_data"
]);

function fileMap(pr){
 const files=pr?.impact?.files;
 if(pr?.impact?.status!=="complete"||!Array.isArray(files)||
    !Number.isSafeInteger(pr?.impact?.file_count)||
    pr.impact.file_count!==files.length||
    files.some(f=>!f||typeof f.path!=="string"||!f.path||
      typeof f.category!=="string"))return null;
 const map=new Map();
 for(const f of files){
  if(map.has(f.path))return null;
  map.set(f.path,{category:f.category,status:f.status||"unknown"});
 }
 return map;
}

function edgeFunctionNames(map){
 const names=new Map();
 for(const [path] of map){
  const match=path.match(/^supabase\/functions\/([^/]+)\//);
  if(!match)continue;
  const name=match[1];
  if(!names.has(name))names.set(name,[]);
  names.get(name).push(path);
 }
 return names;
}

function categoryPaths(map,category){
 return [...map].filter(([,v])=>v.category===category).map(([p])=>p);
}

function isLikelyStacked(a,b){
 return !!(
  (a?.base_ref&&a.base_ref!=="main"&&a.base_ref===b?.head_ref)||
  (b?.base_ref&&b.base_ref!=="main"&&b.base_ref===a?.head_ref)
 );
}

function evidenceComplete(inbox){
 return inbox.status==="ok"&&inbox?.impact_summary?.status==="observed"&&
  inbox?.impact_summary?.not_scanned===0;
}

export function preflightReleaseConflicts(inbox,{maxPRs=6}={}){
 if(!inbox||!Array.isArray(inbox.open)||!Number.isInteger(maxPRs)||
    maxPRs<2||maxPRs>12)throw Error("invalid_conflict_input");
 const selected=inbox.open.slice(0,maxPRs);
 const skipped=inbox.open.length-selected.length;
 const pairs=[];
 let potential=0,missing=0,zeroOverlap=0,critical=0;
 for(let i=0;i<selected.length;i++){
  for(let j=i+1;j<selected.length;j++){
   const a=selected[i],b=selected[j];
   const pair={
    prs:[a.number,b.number],
    head_shas:[a.head_sha,b.head_sha],
    stacked_relationship:isLikelyStacked(a,b),
    status:"unknown",
    risks:[],
    shared_paths:[],
    // Never convert a successful preflight into merge, test or publish approval.
    three_way_merge:"not_tested",
    cross_pr_tests:"not_checked",
    eligible_for_release:false
   };
   const am=fileMap(a),bm=fileMap(b);
   if(!am||!bm||!SHA.test(a.head_sha)||!SHA.test(b.head_sha)){
    pair.status="inspection_incomplete";
    pair.risks.push({code:"incomplete_file_inventory",level:"unknown",
     paths:[],message:"수정 파일 목록이나 SHA가 불완전하여 충돌 위험을 판정할 수 없습니다."});
    missing++;pairs.push(pair);continue;
   }
   const common=[...am.keys()].filter(path=>bm.has(path)).sort();
   pair.shared_paths=common;
   if(common.length){
    const high=common.some(path=>
     SENSITIVE_CATEGORIES.has(am.get(path).category)||
     SENSITIVE_CATEGORIES.has(bm.get(path).category));
    pair.risks.push({code:"same_file_changed",level:high?"high":"review",
     paths:common.slice(0,30),
     message:"같은 파일을 변경했습니다. 병합 충돌 또는 수정 의도 충돌을 확인해야 합니다."});
   }
   const ae=edgeFunctionNames(am),be=edgeFunctionNames(bm);
   for(const name of ae.keys()){
    if(!be.has(name))continue;
    if(ae.get(name).some(path=>common.includes(path)))continue;
    pair.risks.push({code:"shared_edge_function",level:"high",
     paths:[...ae.get(name),...be.get(name)].sort().slice(0,12),
     identifier:name,
     message:"하나의 Supabase Edge Function 내부를 서로 다른 파일에서 변경했습니다. 인증 및 API 계약 검토가 필요합니다."});
   }
   const dbA=categoryPaths(am,"database_migration");
   const dbB=categoryPaths(bm,"database_migration");
   if(dbA.length&&dbB.length&&!dbA.some(path=>common.includes(path))){
    pair.risks.push({code:"parallel_db_migrations",level:"review",
     paths:[...dbA,...dbB].slice(0,20),
     message:"두 PR 모두 DB 마이그레이션을 추가했습니다. 동일 테이블·RLS·실행 순서 충돌은 SQL 내용을 검사해야 합니다."});
   }
   const deployA=categoryPaths(am,"deployment_or_ci");
   const deployB=categoryPaths(bm,"deployment_or_ci");
   if(deployA.length&&deployB.length&&!deployA.some(path=>common.includes(path))){
    pair.risks.push({code:"parallel_deployment_ci_changes",level:"review",
     paths:[...deployA,...deployB].slice(0,20),
     message:"두 PR 모두 배포 또는 CI 설정을 변경했습니다. 배포 경로와 승인 규칙을 통합 점검해야 합니다."});
   }
   const dataA=categoryPaths(am,"published_data");
   const dataB=categoryPaths(bm,"published_data");
   if(dataA.length&&dataB.length&&!dataA.some(path=>common.includes(path))){
    pair.risks.push({code:"parallel_published_data",level:"review",
     paths:[...dataA,...dataB].slice(0,20),
     message:"두 PR 모두 공개 데이터를 변경했습니다. 게시 승인 및 데이터 버전 일관성을 확인해야 합니다."});
   }
   if(a.head_sha===b.head_sha){
    pair.risks.push({code:"same_head_sha",level:"review",paths:[],
     message:"두 PR의 head SHA가 동일합니다. 중복 작업인지 확인해야 합니다."});
   }
   if(pair.risks.length){
    pair.status="review_required";
    potential++;if(pair.risks.some(x=>x.level==="high"))critical++;
   }else{
    pair.status="no_observed_overlap";
    zeroOverlap++;
   }
   pairs.push(pair);
  }
 }
 const fullyObserved=evidenceComplete(inbox)&&skipped===0&&missing===0;
 return {
  status:!pairs.length?"insufficient_prs":fullyObserved?"observed":"partial",
  total_open:inbox.open.length,inspected_prs:selected.length,uninspected_prs:skipped,
  pair_count:pairs.length,review_required_pairs:potential,
  high_risk_pairs:critical,incomplete_pairs:missing,
  no_observed_overlap_pairs:zeroOverlap,
  pairs,
  assessment_only:true,
  actual_merge_performed:false,
  integrated_tests_passed:false,
  version_creation_approved:false,
  production_deployment_approved:false
 };
}
