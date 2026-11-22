"use strict";
// 014: offline, reproducible arrangement from rights-tagged original melody events.
// This is a preview/export tool, NOT the live score's runtime engine.
const fs=require("node:fs"),crypto=require("node:crypto");
const PPQ=480,GRID=120,VERSION="schoolband-rock-arranger-v1.0.0";
const PARTS=["melody","drums","bass","guitar","keys"];
const DEMOS=new Set(["original-shining-our-school","original-meter-shift-exercise-014"]);
const GAIN=Object.freeze({master:.80,melody:.96,drums:.44,bass:.48,guitar:.40,keys:.37,playerHit:.80});
class ArrangementError extends Error {constructor(message){super(message);this.name="ArrangementError"}}
function need(ok,msg){if(!ok)throw new ArrangementError(msg)}
function num(x,min,max){return Number.isFinite(x)&&x>=min&&x<=max}
function rightsGate(source){
 const r=source?.rights;
 need(r&&typeof r==="object"&&typeof source.songId==="string","rights_required");
 need(r.sourceId===source.songId,"rights_song_mismatch");
 need(r.publicRelease===false,"direct_public_release_blocked");
 need(Array.isArray(r.scopes)&&r.scopes.includes("convert_to_game"),"conversion_scope_required");
 if(r.status==="demo_original")need(DEMOS.has(source.songId),"unknown_demo_source");
 else if(r.status==="approved"){
  // Stage022: user-supplied approval flags/record IDs are NOT independent proof.
  // External songs are quarantined until a separate trusted-record integration.
  throw new ArrangementError("external_requires_stage022_trusted_registry");
 }else throw new ArrangementError("unapproved_source");
 return {sourceId:r.sourceId,status:r.status,publicRelease:false,scope:"convert_to_game"};
}
const rounded=x=>Math.round(x*1e8)/1e8;
function makeTimeline(spec){
 need(spec&&spec.ticksPerQuarter===PPQ,"unsupported_ppq");
 need(Number.isInteger(spec.barCount)&&spec.barCount>=2&&spec.barCount<=32,"invalid_bar_count");
 const meters=spec.meters,tempos=spec.tempos;
 need(Array.isArray(meters)&&meters.length>0&&meters.length<=32,"missing_meters");
 need(Array.isArray(tempos)&&tempos.length>0&&tempos.length<=128,"missing_tempos");
 need(meters[0].bar===0&&tempos[0].tick===0,"initial_meter_and_tempo_required");
 let previous=-1;
 for(const m of meters){
  need(Number.isInteger(m.bar)&&m.bar>previous&&m.bar<spec.barCount,"meter_not_sorted");
  need(Number.isInteger(m.numerator)&&m.numerator>=2&&m.numerator<=9&&[2,4,8].includes(m.denominator),"invalid_meter");
  need((PPQ*4*m.numerator/m.denominator)%GRID===0,"meter_not_16th_quantizable");
  previous=m.bar;
 }
 const bars=[],meterByBar=[];let current=meters[0],mi=0,tick=0;
 for(let bar=0;bar<spec.barCount;bar++){
  if(mi+1<meters.length&&meters[mi+1].bar===bar)current=meters[++mi];
  const length=PPQ*4*current.numerator/current.denominator;
  bars.push({bar,startTick:tick,endTick:tick+length,lengthTicks:length,
   numerator:current.numerator,denominator:current.denominator});
  meterByBar.push(current);tick+=length;
 }
 const totalTicks=tick;previous=-1;
 for(const t of tempos){
  need(Number.isInteger(t.tick)&&t.tick>previous&&t.tick<totalTicks&&t.tick%GRID===0,"tempo_not_sorted_or_grid");
  need(num(t.bpm,40,220),"invalid_bpm");previous=t.tick;
 }
 const tempoSegments=[];let startSeconds=0;
 for(let i=0;i<tempos.length;i++){
  const t=tempos[i],nextTick=i+1<tempos.length?tempos[i+1].tick:totalTicks;
  tempoSegments.push({tick:t.tick,endTick:nextTick,bpm:t.bpm,startSeconds:rounded(startSeconds)});
  startSeconds+=(nextTick-t.tick)/PPQ*60/t.bpm;
 }
 function tickSeconds(at){
  need(Number.isInteger(at)&&at>=0&&at<=totalTicks,"tick_out_of_bounds");
  let s=tempoSegments[0];
  for(const seg of tempoSegments){if(seg.tick<=at)s=seg;else break}
  return s.startSeconds+(at-s.tick)/PPQ*60/s.bpm;
 }
 function barForTick(at){
  need(Number.isInteger(at)&&at>=0&&at<totalTicks,"event_outside_bars");
  return bars.find(b=>at>=b.startTick&&at<b.endTick);
 }
 // All events should use tickSeconds; never multiply bar count by one global BEAT.
 return {spec,meters,tempos,tempoSegments,bars,totalTicks,totalSeconds:rounded(tickSeconds(totalTicks)),
  tickSeconds,barForTick};
}
function chordAt(harmony,bar){
 const c=harmony[bar];
 need(c&&Number.isInteger(c.rootMidi)&&c.rootMidi>=24&&c.rootMidi<=84,"missing_or_invalid_harmony_"+bar);
 need(["major","minor"].includes(c.quality),"unsupported_harmony_quality_"+bar);
 return {bar,rootMidi:c.rootMidi,quality:c.quality,symbol:c.symbol||"",
  pcs:[c.rootMidi%12,(c.rootMidi+(c.quality==="minor"?3:4))%12,(c.rootMidi+7)%12]};
}
function canonicalMelody(source,timeline){
 const notes=source.melody;need(Array.isArray(notes)&&notes.length>0&&notes.length<=1024,"invalid_melody");
 let previousEnd=0,offbeat=0;
 return notes.map((n,i)=>{
  need(Number.isInteger(n.startTick)&&Number.isInteger(n.durationTicks)&&
   n.startTick>=0&&n.durationTicks>=GRID&&n.startTick%GRID===0&&n.durationTicks%GRID===0,
   "invalid_melody_grid_"+i);
  need(n.startTick>=previousEnd&&n.startTick+n.durationTicks<=timeline.totalTicks,"overlapping_or_out_of_song_melody_"+i);
  need(Number.isInteger(n.pitch)&&n.pitch>=36&&n.pitch<=96,"unsupported_melody_pitch_"+i);
  need(Number.isInteger(n.velocity)&&n.velocity>=1&&n.velocity<=127,"invalid_melody_velocity_"+i);
  const bar=timeline.barForTick(n.startTick),local=n.startTick-bar.startTick;
  if(local%PPQ!==0)offbeat++;
  previousEnd=n.startTick+n.durationTicks;
  return {part:"melody",bar:bar.bar,pitch:n.pitch,startTick:n.startTick,durationTicks:n.durationTicks,
   startSeconds:rounded(timeline.tickSeconds(n.startTick)),
   endSeconds:rounded(timeline.tickSeconds(n.startTick+n.durationTicks)),
   velocity:n.velocity,accent:local===0?"strong":local%PPQ===0?"beat":"syncopated",humanizeMs:0,
   playbackSeconds:rounded(timeline.tickSeconds(n.startTick))};
 });
}
function hashInt(songId,seed,part,tick,pitch){
 const h=crypto.createHash("sha256").update(songId+"|"+seed+"|"+part+"|"+tick+"|"+pitch).digest();
 return h.readUInt16BE(0);
}
function arrange(source,{seed=14014}={}){
 const rights=rightsGate(source);
 need(Number.isSafeInteger(seed)&&seed>=0&&seed<=9999999,"invalid_arrangement_seed");
 const clock=makeTimeline(source.timeline),harmony=source.harmony;
 need(Array.isArray(harmony)&&harmony.length===clock.bars.length,"harmony_bar_count_mismatch");
 const chords=clock.bars.map(b=>chordAt(harmony,b.bar));
 const melody=canonicalMelody(source,clock);
 const out={melody,drums:[],bass:[],guitar:[],keys:[]};
 function accentAt(bar,tick){
  const local=tick-bar.startTick;
  if(local===0)return "strong";
  if(bar.denominator===8&&bar.numerator%3===0){
   // 6/8 accents each dotted quarter: the intervening eighths remain weak
   // even when their offset happens to be a quarter-note multiple.
   return local%(PPQ*1.5)===0?"group":"syncopated";
  }
  if(local%PPQ===0)return "beat";
  return "syncopated";
 }
 function add(part,bar,tick,duration,pitch,{role="",velocity=78}={}){
  need(part!=="melody"&&Number.isInteger(tick)&&tick%GRID===0&&
   Number.isInteger(duration)&&duration%GRID===0&&duration>0&&
   tick>=bar.startTick&&tick+duration<=bar.endTick,"invalid_accompaniment_event");
  need(Number.isInteger(pitch)&&pitch>=0&&pitch<=127,"invalid_accompaniment_pitch");
  const category=accentAt(bar,tick);
  const perturbation=hashInt(source.songId,seed,part,tick,pitch)%9-4; // +/-4ms, deterministic
  const humanizeMs=tick===0?0:perturbation;
  const startSeconds=clock.tickSeconds(tick),playbackSeconds=startSeconds+humanizeMs/1000;
  const strength={strong:1.00,group:.90,beat:.82,syncopated:.69}[category];
  const vel=Math.max(1,Math.min(127,Math.round(velocity*strength)));
  out[part].push({part,bar:bar.bar,role,pitch,startTick:tick,durationTicks:duration,
   startSeconds:rounded(startSeconds),endSeconds:rounded(clock.tickSeconds(tick+duration)),
   playbackSeconds:rounded(Math.max(0,playbackSeconds)),humanizeMs,velocity:vel,accent:category});
 }
 for(const bar of clock.bars){
  const c=chords[bar.bar],root=c.rootMidi,third=root+(c.quality==="minor"?3:4),fifth=root+7;
  const len=bar.lengthTicks,base=bar.startTick;
  // Drums: hats on eighths. Compound meter 6/8 uses a dotted-quarter 0/3-group kick/snare feel.
  for(let offset=0;offset<len;offset+=PPQ/2){
   add("drums",bar,base+offset,GRID,42,{role:"closed-hihat",velocity:72});
  }
  if(bar.numerator===6&&bar.denominator===8){
   add("drums",bar,base,GRID,36,{role:"kick",velocity:102});
   add("drums",bar,base+len/2,GRID,38,{role:"snare",velocity:94});
  }else{
   add("drums",bar,base,GRID,36,{role:"kick",velocity:102});
   for(let offset=PPQ;offset<len;offset+=PPQ*2){
    add("drums",bar,base+offset,GRID,38,{role:"snare",velocity:92});
   }
  }
  // Bass: chord tones only. At non-compound bar endings, add a late eighth-note pickup.
  const bassBeat=bar.denominator===8&&bar.numerator%3===0?PPQ*1.5:PPQ;
  for(let offset=0;offset<len;offset+=bassBeat){
   add("bass",bar,base+offset,Math.min(GRID*2,len-offset),offset===0?root-12:fifth-12,
    {role:offset===0?"root":"fifth",velocity:87});
  }
  if(bar.bar%2===1&&len>=PPQ*2){
   add("bass",bar,bar.endTick-PPQ/2,PPQ/2,root-12,{role:"syncopated-pickup",velocity:73});
  }
  // Guitar: power fifth on strong beats; occasional 8th offbeat muted pick, never a wrong major third.
  add("guitar",bar,base,GRID*2,root+12,{role:"power-root",velocity:86});
  add("guitar",bar,base,GRID*2,fifth+12,{role:"power-fifth",velocity:78});
  const upOffset=bar.denominator===8?PPQ:PPQ*1.5;
  if(upOffset+GRID<=len){
   add("guitar",bar,base+upOffset,GRID,fifth+12,{role:"offbeat-upstroke",velocity:74});
  }
  // Keys: tonic-third-fifth triad, with correct minor third (e.g. Am -> C natural).
  const sustain=Math.min(PPQ*2,len);
  add("keys",bar,base,sustain,root+12,{role:"chord-root",velocity:66});
  add("keys",bar,base,sustain,third+12,{role:"chord-third",velocity:65});
  add("keys",bar,base,sustain,fifth+12,{role:"chord-fifth",velocity:63});
 }
 for(const id of PARTS)out[id].sort((a,b)=>a.startTick-b.startTick||a.pitch-b.pitch||a.role.localeCompare(b.role));
 const result={schemaVersion:1,arrangerVersion:VERSION,songId:source.songId,
  rights,timing:{ppq:PPQ,gridTicks:GRID,barCount:clock.bars.length,totalTicks:clock.totalTicks,
   totalSeconds:clock.totalSeconds,meters:clock.meters,tempos:clock.tempos,bars:clock.bars,
   segments:clock.tempoSegments},
  harmony:chords.map(c=>({bar:c.bar,symbol:c.symbol,rootMidi:c.rootMidi,quality:c.quality})),
  mixing:{...GAIN,accentRules:{strong:1,group:.90,beat:.82,syncopated:.69},
   noteHumanizationMs:{min:-4,max:4,seed}},
  parts:PARTS.map(id=>({id,role:id==="melody"?"preserved_original":"generated_preview",
    events:out[id]}))};
 const audit=auditArrangement(result);
 need(audit.valid,"arrangement_harmony_invalid:"+audit.errors.join("|"));
 result.quality={...audit,seed,reproducible:true};
 result.sha256=crypto.createHash("sha256").update(JSON.stringify(result)).digest("hex");
 return result;
}
function auditArrangement(obj){
 const errors=[],partMap=Object.fromEntries((obj.parts||[]).map(p=>[p.id,p.events]));
 if(Object.keys(partMap).length!==5)errors.push("missing_instrument");
 for(const p of ["bass","guitar","keys"]){
  for(const n of partMap[p]||[]){
   const chord=obj.harmony[n.bar],third=chord.rootMidi+(chord.quality==="minor"?3:4);
   const permitted=[chord.rootMidi%12,third%12,(chord.rootMidi+7)%12];
   if(!permitted.includes(n.pitch%12))errors.push("harmonic_collision:"+p+":bar_"+n.bar+":pitch_"+n.pitch);
  }
 }
 for(const [part,notes]of Object.entries(partMap)){
  if(!Array.isArray(notes)||notes.length===0)errors.push("empty_part:"+part);
  for(const n of notes||[]){
   if(!(Number.isInteger(n.startTick)&&n.startTick>=0&&n.startTick<obj.timing.totalTicks &&
     Number.isFinite(n.playbackSeconds)&&n.playbackSeconds>=0&&
     Number.isInteger(n.velocity)&&n.velocity>=1&&n.velocity<=127))errors.push("invalid_event:"+part);
   if(part==="melody"&&n.humanizeMs!==0)errors.push("melody_shifted");
  }
 }
 const drums=partMap.drums||[];
 let highhat=0,hatBackbeats=0;
 for(const n of drums){if(n.role==="closed-hihat")highhat++;if(n.role==="snare")hatBackbeats++;}
 if(highhat<=0||hatBackbeats<=0)errors.push("drum_rhythm_incomplete");
 return {valid:errors.length===0,errors,metrics:{
  eventCounts:Object.fromEntries(PARTS.map(p=>[p,(partMap[p]||[]).length])),
  syncopatedEvents:Object.fromEntries(PARTS.map(p=>[p,(partMap[p]||[]).filter(n=>n.accent==="syncopated").length])),
  humanizedEvents:Object.fromEntries(PARTS.map(p=>[p,(partMap[p]||[]).filter(n=>n.humanizeMs!==0).length])),
  compoundBars:obj.timing.bars.filter(b=>b.numerator%3===0&&b.denominator===8).length,
  tempoChanges:obj.timing.tempos.length-1,meterChanges:obj.timing.meters.length-1
 }};
}
function fromStage013(doc){
 need(doc?.standard==="schoolband-music-events-v1"&&doc?.timing?.ticksPerQuarter===PPQ,"invalid_stage013_doc");
 need(Array.isArray(doc.harmony)&&doc.harmony.length===doc.timing.barCount,"legacy_harmony_missing");
 return {songId:doc.songId,rights:doc.rights,
  timeline:{ticksPerQuarter:PPQ,barCount:doc.timing.barCount,
   meters:[{bar:0,numerator:doc.timing.beatsPerBar,denominator:doc.timing.beatType}],
   tempos:[{tick:0,bpm:doc.timing.bpm}]},
  harmony:doc.harmony.map(x=>({symbol:x.symbol,rootMidi:x.rootMidi,quality:x.minor?"minor":"major"})),
  melody:doc.parts.find(p=>p.id==="melody").events.map(x=>({
   startTick:x.startTick,durationTicks:x.durationTicks,pitch:x.pitch,velocity:x.velocity}))};
}
function exportArrangement(input,outputPath,seed=14014){
 const doc=arrange(input,{seed});
 need(typeof outputPath==="string"&&outputPath.trim(),"missing_output_path");
 fs.writeFileSync(outputPath,JSON.stringify(doc,null,2)+"\n");return doc;
}
module.exports={PPQ,GRID,VERSION,ArrangementError,rightsGate,makeTimeline,canonicalMelody,
 arrange,auditArrangement,fromStage013,exportArrangement};
if(require.main===module){
 const args=process.argv.slice(2),cfg={};
 for(let i=0;i<args.length;i+=2)cfg[args[i]]=args[i+1];
 try{
  need(typeof cfg["--input"]==="string"&&typeof cfg["--output"]==="string","input_output_required");
  const x=JSON.parse(fs.readFileSync(cfg["--input"],"utf8"));
  const input=x.standard==="schoolband-music-events-v1"?fromStage013(x):x;
  const out=exportArrangement(input,cfg["--output"],cfg["--seed"]===undefined?14014:Number(cfg["--seed"]));
  console.log(JSON.stringify({song:out.songId,hash:out.sha256,parts:out.quality.metrics.eventCounts,
   seconds:out.timing.totalSeconds,tempoChanges:out.quality.metrics.tempoChanges,
   meterChanges:out.quality.metrics.meterChanges}));
 }catch(e){console.error("ARRANGEMENT_REJECTED: "+e.message);process.exitCode=1}
}
