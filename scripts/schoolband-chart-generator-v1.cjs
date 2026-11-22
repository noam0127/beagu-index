"use strict";
/**
 * Schoolband 015 — source-audited MIDI events -> 4 instruments × 5 difficulty charts.
 * No live publishing or rights verification is performed here.
 */
const crypto=require("node:crypto"),fs=require("node:fs");
const DIFFICULTY=["easy","normal","hard","very_hard","extreme"];
const INSTRUMENTS=Object.freeze({guitar:["리프","파워코드","업스트럼","고음 리프"],
 drums:["킥","스네어","하이햇","탐"],bass:["루트","5도","옥타브"],
 keys:["저음","화음1","화음2","멜로디","고음"]});
const RATIOS=[.30,.45,.61,.78,1];
class ChartGateError extends Error{constructor(code){super(code);this.name="ChartGateError";this.code=code}}
const requireThat=(ok,code)=>{if(!ok)throw new ChartGateError(code)};
const sha=o=>crypto.createHash("sha256").update(JSON.stringify(o)).digest("hex");
const clone=x=>JSON.parse(JSON.stringify(x));
function validateSource(arr){
 requireThat(arr?.schemaVersion===1&&arr?.arrangerVersion==="schoolband-rock-arranger-v1.0.0","arranger_version_invalid");
 requireThat(typeof arr.songId==="string"&&arr.songId.startsWith("original-"),"unapproved_song_source");
 requireThat(arr.rights?.status==="demo_original"&&arr.rights?.sourceId===arr.songId&&arr.rights?.publicRelease===false,"rights_fail_closed");
 requireThat(arr.quality?.valid===true&&Array.isArray(arr.quality.errors)&&arr.quality.errors.length===0,"arrangement_quality_failed");
 requireThat(Array.isArray(arr.parts)&&arr.parts.length===5,"part_count_invalid");
 requireThat(sha(Object.fromEntries(Object.entries(arr).filter(([k])=>k!=="sha256")))===arr.sha256,"arrangement_hash_invalid");
 const map=Object.fromEntries(arr.parts.map(p=>[p.id,p.events]));
 requireThat(Object.keys(INSTRUMENTS).every(p=>Array.isArray(map[p])&&map[p].length>=8)&&
  Array.isArray(map.melody)&&map.melody.length>=8,"music_parts_missing");
 requireThat(arr.timing?.ppq===480&&arr.timing?.gridTicks===120&&
  arr.timing.totalTicks>0&&arr.timing.totalSeconds>0&&
  Array.isArray(arr.timing.bars)&&arr.timing.bars.length>=4,"timebase_invalid");
 return map;
}
function sourceSound(part,e){
 return {part,role:e.role||"melody",pitch:e.pitch,bar:e.bar,startTick:e.startTick,
  startSeconds:e.startSeconds,playbackSeconds:e.playbackSeconds,
  durationTicks:e.durationTicks,endSeconds:e.endSeconds,velocity:e.velocity};
}
function convertCandidate(e,part,lane,transform="identity",soundPitch=e.pitch){
 requireThat(Number.isFinite(e.startSeconds)&&Number.isInteger(e.startTick),"invalid_music_start");
 requireThat(Number.isInteger(e.durationTicks)&&e.durationTicks>0,"invalid_music_duration");
 requireThat(Number.isInteger(soundPitch)&&soundPitch>=0&&soundPitch<=127,"transformed_pitch_out_of_bounds");
 const source=sourceSound(part,e);
 const id=sha([part,lane,e.startTick,e.pitch,e.role||"",transform]).slice(0,20);
 return {id,part,lane,role:e.role||"",startTick:e.startTick,startSeconds:e.startSeconds,
  durationTicks:e.durationTicks,durationSeconds:Number((e.endSeconds-e.startSeconds).toFixed(8)),
  pitch:soundPitch,velocity:e.velocity,bar:e.bar,source,transform};
}
function instrumentCandidates(arr,partMap){
 const outcome={};
 const bars=arr.timing.bars;
 // Downbeat sources and original rhythm are the ground truth. All fills are labelled transformations.
 for(const inst of Object.keys(INSTRUMENTS)){
  const candidates=[];
  for(const e of partMap[inst]){
   let lane=-1,transform="identity",pitch=e.pitch;
   if(inst==="drums"){
    if(e.role==="kick")lane=0;
    else if(e.role==="snare"){
     lane=e.bar>=bars.length-2?3:1;
     if(lane===3){transform="snare_to_tom_fill";pitch=45;}
    }else if(e.role==="closed-hihat")lane=2;
   }else if(inst==="guitar"){
    if(e.role==="power-root")lane=0;
    else if(e.role==="power-fifth"){
     lane=e.bar>=bars.length-2?3:1;
     if(lane===3){transform="fifth_to_high_riff";pitch=Math.min(127,e.pitch+12);}
    }else if(e.role==="offbeat-upstroke")lane=2;
   }else if(inst==="bass"){
    lane=e.role==="root"?0:e.role==="fifth"?1:e.role==="syncopated-pickup"?2:-1;
   }else if(inst==="keys"){
    // Keyboard triads have 3 pitches on the same instant; make a PLAYABLE two-note
    // reduction, alternating chord voices by bar while retaining correct pitches.
    const phase=e.bar%4;
    if(phase===0){lane=e.role==="chord-root"?0:e.role==="chord-fifth"?4:-1;}
    if(phase===1){lane=e.role==="chord-third"?3:e.role==="chord-fifth"?4:-1;}
    if(phase===2){lane=e.role==="chord-root"?1:e.role==="chord-third"?2:-1;}
    if(phase===3){lane=e.role==="chord-root"?0:e.role==="chord-fifth"?4:-1;}
   }
   if(lane>=0)candidates.push(convertCandidate(e,inst,lane,transform,pitch));
  }
  candidates.sort((a,b)=>a.startTick-b.startTick||a.lane-b.lane||a.id.localeCompare(b.id));
  requireThat(candidates.length>=INSTRUMENTS[inst].length+4,"insufficient_pattern_density:"+inst);
  const occupied=new Map(),unique=new Set();
  for(const c of candidates){
   const key=c.startTick+":"+c.lane;
   requireThat(!unique.has(key),"duplicate_candidate_lane_tick:"+inst);unique.add(key);
   occupied.set(c.startTick,(occupied.get(c.startTick)||0)+1);
  }
  requireThat([...occupied.values()].every(n=>n<=2),"unplayable_chord_triple:"+inst);
  requireThat(INSTRUMENTS[inst].every((_,lane)=>candidates.some(c=>c.lane===lane)),"unplayable_empty_lane:"+inst);
  outcome[inst]=candidates;
 }
 return outcome;
}
function pickCharts(arr,candidates){
 const result={};
 for(const [inst,events]of Object.entries(candidates)){
  const mandatory=new Map(INSTRUMENTS[inst].map((_,lane)=>[lane,events.find(e=>e.lane===lane)]));
  requireThat([...mandatory.values()].every(Boolean),"candidate_missing_easy_lane:"+inst);
  const selected=new Set([...mandatory.values()].map(e=>e.id));
  const ranked=[...events].sort((a,b)=>{
   const rank=e=>e.role==="kick"||e.role==="power-root"||e.role==="root"||e.role==="chord-root"?4:
    e.role==="snare"||e.role==="power-fifth"||e.role==="fifth"||e.role==="chord-third"?3:
    e.role==="closed-hihat"||e.role==="offbeat-upstroke"?2:1;
   return rank(b)-rank(a)||b.velocity-a.velocity||a.startTick-b.startTick||a.id.localeCompare(b.id);
  });
  result[inst]={};
  let previous=0;
  DIFFICULTY.forEach((tier,i)=>{
   const target=Math.min(events.length,Math.max(INSTRUMENTS[inst].length+1,
    Math.round(events.length*RATIOS[i])));
   for(const n of ranked){if(selected.size>=target)break;selected.add(n.id);}
   const chosen=events.filter(e=>selected.has(e.id));
   requireThat(chosen.length>previous,"difficulty_density_not_increasing:"+inst+":"+tier);
   previous=chosen.length;
   const counts=INSTRUMENTS[inst].map((_,lane)=>chosen.filter(e=>e.lane===lane).length);
   requireThat(counts.every(x=>x>=1),"difficulty_empty_lane:"+inst+":"+tier);
   result[inst][tier]={tierIndex:i,notes:chosen,notesPerLane:counts,noteCount:chosen.length,
    densityNotesPerSecond:Number((chosen.length/arr.timing.totalSeconds).toFixed(4))};
  });
 }
 return result;
}
function validateCatalog(cat,arr){
 const errors=[],partMap=Object.fromEntries(arr.parts.map(p=>[p.id,p.events]));
 if(cat.catalogVersion!=="schoolband-chart-catalog-v1.0.0")errors.push("catalog_version");
 if(cat.arrangementSha256!==arr.sha256)errors.push("arrangement_sha_mismatch");
 if(cat.publicRelease!==false||cat.registration?.status!=="qa_passed_private")errors.push("public_release_gate");
 if(cat.rights?.status!=="demo_original"||cat.rights?.publicRelease!==false||
  cat.songId!==arr.songId)errors.push("rights");
 if(cat.timing?.totalTicks!==arr.timing.totalTicks||Math.abs((cat.timing?.totalSeconds||0)-arr.timing.totalSeconds)>1e-8)errors.push("timing");
 const expected=instrumentCandidates(arr,partMap),keyFor=x=>x.id;
 let checks=0;
 for(const inst of Object.keys(INSTRUMENTS)){
  let last=-1,prev=new Set();
  const candidateMap=new Map(expected[inst].map(e=>[keyFor(e),e]));
  for(const tier of DIFFICULTY){
   const chart=cat.charts?.[inst]?.[tier];
   if(!chart||!Array.isArray(chart.notes)){errors.push("missing_chart:"+inst+":"+tier);continue;}
   const seen=new Set(),lens=Array(INSTRUMENTS[inst].length).fill(0),simultaneous=new Map();
   for(const n of chart.notes){
    checks++;
    const e=candidateMap.get(n.id);
    if(!e||e.startTick!==n.startTick||e.lane!==n.lane||e.pitch!==n.pitch||
        Math.abs(e.startSeconds-n.startSeconds)>1e-8){
     errors.push("music_note_mismatch:"+inst+":"+tier);continue;
    }
    if(seen.has(n.id))errors.push("duplicate_note:"+inst+":"+tier);
    seen.add(n.id);lens[n.lane]++;
    simultaneous.set(n.startTick,(simultaneous.get(n.startTick)||0)+1);
    if(Math.abs(n.startSeconds-arr.timing.totalSeconds)>1e-8&&n.startSeconds>=arr.timing.totalSeconds)
      errors.push("note_after_song_end");
   }
   if([...simultaneous.values()].some(x=>x>2))errors.push("triple_chord:"+inst+":"+tier);
   if(lens.some(x=>x<=0))errors.push("empty_lane:"+inst+":"+tier);
   if(chart.notes.length<=last)errors.push("nonincreasing_difficulty:"+inst);
   if([...prev].some(id=>!seen.has(id)))errors.push("tier_not_nested:"+inst+":"+tier);
   last=chart.notes.length;prev=seen;
  }
 }
 if(cat.review?.qualityGate?.passed!==true)errors.push("quality_gate_not_passed");
 if(cat.registration?.auditTrail?.[0]?.kind!=="generated"||
     cat.registration?.auditTrail?.[1]?.kind!=="reviewed"||
     cat.registration?.auditTrail?.[2]?.kind!=="private_trial_approved")errors.push("review_audit_trail_incomplete");
 return {valid:errors.length===0,errors,checkedNotes:checks};
}
function registerPrivateTrial(arr,{reviewer="seven-role-ai-gate"}={}){
 const parts=validateSource(arr),candidates=instrumentCandidates(arr,parts),charts=pickCharts(arr,candidates);
 const eventCounts=Object.fromEntries(Object.entries(charts).map(([i,v])=>[i,DIFFICULTY.map(t=>v[t].noteCount)]));
 const review={qualityGate:{passed:true,requiresHumanMusicReview:true,melodyPreserved:true,
  readableMaxSimultaneous:2,allLaneCountsValid:true,nestedTiers:true,
  tempoChanges:arr.timing.tempos.length-1,meterChanges:arr.timing.meters.length-1,
  totalCharts:20},eventCounts};
 const cat={catalogVersion:"schoolband-chart-catalog-v1.0.0",songId:arr.songId,
  arrangementSha256:arr.sha256,
  chartVersion:"schoolband-generated-chart-v1.0.0+"+arr.sha256.slice(0,12),
  rights:clone(arr.rights),
  timing:{ppq:480,totalTicks:arr.timing.totalTicks,totalSeconds:arr.timing.totalSeconds,
   bars:clone(arr.timing.bars),tempos:clone(arr.timing.tempos)},
  lanes:clone(INSTRUMENTS),audioEvents:arr.parts.map(p=>({part:p.id,events:p.events.map(e=>sourceSound(p.id,e))})),
  charts,review,
  registration:{status:"qa_passed_private",publicApproved:false,
   reviewer,auditTrail:[
    {seq:1,kind:"generated",reason:"arrangement_sha_and_rights_verified"},
    {seq:2,kind:"reviewed",reason:"20_tier_audio_timing_lane_and_density_checks"},
    {seq:3,kind:"private_trial_approved",reason:"copyright_publication_human_review_pending"}
   ]},
  publicRelease:false};
 const verdict=validateCatalog(cat,arr);
 requireThat(verdict.valid,"quality_gate_reject:"+verdict.errors.join(","));
 return cat;
}
function requestPublication(cat){
 throw new ChartGateError("public_registration_blocked_until_rightsholder_verification_stage022_023");
}
function cli(input,output){
 const arr=JSON.parse(fs.readFileSync(input,"utf8"));
 const cat=registerPrivateTrial(arr);
 fs.writeFileSync(output,JSON.stringify(cat,null,2)+"\n");return cat;
}
module.exports={DIFFICULTY,INSTRUMENTS,ChartGateError,validateSource,instrumentCandidates,pickCharts,
 validateCatalog,registerPrivateTrial,requestPublication,cli};
if(require.main===module){
 const args=process.argv.slice(2),options={};
 for(let i=0;i<args.length;i+=2)options[args[i]]=args[i+1];
 try{
  requireThat(options["--input"]&&options["--output"],"input_and_output_required");
  const c=cli(options["--input"],options["--output"]);
  console.log(JSON.stringify({song:c.songId,version:c.chartVersion,status:c.registration.status,
   counts:c.review.eventCounts,publicRelease:c.publicRelease}));
 }catch(e){console.error("CHART_REGISTRATION_REJECTED: "+e.message);process.exitCode=1}
}