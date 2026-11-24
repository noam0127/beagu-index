/* Staged 4.0 record policy. No network access, no legacy score write. */
(function(root){
 "use strict";
 const version="4.0",game="teacher_run_retirement_v4";
 const tiers=Object.freeze({easy:10,normal:15,hard:20,very_hard:22,extreme:24});
 const bossWindows=Object.freeze({confusion:20,demands:65,responsibility:115,burnout:165,final:185});
 const fields=new Set(["version","game","difficulty","baseScore","score","survivalSeconds","age","victory","bossIds","maxCombo","hits","crises","leaveDays","allies"]);
 const int=(v,min,max)=>Number.isInteger(v)&&v>=min&&v<=max;
 function score(base,tier,win){if(!Object.hasOwn(tiers,tier)||!int(base,0,Math.floor(Number.MAX_SAFE_INTEGER/48))||typeof win!=="boolean")throw Error("invalid_score");return Math.floor(base*tiers[tier]*(win?2:1)/10);}
 function validate(result,elapsed,expectedTier){
  if(!result||typeof result!=="object"||Array.isArray(result)||Object.keys(result).some(k=>!fields.has(k)))throw Error("invalid_fields");
  const r=result,s=r.survivalSeconds;
  if(r.game!==game||r.version!==version||r.difficulty!==expectedTier||!Object.hasOwn(tiers,expectedTier))throw Error("invalid_version");
  if(!Number.isFinite(elapsed)||elapsed<0||elapsed>3600||!int(s,0,190)||s>Math.floor(elapsed)+1)throw Error("invalid_time");
  if(typeof r.victory!=="boolean"||r.victory!==(s===190)||r.age!==24+Math.floor(s/5))throw Error("invalid_outcome");
  if(!int(r.baseScore,0,Math.min(200000,4000+s*1000))||r.score!==score(r.baseScore,r.difficulty,r.victory))throw Error("invalid_score");
  if(!Array.isArray(r.bossIds)||r.bossIds.length>5||new Set(r.bossIds).size!==r.bossIds.length||r.bossIds.some(id=>typeof id!=="string"||!Object.hasOwn(bossWindows,id)||bossWindows[id]>s))throw Error("invalid_bosses");
  const possibleDays=[0];for(const [at,days] of [[25,3],[50,5],[100,7]])if(s>=at)possibleDays.push(...possibleDays.slice().map(n=>n+days));
  if(!possibleDays.includes(r.leaveDays)||!int(r.maxCombo,0,Math.floor(s*10))||!int(r.hits,0,Math.floor(s*10))||!int(r.crises,0,4)||!int(r.allies,0,6))throw Error("invalid_stats");
  return Object.freeze({version,game,difficulty:r.difficulty,baseScore:r.baseScore,score:r.score,survivalSeconds:s,age:r.age,victory:r.victory,bossIds:r.bossIds.slice(),maxCombo:r.maxCombo,hits:r.hits,crises:r.crises,leaveDays:r.leaveDays,allies:r.allies});
 }
 // This check rejects impossible summaries; it is not proof of actual gameplay.
 // No client-supplied boolean can convert a local record into an official one.
 function localRecord(r){return validate(r,r.survivalSeconds,r.difficulty);}
 const storageKey="beaguRun4LocalRecordsV1";
 function list(storage,{difficulty="all",outcome="all",limit=50}={}){
  try{
   const raw=JSON.parse(storage.getItem(storageKey)||"[]");
   if(!Array.isArray(raw))return [];
   return raw.slice(0,50).flatMap(r=>{try{return [localRecord(r)]}catch(_){return [];}})
    .filter(r=>(difficulty==="all"||r.difficulty===difficulty)&&(outcome==="all"||(outcome==="retired"&&r.victory)||(outcome==="all_bosses"&&r.bossIds.length===5)))
    .sort((a,b)=>b.score-a.score).slice(0,Math.max(0,Math.min(50,Number(limit)||0)));
  }catch(_){return [];}
 }
 function save(storage,r){const record=localRecord(r);const records=[record,...list(storage)].sort((a,b)=>b.score-a.score).slice(0,50);storage.setItem(storageKey,JSON.stringify(records));return record;}
 root.BeaguRun4Records=Object.freeze({version,game,score,validate,localRecord,storageKey,list,save});
})(typeof window!=="undefined"?window:globalThis);
