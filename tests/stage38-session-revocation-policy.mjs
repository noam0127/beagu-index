import assert from "node:assert/strict";
import test from "node:test";
import { effective2026ProtectedTier } from "../scripts/release-manager/stage38-session-revocation-policy.mjs";

// Synthetic-only fixtures. The caller in a real system must obtain these
// records from *server-side* token/session and enrollment DB queries, never
// from JSON submitted by the browser. This test has no DB/network connection.
const now=Date.parse("2026-11-22T06:00:00.000Z");
const digest="a".repeat(64);
const visitorId="00000000-0000-4000-8000-000000000003";
const session=()=>({
  schema:"stage38-2026-private-session-v1",
  bearerTokenVerified:true,
  campaign:"2026",lookupKeyId:"enroll2026a",codeLookupDigest:digest,
  accessLevel:1,createdAt:new Date(now-60000).toISOString(),
  expiresAt:new Date(now+3600000).toISOString()
});
const enrollment=()=>({
  schema:"stage38-2026-private-enrollment-v1",
  campaign:"2026",lookupKeyId:"enroll2026a",codeLookupDigest:digest,
  accessLevel:1,proofState:"claimed",
  evidenceOrigin:"official-signed-form",ownerBindingState:"verified",
  active:true,revokedAt:null
});
const tier=(sessionRow=session(),ledgerRow=enrollment(),extra={})=>
  effective2026ProtectedTier({
    session:sessionRow,privateEnrollment:ledgerRow,nowMs:now,...extra
  });

test("server-verified unexpired Lv1 session and active proof grant Lv1 only",()=>{
  assert.equal(tier(),1);
  assert.equal(tier(session(),{...enrollment(),accessLevel:2}),1,
    "Old Lv1 token may not auto-escalate following code promotion");
  assert.equal(tier(session(),enrollment(),{earnedLv2Verified:true}),1);
  assert.equal(tier(session(),enrollment(),{earnedLv2Verified:"true"}),1);
});

test("revocation takes effect even when original six-hour session is unexpired",()=>{
  const activeSession=session();
  assert.equal(tier(activeSession,enrollment()),1);
  assert.equal(tier(activeSession,{...enrollment(),active:false}),0);
  assert.equal(tier(activeSession,{
    ...enrollment(),revokedAt:"2026-11-22T05:55:00.000Z"
  }),0);
  assert.equal(tier(activeSession,{...enrollment(),revokedAt:undefined}),0);
});

test("unsigned/unknown/mismatched session can never reuse trusted enrollment",()=>{
  for(const x of [
    {...session(),bearerTokenVerified:false},
    {...session(),bearerTokenVerified:undefined},
    {...session(),codeLookupDigest:"b".repeat(64)},
    {...session(),codeLookupDigest:"INVALID"},
    {...session(),lookupKeyId:"enroll2026b"},
    {...session(),campaign:"2025"},
    {...session(),schema:"untrusted-client-claim"},
    {...session(),accessLevel:3},
    {...session(),accessLevel:0}
  ])assert.equal(tier(x),0);
  assert.equal(tier(null,enrollment()),0);
  assert.equal(tier({},enrollment()),0);
});

test("unverified, issued-only and alternate Form proof are insufficient",()=>{
  for(const changed of [
    {proofState:"issued"},{proofState:"pending"},
    {evidenceOrigin:"challenge-code-only"},
    {evidenceOrigin:"referral-click"},
    {ownerBindingState:"pending"},
    {ownerBindingState:"unverified"},
    {lookupKeyId:"enroll2026b"},
    {codeLookupDigest:"b".repeat(64)},
    {codeLookupDigest:"BAD"},
    {campaign:"2025"},
    {schema:"unknown-privacy-contract"},
    {accessLevel:0},{accessLevel:3}
  ])assert.equal(tier(session(),{...enrollment(),...changed}),0);
  assert.equal(tier(session(),null),0);
});

test("expired, future and excessive-duration sessions fail closed",()=>{
  const valid=session();
  const iso=t=>new Date(t).toISOString();
  for(const changed of [
    {expiresAt:iso(now)},
    {expiresAt:iso(now-1000)},
    {createdAt:iso(now+1000)},
    {createdAt:iso(now-7*3600000),expiresAt:iso(now+1)},
    {createdAt:iso(now-1000),expiresAt:iso(now+6*3600000)},
    {createdAt:iso(now),expiresAt:iso(now)},
    {createdAt:"2026-11-22 06:00:00"},
    {expiresAt:"invalid"},{expiresAt:null}
  ])assert.equal(tier({...valid,...changed}),0,
    "Invalid session time: "+JSON.stringify(changed));
  assert.equal(tier(valid,enrollment(),{nowMs:Infinity}),0);
  assert.equal(tier(valid,enrollment(),{nowMs:0}),0);
});

test("Lv2 access requires current earned referral and bound visitor identity",()=>{
  const s={...session(),accessLevel:2,identityVisitorId:visitorId};
  const e={...enrollment(),accessLevel:2,identityVisitorId:visitorId};
  assert.equal(tier(s,e),0);
  assert.equal(tier(s,e,{earnedLv2Verified:false}),0);
  assert.equal(tier(s,e,{earnedLv2Verified:true}),2);
  assert.equal(tier(s,e,{earnedLv2Verified:"true"}),0);
  assert.equal(tier(s,{...e,identityVisitorId:"00000000-0000-4000-8000-000000000004"},
    {earnedLv2Verified:true}),0);
  assert.equal(tier({...s,identityVisitorId:"INVALID"},e,{earnedLv2Verified:true}),0);
  assert.equal(tier({...s,identityVisitorId:null},e,{earnedLv2Verified:true}),0);
  assert.equal(tier(s,{...e,active:false},{earnedLv2Verified:true}),0);
  assert.equal(tier(s,{...e,accessLevel:1},{earnedLv2Verified:true}),0);
});

test("repeated protected reads do not alter private enrollment or session",()=>{
  const s=session(),e=enrollment(),before=JSON.stringify([s,e]);
  for(let i=0;i<5;i++)assert.equal(tier(s,e),1);
  assert.equal(JSON.stringify([s,e]),before);
  assert.equal(effective2026ProtectedTier(),0);
});

console.log("PASS: 2026 protected session: code revocation, expiry, downgrade, earned-Lv2 revalidation, ownership and private-DB binding.");
