import assert from "node:assert/strict";
import test from "node:test";
import {
  signVersionedTrustedSubmissionEvent,
  verifyVersionedTrustedSubmissionEvent,
  evaluateTierFromRotatingEvidence
} from "../scripts/release-manager/stage38-form-submission-evidence.mjs";

// All events, secrets, IDs and codes are fictional: NO Supabase, Google Form,
// webhook, network, production key or actual user data is used here.
const when=Date.parse("2026-11-22T05:00:00.000Z");
const oldSecret="ST38-SYNTHETIC-OLD-KEY-NEVER-IN-PRODUCTION-123456789";
const newSecret="ST38-SYNTHETIC-NEW-KEY-NEVER-IN-PRODUCTION-987654321";
const otherSecret="ST38-SYNTHETIC-OTHER-KEY-NEVER-IN-PRODUCTION-123";
const oldRing={activeKeyId:"k2026a",keys:{
  k2026a:{secret:oldSecret,status:"active"}
}};
const graceRing={activeKeyId:"k2026b",keys:{
  k2026a:{secret:oldSecret,status:"verify-only",verifyUntilMs:when+60000},
  k2026b:{secret:newSecret,status:"active"}
}};
const retiredRing={activeKeyId:"k2026b",keys:{
  k2026a:{secret:oldSecret,status:"revoked"},
  k2026b:{secret:newSecret,status:"active"}
}};
const event={
  sourceSpreadsheetId:"ST38_SYNTHETIC_SPREADSHEET_00001",
  formId:"ST38_SYNTHETIC_GOOGLE_FORM_00001",
  formResponseId:"ST38_SYNTHETIC_RESPONSE_00001",
  submittedAt:new Date(when-10000).toISOString(),
  participantCode:"K7M9Q2X4T8"
};
const verify=(envelope,keyring=graceRing,nowMs=when)=>
  verifyVersionedTrustedSubmissionEvent(event,{keyring,envelope,nowMs,
    expectedSpreadsheetId:event.sourceSpreadsheetId,expectedFormId:event.formId});

test("new callbacks use only active key, versioned MAC and no key material",()=>{
  const envelope=signVersionedTrustedSubmissionEvent(event,{keyring:graceRing,nowMs:when});
  assert.deepEqual(Object.keys(envelope).sort(),["keyId","signature","version"]);
  assert.equal(envelope.keyId,"k2026b");
  assert.equal(envelope.version,2);
  assert.match(envelope.signature,/^[a-f0-9]{64}$/);
  const wire=JSON.stringify(envelope);
  for(const forbidden of [newSecret,oldSecret,event.participantCode,event.formResponseId,
    event.sourceSpreadsheetId]) assert.ok(!wire.includes(forbidden));
  const receipt=verify(envelope);
  assert.equal(receipt.ok,true);
  assert.equal(receipt.cryptoVersion,2);
  assert.equal(receipt.cryptoKeyId,"k2026b");
  assert.equal(receipt.authorizedLevel,0);
  assert.ok(!JSON.stringify(receipt).includes(newSecret));
});
test("old signed callback remains valid only during explicit verify-only grace",()=>{
  const old=signVersionedTrustedSubmissionEvent(event,{keyring:oldRing,nowMs:when});
  assert.equal(old.keyId,"k2026a");
  assert.equal(verify(old).ok,true);
  assert.equal(verify(old,graceRing,when+60000).ok,true);
  assert.equal(verify(old,graceRing,when+60001).reason,"UNTRUSTED_OR_RETIRED_KEY");
  assert.equal(verify(old,retiredRing).reason,"UNTRUSTED_OR_RETIRED_KEY");
  assert.equal(verify(old,{activeKeyId:"k2026b",keys:{
    k2026b:{secret:newSecret,status:"active"}
  }}).reason,"UNTRUSTED_OR_RETIRED_KEY");
});
test("expired/revoked/unknown/downgraded envelope cannot fall back to active key",()=>{
  const current=signVersionedTrustedSubmissionEvent(event,{keyring:graceRing,nowMs:when});
  assert.equal(verify({...current,keyId:"k2026a"}).reason,"SIGNATURE_MISMATCH");
  assert.equal(verify({...current,keyId:"k2026z"}).reason,"UNTRUSTED_OR_RETIRED_KEY");
  assert.equal(verify({...current,version:1}).reason,"INVALID_KEYED_ENVELOPE");
  assert.equal(verify({...current,version:"2"}).reason,"INVALID_KEYED_ENVELOPE");
  assert.equal(verify({...current,signature:"f".repeat(64)}).reason,"SIGNATURE_MISMATCH");
  assert.equal(verify({...current,legacySecret:"fake-extra"}).reason,"INVALID_KEYED_ENVELOPE");
  assert.equal(verify({version:1,keyId:"k2026a",signature:"0".repeat(64)})
    .reason,"INVALID_KEYED_ENVELOPE");
  assert.equal(verify(current,retiredRing).ok,true);
});
test("invalid keyring configuration never authorizes proofs or signs callbacks",()=>{
  for(const bad of [
    null,{},{activeKeyId:"k2026a",keys:{}},
    {activeKeyId:"k2026a",keys:{k2026a:{secret:"too-short",status:"active"}}},
    {activeKeyId:"k2026a",keys:{k2026a:{secret:oldSecret,status:"verify-only"}}},
    {activeKeyId:"k2026a",keys:{
      k2026a:{secret:oldSecret,status:"active"},
      k2026b:{secret:newSecret,status:"active"}
    }},
    {activeKeyId:"k2026a",keys:{
      k2026a:{secret:oldSecret,status:"active"},
      k2026b:{secret:oldSecret,status:"revoked"}
    }},
    {activeKeyId:"k2026a",keys:{
      k2026a:{secret:oldSecret,status:"active"},
      k2026b:{secret:newSecret,status:"verify-only",verifyUntilMs:null}
    }}
  ]){
    assert.throws(()=>signVersionedTrustedSubmissionEvent(event,{keyring:bad,nowMs:when}),
      /TRUSTED_KEYRING_REQUIRED/);
    assert.equal(verify({version:2,keyId:"k2026a",signature:"f".repeat(64)},bad)
      .reason,"TRUSTED_KEYRING_REQUIRED");
  }
});
test("forged or foreign Form events cannot reuse a legitimate key-ID envelope",()=>{
  const envelope=signVersionedTrustedSubmissionEvent(event,{keyring:graceRing,nowMs:when});
  const opts={keyring:graceRing,envelope,nowMs:when,
    expectedSpreadsheetId:event.sourceSpreadsheetId,
    expectedFormId:event.formId};
  for (const delta of [
    {participantCode:"BG26-ABCD-1234-ABCD-1234-ABCD"},
    {formResponseId:"ST38_SYNTHETIC_RESPONSE_99999"},
    {submittedAt:new Date(when-2000).toISOString()}
  ]){
    assert.equal(verifyVersionedTrustedSubmissionEvent({...event,...delta},opts)
      .reason,"SIGNATURE_MISMATCH");
  }
  assert.equal(verifyVersionedTrustedSubmissionEvent(event,{
    ...opts,expectedFormId:"ST38_DIFFERENT_FORM_00001"
  }).reason,"UNTRUSTED_FORM_SOURCE");
  assert.equal(verifyVersionedTrustedSubmissionEvent({...event,rawSurveyAnswers:"secret"},opts)
    .reason,"INVALID_SUBMISSION_METADATA");
});
test("receipt key ID controls verification, not externally supplied active key",()=>{
  const oldEnvelope=signVersionedTrustedSubmissionEvent(event,{keyring:oldRing,nowMs:when});
  const receipt=verify(oldEnvelope,graceRing,when);
  assert.equal(receipt.ok,true);
  const checked={
    keyring:graceRing,receipt,nowMs:when,
    codeDigestFromIssuedLedger:receipt.codeDigest,
    ownerBindingVerified:true,submissionUniquenessConfirmed:true
  };
  assert.equal(evaluateTierFromRotatingEvidence(checked),1);
  assert.equal(evaluateTierFromRotatingEvidence({
    ...checked,referralHashMatched:true,validReferrals:1,
    upgradedAt:"2026-11-22T00:00:00Z"
  }),2);
  assert.equal(evaluateTierFromRotatingEvidence({
    ...checked,ownerBindingVerified:false
  }),0);
  assert.equal(evaluateTierFromRotatingEvidence({
    ...checked,submissionUniquenessConfirmed:false
  }),0);
  assert.equal(evaluateTierFromRotatingEvidence({
    ...checked,receipt:{...receipt,cryptoKeyId:"k2026b"}
  }),0);
  assert.equal(evaluateTierFromRotatingEvidence({
    ...checked,nowMs:when+60001
  }),0);
  assert.equal(evaluateTierFromRotatingEvidence({
    ...checked,keyring:retiredRing
  }),0);
});
test("new-key code fingerprints differ from old: issuance ledger must be key-ID tagged",()=>{
  const old=verify(
    signVersionedTrustedSubmissionEvent(event,{keyring:oldRing,nowMs:when}),
    graceRing,when
  );
  const latest=verify(
    signVersionedTrustedSubmissionEvent(event,{keyring:graceRing,nowMs:when})
  );
  assert.equal(old.ok,true);
  assert.equal(latest.ok,true);
  assert.notEqual(old.codeDigest,latest.codeDigest);
  assert.notEqual(old.eventDigest,latest.eventDigest);
  assert.notEqual(old.receiptMac,latest.receiptMac);
  // "Rehash old digests using the new key" is impossible without the
  // original secret/code; never infer an automatic migration.
  assert.equal(evaluateTierFromRotatingEvidence({
    keyring:graceRing,receipt:old,nowMs:when,
    codeDigestFromIssuedLedger:latest.codeDigest,
    ownerBindingVerified:true,submissionUniquenessConfirmed:true
  }),0);
});
console.log("PASS: Stage38 synthetic proof key rotation: active-only signing, grace, revocation, unknown kid, tamper, HMAC-ledger separation.");
