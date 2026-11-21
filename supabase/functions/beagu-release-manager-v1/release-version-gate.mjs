/**
 * Advisory, fail-closed release-version gate.
 *
 * NEVER an authorization token. Release creation must ALSO be blocked by a
 * server-owned kill switch until trusted end-to-end/approval evidence exists.
 * GitHub PR labels, a successful PR CI run, and user-submitted booleans are
 * not proof of isolated staging DB/RLS/browser validation.
 */
const SHA=/^[0-9a-f]{40}$/;
export const REQUIRED_RELEASE_WORKFLOWS=[
 "Site release manager checks",
 "Telemetry v2 gateway validation"
];
export const REQUIRED_EVIDENCE=[
 "isolated_staging_db",
 "staging_rls",
 "authenticated_api_runtime",
 "candidate_browser_e2e",
 "owner_release_approval"
];

function validSha(value){return typeof value==="string"&&SHA.test(value);}

/**
 * Inputs are server-derived snapshots. The UI must not supply an evidence
 * payload, release flags, or candidate PR details.
 */
export function evaluateReleaseVersionGate(input={}){
 const candidate=input.candidate&&typeof input.candidate==="object"?input.candidate:null;
 const mainSha=validSha(input.main_sha)?input.main_sha:null;
 const candidateSha=validSha(candidate?.head_sha)?candidate.head_sha:null;
 const expectedSha=validSha(input.expected_sha)?input.expected_sha:null;
 const expectedPR=Number.isSafeInteger(input.expected_pr)?input.expected_pr:null;
 const runsPayload=input.workflow_runs;
 const runs=Array.isArray(runsPayload?.workflow_runs)?runsPayload.workflow_runs:[];
 const completeRuns=Number.isSafeInteger(runsPayload?.total_count)&&
  runsPayload.total_count>=0&&runsPayload.total_count<=runs.length;
 const evidence=input.evidence&&typeof input.evidence==="object"?input.evidence:{};
 const reasons=[];
 const add=(code)=>{if(!reasons.includes(code))reasons.push(code);};
 if(!candidate) add("candidate_pr_not_verified");
 else{
  if(!expectedPR||candidate.number!==expectedPR)add("unexpected_candidate_pr");
  if(candidate.state!=="closed"||!candidate.merged_at)add("candidate_pr_not_merged");
  if(candidate.draft===true)add("candidate_pr_draft");
  if(!candidateSha)add("candidate_sha_invalid");
 }
 if(!mainSha)add("main_sha_unavailable");
 if(!expectedSha)add("expected_sha_unavailable");
 if(expectedSha&&mainSha&&expectedSha!==mainSha)add("main_moved_since_review");
 if(candidateSha&&mainSha&&candidateSha!==mainSha)
  add("candidate_not_equal_to_current_main");
 // A fully checked candidate must be bound to the immutable head used for CI.
 if(!completeRuns)add("workflow_evidence_unavailable");
 const workflow_results=REQUIRED_RELEASE_WORKFLOWS.map(name=>{
  const sameSha=runs.filter(r=>r&&r.name===name&&r.head_sha===candidateSha);
  const success=sameSha.some(r=>r.status==="completed"&&r.conclusion==="success");
  if(!success)add("required_workflow_not_verified");
  return {name,status:success&&completeRuns?"success":"unverified"};
 });
 for(const name of REQUIRED_EVIDENCE){
  // Exact SHA-bound evidence from a separately audited store is needed; an
  // unbound boolean (or a CI result) cannot grant release approval.
  const claim=evidence[name];
  if(!candidateSha||claim?.status!=="verified"||claim?.sha!==candidateSha)
   add("required_"+name+"_unverified");
 }
 if(input.active_release_job===true)add("release_queue_busy");
 if(input.server_creation_paused!==false)add("release_creation_paused");
 return {
  status:reasons.length?"blocked":"eligible_for_server_review",
  allow_create_version:reasons.length===0,
  reasons,
  candidate_pr:expectedPR,
  candidate_sha:candidateSha,
  main_sha:mainSha,
  reviewed_main_sha:expectedSha,
  required_workflows:workflow_results,
  evidence:REQUIRED_EVIDENCE.map(name=>({
   name,status:validSha(candidateSha)&&evidence[name]?.status==="verified"&&
    evidence[name]?.sha===candidateSha?"verified":"not_verified"
  })),
  inspected_workflow_runs:completeRuns,
  // No claim here authorizes publishing or writes to any database.
  deployment_approval:false
 };
}
