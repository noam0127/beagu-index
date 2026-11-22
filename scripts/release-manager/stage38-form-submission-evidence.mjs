import { createHmac, timingSafeEqual } from "node:crypto";

// REVIEW ONLY, not wired to any deployed Edge Function or Google Form.
// The official Form's owner-installed trigger must sign the exact callback.
// A signed callback proves the trusted *submission event*, NOT code ownership.
const CODE_FORMAT = /^(?:BG26-(?:[A-F0-9]{4}-){4}[A-F0-9]{4}|BG26-[A-HJ-NP-Z2-9]{6}-[A-HJ-NP-Z2-9]{6}|[A-HJ-NP-Z2-9]{10})$/;
const ID_FORMAT = /^[A-Za-z0-9_-]{8,180}$/;
const MAC_FORMAT = /^[a-f0-9]{64}$/;
const MAX_EVENT_AGE_MS = 48 * 60 * 60 * 1000;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
const EARLIEST_2026 = Date.parse("2026-11-01T00:00:00+09:00");
const hmac = (secret,message) => createHmac("sha256",secret).update(message).digest("hex");
const signingInput = e => JSON.stringify(["BEAGU_ST38_FORM_V1",
  e.sourceSpreadsheetId,e.formId,e.formResponseId,e.submittedAt,e.participantCode]);
const deny = reason => ({ok:false,reason});

// This serialization is explicitly versioned and length-safe (no delimiter ambiguity).
function normalized(event) {
  if (!event || typeof event !== "object" || Array.isArray(event)) return null;
  const keys=Object.keys(event).sort();
  const allowed=["formId","formResponseId","participantCode","sourceSpreadsheetId","submittedAt"];
  if (JSON.stringify(keys)!==JSON.stringify(allowed)) return null;
  // No survey answers, participant names, emails, school fields or free text
  // may be supplied to the attestation process, even as ignored extra fields.
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
  return hmac(secret,signingInput(e));
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
  const expected=hmac(secret,signingInput(e));
  if (!timingSafeEqual(Buffer.from(signature,"hex"),Buffer.from(expected,"hex")))
    return deny("SIGNATURE_MISMATCH");
  // Domain-separated keyed digests: 2026 short codes can contain as few
  // as 50 bits of entropy. Plain SHA-256 would enable offline guessing after
  // a ledger leak; do NOT store or publish that SHA as an identity proof.
  const eventDigest=hmac(secret,"BEAGU_ST38_EVENT_V1|"+e.formId+"|"+e.formResponseId);
  const codeDigest=hmac(secret,"BEAGU_ST38_CODE_V1|"+e.participantCode);
  // No raw Form response ID or submitted code in the returned record.
  return {
    ok:true,
    schema:"beagu-stage38-own-submission-evidence-v1",
    eventDigest,
    codeDigest,
    campaign:"2026",
    evidenceStatus:"PENDING_ISSUANCE_AND_OWNER_BINDING",
    // Private integrity seal; callers cannot fabricate an evidence receipt
    // without the server's attestation secret. Not a public bearer token.
    receiptMac:hmac(secret,JSON.stringify(["BEAGU_ST38_RECEIPT_V1",
      eventDigest,codeDigest,"2026"])),
    // Official form/response metadata alone CANNOT authorize Lv1 or Lv2.
    authorizedLevel:0
  };
}

export function evaluateTierFromPrivateEvidence({
  secret,receipt,codeDigestFromIssuedLedger,ownerBindingVerified=false,
  submissionUniquenessConfirmed=false,
  referralHashMatched=false,validReferrals=0,upgradedAt=null,
  disabled=false
}={}) {
  if (typeof secret!=="string" || secret.length<32 ||
      !receipt || receipt.ok!==true ||
      receipt.schema!=="beagu-stage38-own-submission-evidence-v1" ||
      receipt.evidenceStatus!=="PENDING_ISSUANCE_AND_OWNER_BINDING" ||
      receipt.campaign!=="2026" || receipt.authorizedLevel!==0 ||
      !MAC_FORMAT.test(receipt.codeDigest??"") ||
      !MAC_FORMAT.test(receipt.eventDigest??"") ||
      !MAC_FORMAT.test(receipt.receiptMac??"") ||
      !MAC_FORMAT.test(codeDigestFromIssuedLedger??"") ||
      receipt.codeDigest!==codeDigestFromIssuedLedger ||
      ownerBindingVerified!==true || disabled===true ||
      submissionUniquenessConfirmed!==true)
    return 0;
  const expected=hmac(secret,JSON.stringify(["BEAGU_ST38_RECEIPT_V1",
    receipt.eventDigest,receipt.codeDigest,"2026"]));
  if (!timingSafeEqual(Buffer.from(receipt.receiptMac,"hex"),Buffer.from(expected,"hex")))
    return 0;
  // A verified Form submission + matching issued-code ownership permits Lv1.
  // A recommendation needs its OWN independent, reviewed credit ledger.
  if (referralHashMatched===true && Number.isSafeInteger(validReferrals) &&
      validReferrals>=1 && typeof upgradedAt==="string" &&
      Number.isFinite(Date.parse(upgradedAt)))
    return 2;
  return 1;
}


// REVIEW-ONLY rotation contract. Neither these key records nor the secrets
// belong in browser bundles, publicly exposed settings, or CI environments.
// Authorized backends must source high-entropy keys from secret management.
const KEY_ID_FORMAT=/^[a-z][a-z0-9_-]{1,31}$/;
const ROTATION_VERSION=2;
const ROTATING_SIGNATURE_CONTEXT="BEAGU_ST38_FORM_SIG_V2";
const ROTATING_DERIVE_CONTEXT="BEAGU_ST38_OWNER_SECRET_V2";

function validKeyRing(ring) {
  if (!ring || typeof ring!=="object" || Array.isArray(ring) ||
      typeof ring.activeKeyId!=="string" ||
      !ring.keys || typeof ring.keys!=="object" || Array.isArray(ring.keys))
    return false;
  const ids=Object.keys(ring.keys);
  if (ids.length===0 || ids.length>8 ||
      ids.filter(id=>ring.keys[id]?.status==="active").length!==1 ||
      !Object.hasOwn(ring.keys,ring.activeKeyId))
    return false;
  const secrets=new Set();
  for (const id of ids) {
    if (!KEY_ID_FORMAT.test(id)) return false;
    const entry=ring.keys[id];
    if (!entry || typeof entry!=="object" || Array.isArray(entry) ||
        typeof entry.secret!=="string" || entry.secret.length<32 ||
        !["active","verify-only","revoked"].includes(entry.status) ||
        (entry.status==="verify-only" && (
          !Number.isSafeInteger(entry.verifyUntilMs) || entry.verifyUntilMs<=0
        )) ||
        (entry.status!=="verify-only" && entry.verifyUntilMs!==undefined) ||
        secrets.has(entry.secret))
      return false;
    secrets.add(entry.secret);
  }
  return ring.keys[ring.activeKeyId].status==="active";
}

function allowedKey(ring,id,nowMs,forNewSignature=false) {
  if (!validKeyRing(ring) || !KEY_ID_FORMAT.test(id??"") ||
      !Number.isSafeInteger(nowMs) || nowMs<=0 ||
      !Object.hasOwn(ring.keys,id)) return null;
  const entry=ring.keys[id];
  if (entry.status==="revoked") return null;
  if (forNewSignature && (id!==ring.activeKeyId || entry.status!=="active"))
    return null;
  if (!forNewSignature && entry.status==="verify-only" &&
      nowMs>entry.verifyUntilMs) return null;
  return entry;
}

// Unique HMAC derivation context for this reference protocol version.
// Signing metadata and proof digests continue to have separate domain tags
// inside the version-1 signer; unrelated deployment keys must not be reused.
function rotatingSecret(entry) {
  return hmac(entry.secret,ROTATING_DERIVE_CONTEXT);
}
function rotatingMac(secret,keyId,innerSignature) {
  return hmac(secret,JSON.stringify([ROTATING_SIGNATURE_CONTEXT,keyId,
    innerSignature]));
}

// Only the single ACTIVE key can create new signed Form callbacks.
// The public envelope never includes any key or a private proof receipt.
export function signVersionedTrustedSubmissionEvent(event,{
  keyring,nowMs=Date.now()
}={}) {
  if (!validKeyRing(keyring)) throw Error("TRUSTED_KEYRING_REQUIRED");
  const keyId=keyring.activeKeyId;
  const entry=allowedKey(keyring,keyId,nowMs,true);
  if (!entry) throw Error("NO_ACTIVE_SIGNING_KEY");
  const derived=rotatingSecret(entry);
  const inner=signTrustedSubmissionEvent(event,{secret:derived});
  return {version:ROTATION_VERSION,keyId,
    signature:rotatingMac(derived,keyId,inner)};
}

// Old verify-only keys may validate *newly received* callbacks only until
// their explicit grace deadline. Unknown, revoked, expired and downgraded
// identifiers are not tried against any other key.
export function verifyVersionedTrustedSubmissionEvent(event,{
  keyring,envelope,expectedSpreadsheetId,expectedFormId,nowMs=Date.now()
}={}) {
  if (!validKeyRing(keyring)) return deny("TRUSTED_KEYRING_REQUIRED");
  if (!envelope || typeof envelope!=="object" ||
      Array.isArray(envelope) ||
      JSON.stringify(Object.keys(envelope).sort())!==
        JSON.stringify(["keyId","signature","version"]) ||
      envelope.version!==ROTATION_VERSION ||
      typeof envelope.keyId!=="string" ||
      !MAC_FORMAT.test(envelope.signature??""))
    return deny("INVALID_KEYED_ENVELOPE");
  const entry=allowedKey(keyring,envelope.keyId,nowMs,false);
  if (!entry) return deny("UNTRUSTED_OR_RETIRED_KEY");
  const derived=rotatingSecret(entry);
  let inner;
  try {
    inner=signTrustedSubmissionEvent(event,{secret:derived});
  } catch {
    return deny("INVALID_SUBMISSION_METADATA");
  }
  const expected=rotatingMac(derived,envelope.keyId,inner);
  if (!timingSafeEqual(Buffer.from(envelope.signature,"hex"),
                      Buffer.from(expected,"hex")))
    return deny("SIGNATURE_MISMATCH");
  const receipt=verifyTrustedSubmissionEvent(event,{
    secret:derived,signature:inner,
    expectedSpreadsheetId,expectedFormId,nowMs
  });
  if (!receipt.ok) return receipt;
  return {...receipt,cryptoVersion:ROTATION_VERSION,
    cryptoKeyId:envelope.keyId};
}

// Only a trusted server, never the caller, may supply ledger ownership and
// submission uniqueness proofs. It is still only a pure *reference* policy
// and does not grant a real session or mutate a DB.
export function evaluateTierFromRotatingEvidence({
  keyring,receipt,nowMs=Date.now(),...trustedServerChecks
}={}) {
  if (!receipt || receipt.cryptoVersion!==ROTATION_VERSION ||
      typeof receipt.cryptoKeyId!=="string")
    return 0;
  const entry=allowedKey(keyring,receipt.cryptoKeyId,nowMs,false);
  if (!entry) return 0;
  return evaluateTierFromPrivateEvidence({
    ...trustedServerChecks,receipt,secret:rotatingSecret(entry)
  });
}


// REVIEW-ONLY, server-internal enrollment lookup: unlike callback-signing
// keys, this distinct master key remains stable across routine Form-signature
// rotations. Use a separate, secret-managed random 256-bit key, never one
// of the keyring secrets. A lookup HMAC is NOT a password or login session.
const ENROLLMENT_LOOKUP_DOMAIN="BEAGU_ST38_ENROLLMENT_LOOKUP_V1";

export function deriveStableEnrollmentLookup(participantCode,{
  lookupSecret,lookupKeyId
}={}) {
  if (typeof participantCode!=="string" || !CODE_FORMAT.test(participantCode) ||
      typeof lookupSecret!=="string" || lookupSecret.length<32 ||
      typeof lookupKeyId!=="string" || !KEY_ID_FORMAT.test(lookupKeyId))
    throw Error("INVALID_ENROLLMENT_LOOKUP_INPUT");
  return {
    campaign:"2026",
    lookupKeyId,
    codeLookupDigest:hmac(lookupSecret,JSON.stringify([
      ENROLLMENT_LOOKUP_DOMAIN,"2026",participantCode
    ]))
  };
}

// A private, verified ledger row is required for READ-ONLY login eligibility.
// The server must additionally validate possession, rate limits and any
// account/device rules; this helper never issues or renews a session.
// A past callback signing key being retired does not itself revoke a
// legitimate enrollment, but suspected key compromise requires independent
// fraud review / record revocation.
export function isActiveEnrollmentFromPrivateLedger(participantCode,{
  lookupSecret,lookupKeyId,ledgerRow
}={}) {
  let expected;
  try {
    expected=deriveStableEnrollmentLookup(participantCode,{
      lookupSecret,lookupKeyId
    });
  } catch {
    return false;
  }
  if (!ledgerRow || typeof ledgerRow!=="object" ||
      Array.isArray(ledgerRow) ||
      ledgerRow.campaign!=="2026" ||
      ledgerRow.lookupKeyId!==expected.lookupKeyId ||
      ledgerRow.proofState!=="claimed" ||
      ledgerRow.evidenceOrigin!=="official-signed-form" ||
      ledgerRow.ownerBindingState!=="verified" ||
      ledgerRow.active!==true ||
      ledgerRow.revokedAt!==null ||
      typeof ledgerRow.codeLookupDigest!=="string" ||
      !MAC_FORMAT.test(ledgerRow.codeLookupDigest))
    return false;
  return timingSafeEqual(Buffer.from(expected.codeLookupDigest,"hex"),
                         Buffer.from(ledgerRow.codeLookupDigest,"hex"));
}
