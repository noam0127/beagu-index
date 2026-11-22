// Stage38: allow only an exact, pinned v1.1.0-style RC branch as a
// staging candidate. This is NOT a production release authorization.
export function validStagingCandidate({ref,sha,version,summary}){
  return typeof ref==="string" &&
    /^release\/v\d+\.\d+\.\d+-rc\.[1-9]\d*$/.test(ref) &&
    typeof sha==="string" && /^[a-f0-9]{40}$/.test(sha) &&
    typeof version==="string" && /^v\d+\.\d+\.\d+-rc\.[1-9]\d*$/.test(version) &&
    ref==="release/"+version &&
    typeof summary==="string" && summary.length>=3 && summary.length<=500;
}
export function stageCandidateMatchesRef(candidate,gitRef){
  return gitRef?.ref==="refs/heads/"+candidate.ref &&
    gitRef?.object?.type==="commit" &&
    gitRef?.object?.sha===candidate.sha;
}

/* A branch/tag/display name is not authorization to release to production.
 * The immutable rc.1 SHA remains locked even if staging rollback changes
 * its displayed version to a generic "previous test version" label.
 * Broader RC detection also checks staging release history server-side. */
export const PINNED_NO_PRODUCTION_RCS=Object.freeze([
  "5c95aadad971901a8222f83c52e93bf901a3aeb7"
]);
export function isReleaseCandidateVersion(version){
  return typeof version==="string" &&
    /^v\d+\.\d+\.\d+-rc\.[1-9]\d*$/.test(version);
}
export function productionCandidateLocked(sha,version){
  return PINNED_NO_PRODUCTION_RCS.includes(sha) ||
    isReleaseCandidateVersion(version);
}
export function shouldAutoRegisterMainDraft(draftSha,stagingSha,version){
  // An owner-pinned RC is never replaced by a later main commit merely
  // because it was already applied to staging.
  return (!draftSha||draftSha===stagingSha) &&
    !isReleaseCandidateVersion(version);
}
