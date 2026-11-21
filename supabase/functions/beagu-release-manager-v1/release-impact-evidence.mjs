/**
 * Release v2 PR impact inventory.
 * Reads GitHub PR changed-file metadata and check-run snapshots WITHOUT
 * deciding whether the PR can be merged/deployed.
 * No network/global dependencies: callers supply fetchFiles/fetchChecks.
 */
const SHA=/^[0-9a-f]{40}$/;
const PATH=/^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[^\u0000-\u001f\\]{1,450}$/;

export function classifyReleasePath(path){
 if(typeof path!=="string"||!PATH.test(path))return "invalid";
 if(/^supabase\/migrations\/.*\.sql$/i.test(path))return "database_migration";
 if(/^supabase\/functions\/[^/]+\//i.test(path))return "edge_function";
 if(/^\.github\/workflows\/[^/]+\.ya?ml$/i.test(path))return "deployment_or_ci";
 if(/^(?:scripts\/release-manager\/|scripts\/deploy\/)/i.test(path))return "deployment_or_ci";
 if(/^(?:tests\/|test\/|__tests__\/)/i.test(path)||/\.(?:test|spec)\.[cm]?[jt]sx?$/i.test(path))return "test_code";
 if(/^(?:js\/|styles\/|css\/|assets\/)/i.test(path)||/\.(?:html|css|jsx|tsx)$/i.test(path))return "web_ui";
 if(/^(?:data\/|public\/data\/)/i.test(path))return "published_data";
 if(/^docs\/|\.md$/i.test(path))return "documentation";
 return "other_code";
}

export function summarizeReleasePaths(fileRows,{complete=true,reason=null}={}){
 if(!Array.isArray(fileRows))throw Error("invalid_pr_file_list");
 const unique=new Map(),invalid=[];
 for(const row of fileRows){
  const path=String(row?.filename||"");
  const category=classifyReleasePath(path);
  if(category==="invalid"){invalid.push(path.slice(0,80));continue;}
  if(unique.has(path))continue;
  unique.set(path,{
   path,category,status:["added","removed","modified","renamed","copied","changed","unchanged"].includes(row.status)?
    row.status:"unknown",
   additions:Number.isSafeInteger(row.additions)&&row.additions>=0?row.additions:0,
   deletions:Number.isSafeInteger(row.deletions)&&row.deletions>=0?row.deletions:0
  });
 }
 const files=[...unique.values()];
 const category_counts={};
 for(const file of files)category_counts[file.category]=(category_counts[file.category]||0)+1;
 const risk_flags=[];
 if(category_counts.database_migration)risk_flags.push("database_schema_review");
 if(category_counts.edge_function)risk_flags.push("edge_function_auth_review");
 if(category_counts.deployment_or_ci)risk_flags.push("deployment_pipeline_review");
 if(category_counts.published_data)risk_flags.push("published_data_approval");
 if(category_counts.web_ui)risk_flags.push("browser_regression_review");
 // A test file is only a changed file. Never infer CI execution from its existence.
 const tests_changed=files.filter(x=>x.category==="test_code").map(x=>x.path);
 const status=!complete||invalid.length?"partial":"complete";
 return {
  status,reason:!complete?(reason||"files_incomplete"):invalid.length?"invalid_path":null,
  file_count:files.length,
  additions:files.reduce((n,x)=>n+x.additions,0),
  deletions:files.reduce((n,x)=>n+x.deletions,0),
  category_counts,risk_flags,tests_changed,
  files:files.slice(0,160),
  unrecognized_count:invalid.length
 };
}

/**
 * GitHub check-runs are evidence for one exact head SHA only, not proof that
 * selected PRs coexist safely, staging E2E passed, or production was deployed.
 */
export function summarizeReleaseChecks(payload,headSha){
 if(!SHA.test(String(headSha||""))||!payload||!Array.isArray(payload.check_runs))
  return {status:"unavailable",reason:"checks_unavailable",observed:0};
 const total=Number(payload.total_count);
 if(!Number.isSafeInteger(total)||total<0)return {status:"unavailable",reason:"invalid_count",observed:0};
 const rows=payload.check_runs.slice(0,100);
 if(rows.some(x=>x?.head_sha!==headSha))
  return {status:"partial",reason:"check_sha_mismatch",observed:0};
 const results=rows.map(x=>({
  name:String(x?.name||"unnamed").slice(0,100),
  state:x?.status==="completed"?"completed":x?.status==="in_progress"?"in_progress":"queued",
  conclusion:x?.status==="completed"?
   (["success","failure","cancelled","timed_out","neutral","skipped","action_required","startup_failure"].includes(x?.conclusion)?
    x.conclusion:"unknown"):null
 }));
 return {
  status:total>rows.length?"partial":"observed",
  reason:total>rows.length?"check_runs_truncated":null,
  observed:rows.length,
  declared_total:total,
  succeeded:results.filter(x=>x.conclusion==="success").length,
  failed:results.filter(x=>["failure","timed_out","startup_failure"].includes(x.conclusion)).length,
  pending:results.filter(x=>x.state!=="completed").length,
  checks:results,
  // Never set integration_tests to passed here: this proves one head SHA only.
  integration_safety:"not_checked"
 };
}

async function inspectOnePR(row,{fetchFiles,fetchChecks},pages){
 const notScanned={status:"not_scanned",reason:"not_requested",file_count:null,files:[],risk_flags:[]};
 if(!SHA.test(row.head_sha))return {...row,impact:{...notScanned,status:"error",reason:"bad_head_sha"},checks:{status:"unavailable",reason:"bad_head_sha",observed:0}};
 const fileRows=[];let complete=true,reason=null;
 for(let page=1;page<=pages;page++){
  let data;
  try{
   data=await fetchFiles(row.number,page,100,row.head_sha);
   if(!Array.isArray(data))throw Error("not_array");
  }catch{
   complete=false;reason="github_file_list_unavailable";break;
  }
  fileRows.push(...data);
  if(data.length<100)break;
  if(page===pages){complete=false;reason="file_list_truncated";}
 }
 const impact=summarizeReleasePaths(fileRows,{complete,reason});
 let checks;
 try{
  checks=summarizeReleaseChecks(await fetchChecks(row.head_sha,row.number),row.head_sha);
 }catch{checks={status:"unavailable",reason:"github_checks_unavailable",observed:0};}
 return {...row,impact,checks};
}

/** Bounded 8 PRs per read-only admin refresh to avoid unbounded API calls. */
export async function inspectReleaseWorkInbox(inbox,adapters,options={}){
 if(!inbox||!Array.isArray(inbox.open)||typeof adapters?.fetchFiles!=="function"||
    typeof adapters?.fetchChecks!=="function")throw Error("invalid_inspection_input");
 const maxPRs=options.maxPRs??8,maxPages=options.maxPages??3;
 if(!Number.isInteger(maxPRs)||maxPRs<1||maxPRs>12||
    !Number.isInteger(maxPages)||maxPages<1||maxPages>3)throw Error("invalid_inspection_options");
 const selected=inbox.open.slice(0,maxPRs);
 const inspected=new Map();
 // Bounded pairwise concurrency to limit GitHub anonymous REST rate pressure.
 for(let i=0;i<selected.length;i+=2){
  const batch=await Promise.all(selected.slice(i,i+2).map(row=>inspectOnePR(row,adapters,maxPages)));
  for(const row of batch)inspected.set(row.number,row);
 }
 const open=inbox.open.map(row=>inspected.get(row.number)||{
  ...row,impact:{status:"not_scanned",reason:"inspection_limit",files:[],file_count:null,risk_flags:[]},
  checks:{status:"unavailable",reason:"not_scanned",observed:0}
 });
 const counts={complete:0,partial:0,error:0,not_scanned:0};
 for(const row of open){
  const key=row.impact.status;
  if(Object.hasOwn(counts,key))counts[key]++;
 }
 return {...inbox,open,impact_summary:{
  status:inbox.status!=="ok"||counts.partial||counts.error||counts.not_scanned?"partial":"observed",
  inspected_count:inspected.size,total_open:inbox.open.length,...counts,
  // File-list and CI metadata are not actual three-way merge or E2E proof.
  integration_conflicts:"not_tested",integration_tests:"not_checked"
 }};
}
