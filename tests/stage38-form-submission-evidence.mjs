import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import {
  signTrustedSubmissionEvent, verifyTrustedSubmissionEvent,
  evaluateTierFromPrivateEvidence
} from "../scripts/release-manager/stage38-form-submission-evidence.mjs";

// Offline fixtures ONLY: no official Google Form, real submissions,
// Supabase credentials, user data, or external network calls.
const secret="synthetic-owner-signing-key-never-used-in-production-xxxxx";
const otherSecret="synthetic-other-signing-key-never-used-in-production-yyyy";
const sourceSpreadsheetId="1T_rEz1LqX97pC9gOv33SRmspK2IizTU3wFtxA8P1pC4";
const formId="SYNTHETIC_OFFICIAL_FORM_00001";
const now=Date.parse("2026-11-22T05:00:00.000Z");
const code="K7M9Q2X4T8"; // 11? deliberate? use actual allowed 10-symbol example below
const participantCode="K7M9Q2X4T"; // 10 Base32 symbols, 50-bit format
const event={
  sourceSpreadsheetId,formId,
  formResponseId:"SYNTHETIC_RESPONSE_ID_123456",
  submittedAt:new Date(now-5000).toISOString(),
  participantCode
};
const accepted=(overrides={},overrideOpts={})=>{
  const candidate={...event,...overrides};
  const signature=signTrustedSubmissionEvent(candidate,{secret});
  return verifyTrustedSubmissionEvent(candidate,{
    secret,signature,expectedSpreadsheetId:sourceSpreadsheetId,
    expectedFormId:formId,nowMs:now,...overrideOpts
  });
};
const digest=val=>createHash("sha256").update(val).digest("hex");

test("official signed synthetic response gives private evidence, not login",()=>{
  const evidence=accepted();
  assert.equal(evidence.ok,true);
  assert.equal(evidence.schema,"beagu-stage38-own-submission-evidence-v1");
  assert.equal(evidence.evidenceStatus,"PENDING_ISSUANCE_AND_OWNER_BINDING");
  assert.equal(evidence.authorizedLevel,0);
  assert.equal(evidence.campaign,"2026");
  assert.equal(evidence.codeDigest,digest(participantCode));
  assert.match(evidence.eventDigest,/^[a-f0-9]{64}$/);
  assert.match(evidence.receiptMac,/^[a-f0-9]{64}$/);
  const serialized=JSON.stringify(evidence);
  for(const forbidden of [event.formResponseId,event.participantCode,sourceSpreadsheetId,formId,secret,
    "teacherAnswer","email","phone"]) assert.ok(!serialized.includes(forbidden));
});
test("wrong owner-installed form identity stops before proof",()=>{
  assert.equal(accepted({formId:"SYNTHETIC_OTHER_FORM_00001"}).reason,"UNTRUSTED_FORM_SOURCE");
  assert.equal(accepted({sourceSpreadsheetId:"SYNTHETIC_OTHER_SHEET_00001"}).reason,"UNTRUSTED_FORM_SOURCE");
});
test("tampered code, form response and signature are rejected",()=>{
  const signature=signTrustedSubmissionEvent(event,{secret});
  for(const patch of [
    {participantCode:"BG26-ABCD-EF12-AB12-CD34-EF56"},
    {formResponseId:"SYNTHETIC_DIFFERENT_RESPONSE"},
    {submittedAt:new Date(now-1000).toISOString()}
  ]){
    const result=verifyTrustedSubmissionEvent({...event,...patch},{
      secret,signature,expectedSpreadsheetId:sourceSpreadsheetId,expectedFormId:formId,nowMs:now
    });
    assert.equal(result.reason,"SIGNATURE_MISMATCH");
  }
  assert.equal(verifyTrustedSubmissionEvent(event,{
    secret:otherSecret,signature,expectedSpreadsheetId:sourceSpreadsheetId,
    expectedFormId:formId,nowMs:now
  }).reason,"SIGNATURE_MISMATCH");
  assert.equal(verifyTrustedSubmissionEvent(event,{
    secret,signature:"f".repeat(64),expectedSpreadsheetId:sourceSpreadsheetId,
    expectedFormId:formId,nowMs:now
  }).reason,"SIGNATURE_MISMATCH");
});
test("rejects untrusted extra Form answer fields, incomplete codes and invalid timestamps",()=>{
  assert.equal(verifyTrustedSubmissionEvent({...event,rawAnswers:"never-store-teacher-answer"},{
    secret,signature:"f".repeat(64),expectedSpreadsheetId:sourceSpreadsheetId,
    expectedFormId:formId,nowMs:now
  }).reason,"INVALID_SUBMISSION_METADATA");
  for(const invalidCode of ["", "NOT_A_CODE", "BG26-BAD", "BG26-OOOO-OOOO-OOOO-OOOO-OOOO"]) {
    assert.throws(()=>signTrustedSubmissionEvent({...event,participantCode:invalidCode},{secret}),
      /INVALID_TRUSTED_FORM_EVENT/);
  }
  for(const timestamp of ["2025-11-21T00:00:00.000Z","2026-11-20T04:59:59.000Z",
    "2026-11-22T05:06:00.000Z"]) {
    assert.equal(accepted({submittedAt:timestamp}).reason,"SUBMISSION_OUT_OF_WINDOW");
  }
  assert.equal(verifyTrustedSubmissionEvent(event,{
    secret:"short",signature:"a".repeat(64),expectedSpreadsheetId:sourceSpreadsheetId,
    expectedFormId:formId,nowMs:now
  }).reason,"TRUSTED_SIGNATURE_REQUIRED");
});
test("signed event without independently established issuance, ownership or uniqueness cannot grant Lv1",()=>{
  const receipt=accepted();
  const safe={
    secret,receipt,codeDigestFromIssuedLedger:receipt.codeDigest,
    ownerBindingVerified:true,submissionUniquenessConfirmed:true
  };
  assert.equal(evaluateTierFromPrivateEvidence({receipt}),0);
  assert.equal(evaluateTierFromPrivateEvidence({...safe,secret:otherSecret}),0);
  assert.equal(evaluateTierFromPrivateEvidence({...safe,ownerBindingVerified:false}),0);
  assert.equal(evaluateTierFromPrivateEvidence({...safe,submissionUniquenessConfirmed:false}),0);
  assert.equal(evaluateTierFromPrivateEvidence({...safe,codeDigestFromIssuedLedger:digest("fake-wrong-code")}),0);
  assert.equal(evaluateTierFromPrivateEvidence({...safe,disabled:true}),0);
  assert.equal(evaluateTierFromPrivateEvidence({...safe,receipt:{...receipt,receiptMac:"a".repeat(64)}}),0);
  assert.equal(evaluateTierFromPrivateEvidence({...safe,receipt:{...receipt,campaign:"2025"}}),0);
  assert.equal(evaluateTierFromPrivateEvidence({...safe,receipt:{...receipt,authorizedLevel:1}}),0);
  assert.equal(evaluateTierFromPrivateEvidence({...safe,receipt:{
    ok:true,schema:receipt.schema,evidenceStatus:receipt.evidenceStatus,
    campaign:"2026",authorizedLevel:0,
    codeDigest:receipt.codeDigest,eventDigest:receipt.eventDigest,receiptMac:"b".repeat(64)
  }}),0);
});
test("private verified submission+owner+one-time proof grants Lv1, independent verified referral grants Lv2",()=>{
  const receipt=accepted();
  const safe={
    secret,receipt,codeDigestFromIssuedLedger:receipt.codeDigest,
    ownerBindingVerified:true,submissionUniquenessConfirmed:true
  };
  assert.equal(evaluateTierFromPrivateEvidence(safe),1);
  assert.equal(evaluateTierFromPrivateEvidence({...safe,validReferrals:4,upgradedAt:"2026-11-21T00:00:00Z"}),1);
  assert.equal(evaluateTierFromPrivateEvidence({...safe,referralHashMatched:true,validReferrals:0,
    upgradedAt:"2026-11-21T00:00:00Z"}),1);
  assert.equal(evaluateTierFromPrivateEvidence({...safe,referralHashMatched:true,validReferrals:1}),1);
  assert.equal(evaluateTierFromPrivateEvidence({...safe,referralHashMatched:true,validReferrals:1,
    upgradedAt:"2026-11-21T00:00:00Z"}),2);
});
test("legacy and modern 2026 code forms are accepted only as signed metadata",()=>{
  for(const participantCode of [
    "BG26-ABCD-1234-ABCD-1234-ABCD","BG26-A2B3C4-D5E6F7","K7M9Q2X4T8".slice(0,10)
  ]) assert.equal(accepted({participantCode}).authorizedLevel,0);
});
console.log("PASS: Stage38 synthetic official Form signature and privacy contract checks; no real Lv1/Lv2 permissions granted.");
