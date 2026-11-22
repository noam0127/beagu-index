import assert from "node:assert/strict";
import test from "node:test";
import {createHash,createHmac} from "node:crypto";
import {
  deriveStableEnrollmentLookup,isActiveEnrollmentFromPrivateLedger,
  signVersionedTrustedSubmissionEvent,verifyVersionedTrustedSubmissionEvent
} from "../scripts/release-manager/stage38-form-submission-evidence.mjs";

// All synthetic fixtures. No connection to any real Google Form, Supabase,
// live users, production server keys, external API, or actual membership DB.
const code="K7M9Q2X4T8";
const otherCode="J7M9Q2X4T8";
const lookupSecret="ST38-UNUSED-PRODUCTION-LOOKUP-SECRET-256BIT-FIXTURE-X";
const lookupSecret2="ST38-SECOND-FAKE-LOOKUP-SECRET-256BIT-FIXTURE-2";
const oldSigner="ST38-OLD-FORM-SIGNER-TEST-SECRET-NOT-DEPLOYED-X";
const newSigner="ST38-NEW-FORM-SIGNER-TEST-SECRET-NOT-DEPLOYED-Z";
const lookupKeyId="enroll2026a";
const now=Date.parse("2026-11-22T05:00:00.000Z");
const event={
  sourceSpreadsheetId:"ST38_SYNTHETIC_SPREADSHEET_00001",
  formId:"ST38_SYNTHETIC_GOOGLE_FORM_00001",
  formResponseId:"ST38_SYNTHETIC_RESPONSE_00001",
  submittedAt:new Date(now-5000).toISOString(),
  participantCode:code
};
const firstKeyring={activeKeyId:"formsig1",keys:{
  formsig1:{secret:oldSigner,status:"active"}
}};
const rotatingKeyring={activeKeyId:"formsig2",keys:{
  formsig1:{secret:oldSigner,status:"verify-only",verifyUntilMs:now+5000},
  formsig2:{secret:newSigner,status:"active"}
}};
const retiredKeyring={activeKeyId:"formsig2",keys:{
  formsig1:{secret:oldSigner,status:"revoked"},
  formsig2:{secret:newSigner,status:"active"}
}};
const opts={lookupSecret,lookupKeyId};
const lookup=deriveStableEnrollmentLookup(code,opts);
const validLedger=()=>({
  ...lookup,
  proofState:"claimed",
  evidenceOrigin:"official-signed-form",
  ownerBindingState:"verified",
  active:true,
  revokedAt:null
});
const eligible=(presented=code,ledgerRow=validLedger(),extra={})=>
  isActiveEnrollmentFromPrivateLedger(presented,{...opts,ledgerRow,...extra});

test("stable enrollment HMAC has no raw code and never equals plain SHA-256",()=>{
  assert.deepEqual(Object.keys(lookup).sort(),
    ["campaign","codeLookupDigest","lookupKeyId"]);
  assert.equal(lookup.campaign,"2026");
  assert.equal(lookup.lookupKeyId,lookupKeyId);
  assert.match(lookup.codeLookupDigest,/^[a-f0-9]{64}$/);
  assert.notEqual(lookup.codeLookupDigest,createHash("sha256").update(code).digest("hex"));
  assert.notEqual(lookup.codeLookupDigest,
    createHmac("sha256",oldSigner).update(code).digest("hex"));
  const output=JSON.stringify(lookup);
  for (const raw of [code,lookupSecret,oldSigner,newSigner,event.formResponseId])
    assert.ok(!output.includes(raw));
});

test("callback key rotation and its eventual revocation do not change durable enrollment lookup",()=>{
  const oldEnvelope=signVersionedTrustedSubmissionEvent(event,{
    keyring:firstKeyring,nowMs:now
  });
  const newEnvelope=signVersionedTrustedSubmissionEvent(event,{
    keyring:rotatingKeyring,nowMs:now
  });
  const source={expectedSpreadsheetId:event.sourceSpreadsheetId,
    expectedFormId:event.formId,nowMs:now};
  const oldReceipt=verifyVersionedTrustedSubmissionEvent(event,{
    ...source,keyring:rotatingKeyring,envelope:oldEnvelope
  });
  const newReceipt=verifyVersionedTrustedSubmissionEvent(event,{
    ...source,keyring:rotatingKeyring,envelope:newEnvelope
  });
  assert.equal(oldReceipt.ok,true);
  assert.equal(newReceipt.ok,true);
  assert.notEqual(oldReceipt.codeDigest,newReceipt.codeDigest);
  assert.notEqual(oldReceipt.codeDigest,lookup.codeLookupDigest);
  assert.notEqual(newReceipt.codeDigest,lookup.codeLookupDigest);
  assert.equal(eligible(),true);
  const afterRetirement=verifyVersionedTrustedSubmissionEvent(event,{
    ...source,keyring:retiredKeyring,envelope:oldEnvelope
  });
  assert.equal(afterRetirement.reason,"UNTRUSTED_OR_RETIRED_KEY");
  assert.equal(eligible(),true,"Previously established active enrollment survives routine signer retirement");
  assert.deepEqual(deriveStableEnrollmentLookup(code,opts),lookup);
});

test("only claimed, owner-verified, active official-Form enrollment qualifies",()=>{
  assert.equal(eligible(),true);
  for(const change of [
    {proofState:"issued"},
    {proofState:"pending"},
    {evidenceOrigin:"challenge-code-only"},
    {evidenceOrigin:"referral-click"},
    {ownerBindingState:"pending"},
    {ownerBindingState:"unverified"},
    {active:false},
    {revokedAt:"2026-11-22T04:00:00Z"},
    {revokedAt:undefined},
    {campaign:"2025"},
    {lookupKeyId:"enroll2026b"}
  ]){
    assert.equal(eligible(code,{...validLedger(),...change}),false,
      "Invalid membership state may not resume: "+JSON.stringify(change));
  }
  assert.equal(eligible(code,{}),false);
  assert.equal(eligible(code,null),false);
});

test("wrong code, wrong digest, key mismatch, unsupported formats fail closed",()=>{
  assert.equal(eligible(otherCode),false);
  assert.equal(eligible("BG26-BAD"),false);
  assert.equal(eligible(""),false);
  assert.equal(eligible(null),false);
  assert.equal(eligible(code,{...validLedger(),codeLookupDigest:"f".repeat(64)}),false);
  assert.equal(eligible(code,{...validLedger(),codeLookupDigest:"NOT_A_MAC"}),false);
  assert.equal(eligible(code,validLedger(),{lookupSecret:lookupSecret2}),false);
  assert.equal(eligible(code,validLedger(),{lookupKeyId:"enroll2026b"}),false);
  assert.equal(eligible(code,validLedger(),{lookupSecret:"short"}),false);
  assert.equal(eligible(code,validLedger(),{lookupSecret:oldSigner}),false);
  assert.equal(eligible(code,validLedger(),{lookupSecret:null}),false);
});

test("invalid settings reject enrollment derivation without a digest",()=>{
  for(const input of [
    {participantCode:"NOT-A-CODE",options:opts},
    {participantCode:code,options:{...opts,lookupSecret:"short"}},
    {participantCode:code,options:{lookupSecret}},
    {participantCode:code,options:{...opts,lookupKeyId:"INVALID KEY"}},
    {participantCode:code,options:{...opts,lookupKeyId:""}},
    {participantCode:null,options:opts},
    {participantCode:code,options:null}
  ]){
    assert.throws(()=>deriveStableEnrollmentLookup(input.participantCode,input.options),
      /INVALID_ENROLLMENT_LOOKUP_INPUT|Cannot destructure/);
  }
});

test("lookup key rotation is a separate explicit migration; never silent fallback",()=>{
  const withNewKey=deriveStableEnrollmentLookup(code,{
    lookupSecret:lookupSecret2,lookupKeyId:"enroll2026b"
  });
  assert.notEqual(lookup.codeLookupDigest,withNewKey.codeLookupDigest);
  assert.equal(eligible(code,{...validLedger(),...withNewKey}),false);
  const actualNewKeyConfig={
    lookupSecret:lookupSecret2,lookupKeyId:"enroll2026b"
  };
  assert.equal(eligible(code,{...validLedger(),...withNewKey},actualNewKeyConfig),true);
  assert.equal(eligible(code,validLedger(),actualNewKeyConfig),false);
});

test("reference lookup does not authorize or create a session",()=>{
  const derived=deriveStableEnrollmentLookup(code,opts);
  assert.ok(!Object.hasOwn(derived,"authorizedLevel"));
  assert.ok(!Object.hasOwn(derived,"sessionToken"));
  assert.ok(!Object.hasOwn(derived,"accessLevel"));
  assert.equal(isActiveEnrollmentFromPrivateLedger(code,{...opts}),false);
  assert.equal(isActiveEnrollmentFromPrivateLedger(code,{...opts,ledgerRow:derived}),false);
  // A caller must independently verify possession, rate limits and current
  // server-side policy. The pure function never mutates a database.
  assert.equal(eligible(),true);
  assert.equal(eligible(),true);
  assert.equal(eligible(),true);
});
console.log("PASS: Stage38 stable enrollment lookup independent from Form callback signer rotation; revocation and unsafe proof fail closed.");
