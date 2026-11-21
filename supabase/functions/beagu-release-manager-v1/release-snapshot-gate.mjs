/**
 * Version snapshot finalization gate, v2 step 12.
 * Pure, read-only policy. No data from the browser may stand in for actual
 * CI, sandbox RLS/DB, Auth, dependency, or candidate browser evidence.
 * Callers MUST obtain evidence from independent trusted server-side sources.
 * Passing this gate does not deploy anything.
 */

export const REQUIRED_SNAPSHOT_EVIDENCE=Object.freeze({
 integrated_merge:Object.freeze({source:"github_tree",code:"integration_merge_unverified"}),
 dependency_review:Object.freeze({source:"github_dependency_review",code:"dependency_review_unverified"}),
 integrated_ci:Object.freeze({source:"github_ci",code:"integrated_ci_unverified"}),
 sandbox_database:Object.freeze({source:"sandbox_db",code:"sandbox_db_unverified"}),
 sandbox_rls:Object.freeze({source:"sandbox_db",code:"sandbox_rls_unverified"}),
 sandbox_auth:Object.freeze({source:"sandbox_auth",code:"sandbox_auth_unverified"}),
 candidate_browser:Object.freeze({source:"candidate_browser",code:"candidate_browser_unverified"}),
 independent_staging:Object.freeze({source:"independent_staging",code:"independent_staging_unverified"})
});

const SHA=/^[0-9a-f]{40}$/;
const safeSha=value=>typeof value==="string"&&SHA.test(value)?value:null;
const MAX_EVIDENCE_AGE_MS=2*60*60*1000;

/**
 * Returns an advisory decision, not a credential or a signed approval.
 * freezeActive MUST be true in production until a separate reviewed code change.
 *
 * Evidence contract: {state:"passed",source,head_sha,verified_at}.
 * Data provenance must be verified by the server BEFORE constructing this object.
 * A caller setting fields to "passed" cannot itself confer permission.
 */
/**
 * @typedef {{state?:string,source?:string,head_sha?:string,verified_at?:string}} ReleaseProof
 * @typedef {{
 *  mainSha?:string|null,reviewedSha?:string|null,
 *  candidateSha?:string|null,integratedSha?:string|null,
 *  evidence?:Record<string,ReleaseProof>|null,
 *  job?:{status?:string,action?:string,to_sha?:string|null}|null,
 *  ownerApproved?:boolean,freezeActive?:boolean,now?:number
 * }} ReleaseGateInput
 * @param {ReleaseGateInput} [options]
 */
export function evaluateReleaseSnapshotGate({
 mainSha=null,reviewedSha=null,candidateSha=null,integratedSha=null,
 evidence=null,job=null,ownerApproved=false,freezeActive=true,
 now=Date.now()
}={}){
 const reasonCodes=[];
 const block=code=>{if(!reasonCodes.includes(code))reasonCodes.push(code);};
 const main=safeSha(mainSha),reviewed=safeSha(reviewedSha);
 const candidate=safeSha(candidateSha),integrated=safeSha(integratedSha);
 if(freezeActive!==false)block("version_finalization_frozen");
 if(!main)block("main_sha_unavailable");
 if(!reviewed)block("reviewed_sha_missing");
 if(!candidate)block("candidate_sha_missing");
 if(!integrated)block("integrated_sha_unverified");
 if(main&&reviewed&&reviewed!==main)block("main_sha_changed");
 if(main&&candidate&&candidate!==main)block("candidate_not_current_main");
 if(integrated&&candidate&&integrated!==candidate)block("integrated_snapshot_mismatch");
 if(job?.status==="queued"||job?.status==="running")
  block("pending_release_job");
 if(job?.action==="stage_rollback"&&job?.status==="queued"&&!safeSha(job.to_sha))
  block("unsafe_staging_rollback_queued");
 if(ownerApproved!==true)block("owner_approval_missing");
 for(const [key,contract] of Object.entries(REQUIRED_SNAPSHOT_EVIDENCE)){
  const proof=evidence&&typeof evidence==="object"?evidence[key]:null;
  const at=typeof proof?.verified_at==="string"?Date.parse(proof.verified_at):NaN;
  const proofValid=proof?.state==="passed"&&proof?.source===contract.source&&
   candidate!==null&&proof?.head_sha===candidate&&Number.isFinite(at)&&
   Number.isFinite(now)&&at<=now&&now-at<=MAX_EVIDENCE_AGE_MS;
  if(!proofValid)block(contract.code);
 }
 const eligible=reasonCodes.length===0;
 return {
  status:eligible?"ready_for_snapshot":"blocked",
  eligible,
  reason_codes:reasonCodes,
  main_sha:main,
  candidate_sha:candidate,
  integration_sha:integrated,
  required_evidence_count:Object.keys(REQUIRED_SNAPSHOT_EVIDENCE).length,
  verified_evidence_count:Object.entries(REQUIRED_SNAPSHOT_EVIDENCE).filter(
   ([key,contract])=>{
    const proof=evidence&&typeof evidence==="object"?evidence[key]:null;
    const at=typeof proof?.verified_at==="string"?Date.parse(proof.verified_at):NaN;
    return proof?.state==="passed"&&proof?.source===contract.source&&
     candidate!==null&&proof?.head_sha===candidate&&Number.isFinite(at)&&
     Number.isFinite(now)&&at<=now&&now-at<=MAX_EVIDENCE_AGE_MS;
   }).length,
  approval_granted:false,
  // This policy has no Git operations and never creates/deploys a version.
  snapshot_created:false,
  staging_deployed:false,
  production_deployed:false
 };
}
