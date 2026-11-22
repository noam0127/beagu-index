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
