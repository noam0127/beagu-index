/**
 * GitHub PR work inbox ingestion for the Release v2 admin page.
 * Pure data normalization and pagination: no credentials, database writes or deployments.
 * Node and Supabase Edge Function can import this module unchanged.
 */
import {extractDeclaredDependencies} from "./release-work-dependencies.mjs";

const SHA=/^[0-9a-f]{40}$/;
const SAFE_REPOSITORY=/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;

export function normalizeWorkPull(raw,repository="noam0127/beagu-index"){
 if(!raw||typeof raw!=="object"||!SAFE_REPOSITORY.test(repository))return null;
 const number=Number(raw.number);
 if(!Number.isSafeInteger(number)||number<=0)return null;
 const url="https://github.com/"+repository+"/pull/"+number;
 if(raw.html_url!==url)return null;
 const headSha=String(raw.head?.sha||"");
 if(!SHA.test(headSha))return null;
 const state=raw.state==="open"?"open":raw.state==="closed"?"closed":null;
 if(!state)return null;
 const mergedAt=typeof raw.merged_at==="string"&&Number.isFinite(Date.parse(raw.merged_at))?
   raw.merged_at:null;
 const baseRef=String(raw.base?.ref||"").slice(0,120);
 const status=state==="open"?(raw.draft===true?"draft":"review"):
   mergedAt?(baseRef==="main"?"merged_to_main":"merged_other_base"):"closed_unmerged";
 const mergeCommit=String(raw.merge_commit_sha||"");
 return {
  number,
  title:String(raw.title||"제목 없음").slice(0,180),
  url,
  status,
  draft:raw.draft===true,
  base_ref:baseRef,
  head_ref:String(raw.head?.ref||"").slice(0,160),
  head_sha:headSha,
  merge_sha:SHA.test(mergeCommit)?mergeCommit:null,
  declared_dependencies:extractDeclaredDependencies(raw.body),
  updated_at:typeof raw.updated_at==="string"&&Number.isFinite(Date.parse(raw.updated_at))?
    raw.updated_at:null,
  merged_at:mergedAt
 };
}

/**
 * Retrieve up to maxPages of newest PRs (open, merged, abandoned) with explicit
 * partial/error disclosure. Never mistake an incomplete result for "no PRs".
 * fetchPage(page,perPage) is injected for testability.
 */
export async function collectGitHubWorkInbox(fetchPage,options={}){
 const repository=options.repository||"noam0127/beagu-index";
 const perPage=options.perPage??100;
 const maxPages=options.maxPages??3;
 if(!SAFE_REPOSITORY.test(repository)||
    !Number.isInteger(perPage)||perPage<1||perPage>100||
    !Number.isInteger(maxPages)||maxPages<1||maxPages>5)
   throw Error("invalid_inbox_options");
 const seen=new Set();
 const all=[];
 let fetchedPages=0,partial=false,truncated=false,reason=null,skipped=0;
 for(let page=1;page<=maxPages;page++){
  let result;
  try{
   result=await fetchPage(page,perPage);
   if(!Array.isArray(result))throw Error("github_invalid_pr_response");
  }catch{
   partial=true;reason="github_unavailable";
   break;
  }
  fetchedPages++;
  for(const item of result){
   const row=normalizeWorkPull(item,repository);
   if(!row){skipped++;continue;}
   if(seen.has(row.number))continue;
   seen.add(row.number);all.push(row);
  }
  if(result.length<perPage)break;
  if(page===maxPages)truncated=true;
 }
 all.sort((a,b)=>(Date.parse(b.updated_at||"")||0)-(Date.parse(a.updated_at||"")||0));
 const open=all.filter(x=>x.status==="draft"||x.status==="review");
 const merged=all.filter(x=>x.status==="merged_to_main");
 const mergedElsewhere=all.filter(x=>x.status==="merged_other_base");
 const ignored=all.filter(x=>x.status==="closed_unmerged").length;
 return {
  status:partial?(fetchedPages?"partial":"error"):(truncated||skipped>0)?"partial":"ok",
  reason:reason||(truncated?"results_truncated":skipped>0?"invalid_pr_metadata":null),
  fetched_pages:fetchedPages,
  page_size:perPage,
  truncated,
  skipped_invalid:skipped,
  total_seen:all.length,
  open_count:open.length,
  merged_to_main_count:merged.length,
  merged_elsewhere_count:mergedElsewhere.length,
  closed_unmerged_count:ignored,
  open,
  recently_merged:merged.slice(0,40),
  merged_elsewhere:mergedElsewhere.slice(0,40),
  closed_unmerged:all.filter(x=>x.status==="closed_unmerged").slice(0,60)
 };
}
