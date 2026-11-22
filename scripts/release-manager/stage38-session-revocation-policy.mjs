import { timingSafeEqual } from "node:crypto";

// REVIEW-ONLY server-side reference contract. Not connected to Supabase/Deno.
// Never consume any fields below directly from client JSON: the session must
// be fetched by an authenticated bearer-token digest lookup from the private
// server database and the enrollment by the server from its private ledger.
// No user data, Form answers or live secrets are accessed here.
const DIGEST=/^[0-9a-f]{64}$/;
const KEY_ID=/^[a-z][a-z0-9_-]{1,31}$/;
const VISITOR_UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_SESSION_AGE_MS=6*60*60*1000;

function isoMillis(value) {
  if(typeof value!=="string")return null;
  const ms=Date.parse(value);
  if(!Number.isFinite(ms) || new Date(ms).toISOString()!==value)return null;
  return ms;
}
function equalDigests(left,right) {
  if(!DIGEST.test(left??"")||!DIGEST.test(right??""))return false;
  return timingSafeEqual(Buffer.from(left,"hex"),Buffer.from(right,"hex"));
}
function isTier(value){return Number.isSafeInteger(value)&&(value===1||value===2);}

// Return a tier number only for a verified, ACTIVE private 2026 session.
// A missing/invalid or revoked code returns 0, regardless of unexpired token.
// In particular: if an Lv2 referral profile is disabled after a session was
// minted, access is immediately denied on the next protected request.
// Authentication at a real endpoint additionally needs input-size limits,
// server query/RLS safety, rate limits and auditing.
export function effective2026ProtectedTier({
  session,privateEnrollment,nowMs=Date.now(),earnedLv2Verified=false
}={}) {
  if(!Number.isSafeInteger(nowMs)||nowMs<=0 ||
      !session||typeof session!=="object"||Array.isArray(session)||
      !privateEnrollment||typeof privateEnrollment!=="object"||
      Array.isArray(privateEnrollment)||
      session.schema!=="stage38-2026-private-session-v1"||
      privateEnrollment.schema!=="stage38-2026-private-enrollment-v1"||
      session.bearerTokenVerified!==true||
      session.campaign!=="2026"||privateEnrollment.campaign!=="2026"||
      typeof session.lookupKeyId!=="string"||
      !KEY_ID.test(session.lookupKeyId)||
      session.lookupKeyId!==privateEnrollment.lookupKeyId||
      !equalDigests(session.codeLookupDigest,privateEnrollment.codeLookupDigest)||
      !isTier(session.accessLevel)||!isTier(privateEnrollment.accessLevel)||
      session.accessLevel>privateEnrollment.accessLevel||
      privateEnrollment.proofState!=="claimed"||
      privateEnrollment.evidenceOrigin!=="official-signed-form"||
      privateEnrollment.ownerBindingState!=="verified"||
      privateEnrollment.active!==true||
      privateEnrollment.revokedAt!==null)
    return 0;

  const createdAt=isoMillis(session.createdAt);
  const expiresAt=isoMillis(session.expiresAt);
  if(createdAt===null||expiresAt===null||
      createdAt>nowMs||expiresAt<=nowMs||
      expiresAt<=createdAt||expiresAt-createdAt>MAX_SESSION_AGE_MS)
    return 0;

  // Lv1 must not silently gain Lv2 after an old session is issued.
  if(session.accessLevel===1)return 1;

  // Lv2 always verifies the *current* earned referral status, not a cached
  // token claim; a checked-in visitor alone is insufficient.
  if(earnedLv2Verified!==true||
      !VISITOR_UUID.test(session.identityVisitorId??"")||
      !VISITOR_UUID.test(privateEnrollment.identityVisitorId??"")||
      session.identityVisitorId!==privateEnrollment.identityVisitorId)
    return 0;
  return 2;
}
