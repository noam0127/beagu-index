/* Official ranking client; disabled until an explicitly approved deployment. */
(function(root){
"use strict";
const defaultConfig=Object.freeze({enabled:false,endpoint:"https://snvzwrexuqavnfvzgxqj.supabase.co/functions/v1/run4-official"});
const tiers=new Set(["easy","normal","hard","very_hard","extreme"]);
function create({config=defaultConfig,fetcher=fetch,getToken=()=>sessionStorage.getItem("beagu-level-session-v1"),getAdminBearer=async()=>null}={}){
 const enabled=config.enabled===true;
 async function call(data){
  if(!enabled)throw Error("verification_unavailable");
  const token=getToken();if(!/^[a-f0-9]{64}$/.test(token||""))throw Error("unauthorized");
  const url=new URL(config.endpoint);if(url.protocol!=="https:"||url.hostname!=="snvzwrexuqavnfvzgxqj.supabase.co"||url.pathname!=="/functions/v1/run4-official"||url.search||url.hash||url.username||url.password||url.port)throw Error("invalid_endpoint");
  const bearer=await getAdminBearer(),headers={"content-type":"application/json","x-beagu-session":token};
  if(bearer)headers.authorization=bearer;
  const response=await fetcher(url.href,{method:"POST",headers,body:JSON.stringify(data),redirect:"error",cache:"no-store",signal:AbortSignal.timeout(30000)});
  const result=await response.json();if(!response.ok)throw Error(result?.error||"verification_unavailable");
  return result;
 }
 async function start(school){
  const v=await call({action:"start",schoolId:school.school_id});
  if(v.game!=="teacher_run_retirement_v4"||v.version!=="4.0"||!(/^[a-f0-9-]{36}$/i.test(v.session||""))||!tiers.has(v.difficulty)||v.difficulty!==school.difficulty||!Number.isInteger(v.seed)||v.seed<0||v.seed>4294967295)throw Error("invalid_session");
  return v;
 }
 async function submit(session,envelope){
  if(!session||envelope.seed!==session.seed||envelope.difficulty!==session.difficulty||!Array.isArray(envelope.events))throw Error("invalid_session");
  const v=await call({action:"submit",sessionId:session.session,replay:envelope.events});
  if(v.game!=="teacher_run_retirement_v4"||v.version!=="4.0"||!Number.isInteger(v.score)||v.score<0||typeof v.retired!=="boolean"||!Number.isInteger(v.bossCount)||v.bossCount<0||v.bossCount>5)throw Error("invalid_result");
  return v;
 }
 async function list(difficulty,outcome){const v=await call({action:"list",difficulty,outcome});if(v.game!=="teacher_run_retirement_v4"||v.version!=="4.0"||!Array.isArray(v.records))throw Error("invalid_result");return v.records.slice(0,10);}
 return Object.freeze({enabled,start,submit,list});
}
root.BeaguRun4Official=Object.freeze({create,defaultConfig});
})(typeof window!=="undefined"?window:globalThis);
