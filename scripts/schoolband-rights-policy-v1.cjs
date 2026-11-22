"use strict";
/**
 * Schoolband 022 – trusted, local, offline rights gate.
 * This does NOT solicit permissions or grant publication rights.
 * Only already-in-repository originals or separately precleared records can pass
 * a PRIVATE intake. A user-submitted "approved": true claim is never trusted.
 */
const INTERNAL_SONGS=new Set([
  "original-shining-our-school",
  "original-meter-shift-exercise-014"
]);
const SOURCE_KINDS=new Set(["events_json","midi","musicxml","score_pdf"]);
const PARTS=["composition","lyrics","arrangement","sound_recording"];
class RightsIntakeError extends Error{
 constructor(code){super(code);this.name="RightsIntakeError";this.code=code;}
}
function requireGate(ok,code){if(!ok)throw new RightsIntakeError(code);}
function isoDate(value){
 if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const d=new Date(value+"T00:00:00Z");
 return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;
}
function authorizePrivateIntake(registry,request,now="2026-11-23"){
 requireGate(isoDate(now),"invalid_review_date");
 requireGate(registry&&registry.schema_version===1&&registry.policy==="deny_by_default"&&
   registry.public_release_enabled===false&&registry.allow_external_permission_requests===false&&
   Array.isArray(registry.records),"invalid_trust_registry");
 requireGate(request&&typeof request==="object"&&!Array.isArray(request),"invalid_submission");
 requireGate(request.public_release!==true,"publication_not_allowed");
 const records=registry.records.filter(x=>x.song_id===request.song_id);
 requireGate(records.length===1,"untrusted_source");
 const rec=records[0];
 requireGate(rec.source_kind===request.source_kind&&SOURCE_KINDS.has(rec.source_kind),
  "unsupported_source_kind");
 requireGate(rec.source_path===request.source_path&&
  typeof rec.source_path==="string"&&
  /^games\/nangam-schoolband-v08\/charts\/[A-Za-z0-9._-]+$/.test(rec.source_path),
  "source_path_mismatch");
 requireGate(typeof request.source_git_blob_sha1==="string"&&
  /^[0-9a-f]{40}$/.test(request.source_git_blob_sha1)&&
  request.source_git_blob_sha1===rec.source_git_blob_sha1,"source_digest_mismatch");
 requireGate((rec.school_id??null)===(request.school_id??null),"school_identity_mismatch");
 requireGate(rec.public_approved===false,"private_intake_only");
 requireGate(["approved_internal","approved_precleared"].includes(rec.review_state),
  "not_previously_approved");
 requireGate(isoDate(rec.valid_from)&&rec.valid_from<=now,"not_yet_valid");
 requireGate(rec.valid_until===null||
   isoDate(rec.valid_until)&&rec.valid_until>=rec.valid_from&&rec.valid_until>=now,
  "approval_expired");
 requireGate(rec.revoked_at===null||rec.revoked_at===undefined||
   isoDate(rec.revoked_at)&&rec.revoked_at>now,"approval_revoked");
 requireGate(Array.isArray(rec.scopes)&&
   rec.scopes.includes("convert_to_game")&&rec.scopes.includes("internal_playtest"),
  "conversion_scope_missing");
 requireGate(rec.components&&typeof rec.components==="object","component_rights_missing");
 for(const component of PARTS){
  const state=rec.components[component];
  requireGate(state==="original_owned"||state==="not_used"||state==="precleared",
    "component_uncleared_"+component);
 }
 requireGate(rec.components.composition!=="not_used","composition_required");
 if(rec.review_state==="approved_internal"){
  requireGate(INTERNAL_SONGS.has(rec.song_id)&&rec.school_id===null&&
   typeof rec.evidence_ref==="string"&&rec.evidence_ref.startsWith("repo:schoolband:")&&
   PARTS.every(p=>rec.components[p]!=="precleared"),"nonoriginal_internal_claim");
 }else{
  requireGate(typeof rec.school_id==="string"&&/^[0-9A-Za-z_-]{4,32}$/.test(rec.school_id)&&
   typeof rec.evidence_ref==="string"&&/^existing:[A-Za-z0-9._-]{8,128}$/.test(rec.evidence_ref)&&
   isoDate(rec.valid_until)&&
   PARTS.every(p=>rec.components[p]==="precleared"||rec.components[p]==="not_used"),
   "existing_clearance_evidence_required");
 }
 return Object.freeze({
  allowed:true,publication_allowed:false,
  song_id:rec.song_id,school_id:rec.school_id??null,
  source_kind:rec.source_kind,source_path:rec.source_path,
  source_git_blob_sha1:rec.source_git_blob_sha1,
  route:rec.source_kind==="events_json"?"private_conversion_candidate":"quarantine_for_format_parser",
  review_state:rec.review_state
 });
}
module.exports={authorizePrivateIntake,RightsIntakeError,isoDate};
