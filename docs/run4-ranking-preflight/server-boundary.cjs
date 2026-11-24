"use strict";
// Review-only, dependency-injected server boundary. NOT a deployed API.
// Never accept an authoritative score, timestamp or verification flag from the caller.
const fail=(code)=>{const e=new Error(code);e.code=code;throw e;};
const idOk=id=>typeof id==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
function createBoundary({policy,authenticate,resolveSchool,store,replayVerifier=null,now=Date.now,newId,seed}){
 const tiers=new Set(["easy","normal","hard","very_hard","extreme"]);
 const requireActor=async credentials=>{
  const actor=await authenticate(credentials);
  if(!actor||!Number.isInteger(actor.level)||actor.level<1||typeof actor.hash!=="string"||!(/^[0-9a-f]{64}$/i.test(actor.hash)))fail("unauthorized");
  if(actor.admin)fail("admin_excluded");
  return actor;
 };
 function requireVerifier(){if(typeof replayVerifier!=="function")fail("verification_unavailable");}
 async function start({credentials,schoolId}={}){
  const actor=await requireActor(credentials);requireVerifier();
  if(typeof schoolId!=="string"||!/^[A-Z0-9]{7}$/.test(schoolId))fail("invalid_school");
  const school=await resolveSchool(schoolId);if(!school?.eligible||!tiers.has(school.difficulty))fail("school_ineligible");
  const session={id:newId(),version:"4.0",actorHash:actor.hash,schoolId,difficulty:school.difficulty,startedAt:now(),seed:seed()};
  if(!idOk(session.id)||!Number.isInteger(session.seed)||session.seed<0||session.seed>4294967295)fail("server_config");
  // The repository must enforce the per-actor rate limit atomically.
  if(!await store.createIfBelowLimit(session,{windowMs:900000,max:40}))fail("rate_limited");
  return {game:policy.game,version:session.version,session:session.id,difficulty:session.difficulty,seed:session.seed};
 }
 async function submit({credentials,sessionId,replay}={}){
  const actor=await requireActor(credentials);requireVerifier();
  if(!idOk(sessionId)||!Array.isArray(replay)||replay.length>12000)fail("invalid_replay");
  try{require("./replay-protocol.cjs").validateReplay(replay);}catch(_){fail("invalid_replay");}
  const session=await store.get(sessionId);
  if(!session||session.actorHash!==actor.hash||session.version!=="4.0"||session.submitted)fail("session_expired");
  const elapsed=(now()-session.startedAt)/1000;
  if(!Number.isFinite(elapsed)||elapsed<1||elapsed>3600)fail("invalid_time");
  const school=await resolveSchool(session.schoolId);
  if(!school?.eligible||school.difficulty!==session.difficulty)fail("school_ineligible");
  // The trusted, server-owned simulator computes the result, not the request.
  if(typeof store.claimAttempt==="function"&&!await store.claimAttempt(session))fail("rate_limited");
  const calculated=await replayVerifier({seed:session.seed,difficulty:session.difficulty,replay,elapsed});
  if(!calculated)fail("invalid_replay");
  const result=policy.validate(calculated,elapsed,session.difficulty);
  // Repository must atomically insert by unique session ID. No check-then-write race.
  if(!await store.insertVerifiedOnce(session,result))fail("session_expired");
  return {game:policy.game,version:"4.0",score:result.score,retired:result.victory,bossCount:result.bossIds.length};
 }
 return Object.freeze({start,submit});
}
module.exports={createBoundary};
