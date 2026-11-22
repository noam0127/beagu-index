"use strict";
/**
 * Stage023: immutable queue for privately tested, rights-reviewed song data.
 * This module has no network, no external permission-request route, no audio,
 * and NO endpoint/action to publish a real-school anthem.
 */
const EVENTS=Object.freeze({
 submit:{none:"pending"},
 start_review:{pending:"reviewing"},
 approve_private:{reviewing:"private_ready"},
 reject:{pending:"rejected",reviewing:"rejected",private_ready:"rejected"},
 release_trial:{private_ready:"trial_available"},
 withdraw:{pending:"withdrawn",reviewing:"withdrawn",private_ready:"withdrawn",trial_available:"withdrawn",rejected:"withdrawn"}
});
const STAGES=new Set(["pending","reviewing","private_ready","trial_available","rejected","withdrawn"]);
const ORIGINAL_LIVE_ID="original-shining-our-school";
const ORIGINAL_LIVE_CHART="creative-anthem-rhythm-v1.0.0";
class QueueError extends Error {constructor(code){super(code);this.name="QueueError";this.code=code;}}
function need(b,code){if(!b)throw new QueueError(code);}
function sha(s){return typeof s==="string"&&/^[0-9a-f]{40}$/.test(s);}
function isTrustedOriginal(rec,rightsRegistry){
 if(!rec||rec.kind!=="original_internal"||rec.school_id!==null||!sha(rec.source_sha))return false;
 if(!rightsRegistry||rightsRegistry.policy!=="deny_by_default"||rightsRegistry.public_release_enabled!==false)return false;
 const matches=rightsRegistry.records?.filter(x=>x.song_id===rec.song_id)||[];
 if(matches.length!==1)return false;
 const m=matches[0];
 return m.school_id===null&&m.review_state==="approved_internal"&&m.source_git_blob_sha1===rec.source_sha&&
  m.public_approved===false&&m.components?.composition==="original_owned"&&
  Array.isArray(m.scopes)&&m.scopes.includes("internal_playtest");
}
function advance(record,event,registry,date="2026-11-23"){
 need(record&&typeof record==="object"&&!Array.isArray(record),"invalid_record");
 need(typeof date==="string"&&/^\\d{4}-\\d{2}-\\d{2}$/.test(date),"invalid_event_date");
 const from=record.stage||"none",to=EVENTS[event]?.[from];
 need(!!to,"invalid_state_transition");
 // Only an independent, pre-existing offline trust record may enter private/chart-ready states.
 if(event==="approve_private"||event==="release_trial"){
  need(isTrustedOriginal(record,registry),"trusted_original_required");
  need(record.review?.data_checked===true,"data_review_required");
 }
 if(event==="release_trial"){
  need(record.song_id===ORIGINAL_LIVE_ID&&record.chart_id===ORIGINAL_LIVE_CHART&&
   record.review?.approved_for_trial===true,"embedded_original_only");
 }
 const nextAudit=[...(Array.isArray(record.audit)?record.audit:[]),{
  seq:(Array.isArray(record.audit)?record.audit.length:0)+1,event,date
 }];
 return {...record,stage:to,audit:nextAudit};
}
function replayAudit(rec,registry){
 need(Array.isArray(rec.audit)&&rec.audit.length>0&&rec.audit.length<=50,"audit_missing");
 let state={...rec,stage:"none",audit:[]};
 for(const [i,item] of rec.audit.entries()){
  need(item&&item.seq===i+1&&typeof item.event==="string","audit_sequence_invalid");
  state=advance(state,item.event,registry,item.date);
 }
 need(state.stage===rec.stage,"stage_audit_mismatch");
 return state.stage;
}
function validateQueue(queue,registry){
 need(queue?.schema_version===1&&queue.scope==="playtest_only"&&
  queue.rights_requests_enabled===false&&queue.billing_enabled===false&&
  queue.listen_testing_enabled===false&&Array.isArray(queue.records),"invalid_queue");
 const seen=new Set();
 for(const rec of queue.records){
  need(typeof rec.song_id==="string"&&!seen.has(rec.song_id),"duplicate_song_id");
  seen.add(rec.song_id);
  need(STAGES.has(rec.stage),"unknown_stage");
  need(rec.kind==="original_internal"&&rec.school_id===null,
   "external_school_song_not_enabled");
  need(isTrustedOriginal(rec,registry),"source_not_trusted");
  replayAudit(rec,registry);
 }
 return {valid:true,count:seen.size,schoolAnthemCount:0,trialSongs:queue.records.filter(r=>r.stage==="trial_available").map(r=>r.song_id)};
}
function resolvePlaytestSong(queue,registry,schoolId,requestedSong){
 validateQueue(queue,registry);
 // No real-school anthem has a reviewed, supported runtime chart in this version.
 // Even a synthetic external approved record NEVER becomes the built-in original.
 if(requestedSong==="anthem")return {song:"volleyball",reason:"real_school_chart_unavailable",requestedSchoolId:schoolId??null,schoolAnthemPlayable:false};
 const primary=queue.records.find(r=>r.song_id===ORIGINAL_LIVE_ID);
 if(primary&&primary.stage==="trial_available"&&isTrustedOriginal(primary,registry)&&
   primary.chart_id===ORIGINAL_LIVE_CHART){
  return {song:"volleyball",songId:ORIGINAL_LIVE_ID,reason:"original_trial_available",schoolAnthemPlayable:false};
 }
 return {song:null,reason:"no_available_original_song",schoolAnthemPlayable:false};
}
module.exports={EVENTS,QueueError,isTrustedOriginal,advance,replayAudit,validateQueue,resolvePlaytestSong};
