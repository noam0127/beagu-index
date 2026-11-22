import { createHash, createHmac, timingSafeEqual } from "node:crypto";

// REVIEW ONLY, not wired to any deployed Edge Function or Google Form.
// The official Form's owner-installed trigger must sign the exact callback.
// A signed callback proves the trusted *submission event*, NOT code ownership.
const CODE_FORMAT = /^(?:BG26-(?:[A-F0-9]{4}-){4}[A-F0-9]{4}|BG26-[A-HJ-NP-Z2-9]{6}-[A-HJ-NP-Z2-9]{6}|[A-HJ-NP-Z2-9]{10})$/;
const ID_FORMAT = /^[A-Za-z0-9_-]{8,180}$/;
const MAC_FORMAT = /^[a-f0-9]{64}$/;
const MAX_EVENT_AGE_MS = 48 * 60 * 60 * 1000;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
const EARLIEST_2026 = Date.parse("2026-11-01T00:00:00+09:00");
const sha256 = value => createHash("sha256").update(value).digest("hex");
const hmac = (secret,message) => createHmac("sha256",secret).update(message).digest("hex");
const deny = reason => ({ok:false,reason});

// This serialization is explicitly versioned and length-safe (no delimiter ambiguity).
function normalized(event) {
  if (!event || typeof event !== "object" || Array.isArray(event)) return null;
  const {sourceSpreadsheetId,formId,formResponseId,submittedAt,participantCode} = event;
  if (![sourceSpreadsheetId,formId,formResponseId,submittedAt,participantCode].every(x => typeof x === "string")) return null;
  if (!ID_FORMAT.test(sourceSpreadsheetId) || !ID_FORMAT.test(formId) || !ID_FORMAT.test(formResponseId)) return null;
  if (!CODE_FORMAT.test(participantCode)) return null;
  const submittedAtMs = Date.parse(submittedAt);
  if (!Number.isFinite(submittedAtMs) || new Date(submittedAtMs).toISOString() !== submittedAt) return null;
  return {sourceSpreadsheetId,formId,formResponseId,submittedAt,participantCode,submittedAtMs};
}

// Pure signing helper for approved trusted trigger integration and disposable tests;
// NEVER call from browser or publish the secret or output with any personal data.
export function signTrustedSubmissionEvent(event,{secret}={}) {
  if (typeof secret !== "string" || secret.length < 32) throw Error("TRUSTED_TRIGGER_SECRET_REQUIRED");
  const e = normalized(event);
  if (!e) throw Error("INVALID_TRUSTED_FORM_EVENT");
  return hmac(secret,JSON.stringify(["BEAGU_ST38_FORM_V1",e.sourceSpreadsheetId,e.formId,e.formResponseId,e.submittedAt,e.participantCode]));
}

export function verifyTrustedSubmissionEvent(event,{
  secret,signature,expectedSpreadsheetId,expectedFormId,
  nowMs=Date.now()
}={}) {
  if (typeof secret !== "string" || secret.length < 32 || !MAC_FORMAT.test(signature??""))
    return deny("TRUSTED_SIGNATURE_REQUIRED");
  const e=normalized(event);
  if (!e) return deny("INVALID_SUBMISSION_METADATA");
  if (e.sourceSpreadsheetId!==expectedSpreadsheetId || e.formId!==expectedFormId)
    return deny("UNTRUSTED_FORM_SOURCE");
  if (!Number.isFinite(nowMs) || e.submittedAtMs<EARLIEST_2026 ||
      e.submittedAtMs>nowMs+MAX_FUTURE_SKEW_MS ||
      nowMs-e.submittedAtMs>MAX_EVENT_AGE_MS)
    return deny("SUBMISSION_OUT_OF_WINDOW");
  const expected=signTrustedSubmissionEvent(e,{secret});
  if (!timingSafeEqual(Buffer.from(signature,"hex"),Buffer.from(expected,"hex")))
    return deny("SIGNATURE_MISMATCH");
  // The digest identifies an official Form response only inside this private
  // attestation process. There is no raw Form response ID or submitted code in
  // the output or logs.
  return {
    ok:true,
    schema:"beagu-stage38-own-submission-evidence-v1",
    eventDigest:hmac(secret,"BEAGU_ST38_EVENT_V1|"+e.formId+"|"+e.formResponseId),
    codeDigest:sha256(e.participantCode),
    campaign:"2026",
    evidenceStatus:"PENDING_ISSUANCE_AND_OWNER_BINDING",
    // Official form/response metadata alone CANNOT authorize Lv1 or Lv2.
    authorizedLevel:0
  };
}

export function evaluateTierFromPrivateEvidence({
  receipt,codeDigestFromIssuedLedger,ownerBindingVerified=false,
  referralHashMatched=false,validReferrals=0,upgradedAt=null,
  disabled=false,submissionAlreadyReused=false
}={}) {
  if (!receipt || receipt.ok!==true ||
      receipt.schema!=="beagu-stage38-own-submission-evidence-v1" ||
      receipt.evidenceStatus!=="PENDING_ISSUANCE_AND_OWNER_BINDING" ||
      !MAC_FORMAT.test(receipt.codeDigest??"") ||
      !MAC_FORMAT.test(receipt.eventDigest??"") ||
      !MAC_FORMAT.test(codeDigestFromIssuedLedger??"") ||
      receipt.codeDigest!==codeDigestFromIssuedLedger ||
      ownerBindingVerified!==true || disabled===true ||
      submissionAlreadyReused===true)
    return 0;
  // A verified Form submission + matching issued-code ownership permits Lv1.
  // A recommendation needs its OWN independent, reviewed credit ledger.
  if (referralHashMatched===true && Number.isSafeInteger(validReferrals) &&
      validReferrals>=1 && typeof upgradedAt==="string" &&
      Number.isFinite(Date.parse(upgradedAt)))
    return 2;
  return 1;
}
