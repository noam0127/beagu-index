#!/usr/bin/env node
"use strict";
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict"),crypto=require("node:crypto"),cp=require("node:child_process");
const ROOT=path.resolve(__dirname,"..");
const EVENTS=JSON.parse(fs.readFileSync(path.join(ROOT,"games/nangam-schoolband-v08/charts/original-anthem.music-events.v1.json"),"utf8"));
const COMPLEX=JSON.parse(fs.readFileSync(path.join(ROOT,"games/nangam-schoolband-v08/charts/original-variable-meter-exercise.input.v1.json"),"utf8"));
const ENGINE=require("./schoolband-rock-arranger-v1.cjs"),OUT=path.join(ROOT,"artifacts/schoolband-stage014");
fs.mkdirSync(OUT,{recursive:true});
const REPORT={stage:"014/030",contractVersion:ENGINE.VERSION,unit:{},browser:[],limitations:[
 "Both inputs are internally authored fictional demonstration compositions; real school song permission and publication require separate verification (022-023).",
 "The Stage013 MIDI/MusicXML input parser remains deliberately limited to fixed 4/4 and tempo. Stage014 accepts validated variable-meter/tempo normalized event JSON directly; it does not yet import such complexity from external files.",
 "This stage produces preview arrangements, not 20 playable game charts. Mapping music events into note lanes and publication gates remains Stage015.",
 "OfflineAudioContext stress tests estimate digital sample peak, not physical speaker loudness or human music appraisal."
]};
const save=()=>fs.writeFileSync(path.join(OUT,"results.json"),JSON.stringify(REPORT,null,2)+"\n");
const clone=x=>JSON.parse(JSON.stringify(x));
function reject(label,fn,match){
 assert.throws(fn,e=>e instanceof ENGINE.ArrangementError&&(!match||e.message.includes(match)),label);
}
function checkTempoIndependent(spec,at){
 const t=spec.timeline.tempos;let seconds=0;
 for(let i=0;i<t.length;i++){
  const start=t[i].tick,end=i+1<t.length?t[i+1].tick:Infinity;
  if(at<=start)break;
  const segment=Math.min(at,end)-start;
  seconds+=segment/480*60/t[i].bpm;
  if(at<=end)break;
 }
 return seconds;
}
function originalProof(){
 const input=ENGINE.fromStage013(EVENTS),a=ENGINE.arrange(input,{seed:14014}),b=ENGINE.arrange(input,{seed:14014});
 assert.deepEqual(a,b,"identical seed/input must produce byte-for-byte reproducible arrangement");
 assert.equal(a.sha256,crypto.createHash("sha256").update(JSON.stringify({...a,sha256:undefined})).digest("hex"),
  "canonical SHA should equal JSON with sha256 absent");
 assert.equal(a.timing.totalTicks,15360);
 assert(Math.abs(a.timing.totalSeconds-32*60/108)<1e-7);
 assert.equal(a.quality.metrics.tempoChanges,0);
 assert.equal(a.quality.metrics.meterChanges,0);
 assert.deepEqual(a.timing.bars.map(x=>x.lengthTicks),Array(8).fill(1920));
 assert.equal(a.rights.publicRelease,false);
 assert.deepEqual(a.quality.metrics.eventCounts,{melody:28,drums:88,bass:36,guitar:24,keys:24});
 const ml=a.parts.find(x=>x.id==="melody").events;
 const src=input.melody;
 for(let i=0;i<src.length;i++){
  assert.equal(ml[i].startTick,src[i].startTick);
  assert.equal(ml[i].durationTicks,src[i].durationTicks);
  assert.equal(ml[i].pitch,src[i].pitch);
  assert.equal(ml[i].velocity,src[i].velocity);
  assert.equal(ml[i].humanizeMs,0);
 }
 assert(a.quality.valid);
 fs.writeFileSync(path.join(OUT,"original-anthem.rock-arranged.json"),JSON.stringify(a,null,2)+"\n");
 return {source:input,arrangement:a};
}
function variedProof(){
 const a=ENGINE.arrange(COMPLEX,{seed:14014}),b=ENGINE.arrange(COMPLEX,{seed:14014});
 assert.deepEqual(a,b);
 assert(a.quality.valid);
 assert.deepEqual(a.timing.bars.map(x=>[x.numerator,x.denominator]),
  [[4,4],[4,4],[3,4],[3,4],[6,8],[6,8],[5,4],[4,4]]);
 assert.deepEqual(a.timing.bars.map(x=>x.startTick),[0,1920,3840,5280,6720,8160,9600,12000]);
 assert.equal(a.timing.totalTicks,13920);
 assert.equal(a.quality.metrics.tempoChanges,3);assert.equal(a.quality.metrics.meterChanges,4);
 assert.deepEqual(a.quality.metrics.eventCounts,{melody:28,drums:78,bass:31,guitar:24,keys:24});
 assert(a.quality.metrics.syncopatedEvents.melody>=8,"user melody syncopation must be preserved");
 assert(a.quality.metrics.syncopatedEvents.guitar>=8,"generated offbeat rhythm should exist");
 assert(a.quality.metrics.humanizedEvents.guitar>=8,"deterministic humanized note onset should exist");
 const c=ENGINE.makeTimeline(COMPLEX.timeline);
 const checkpoints=[0,120,1080,3840,6720,7080,7200,7440,9600,12000,13920];
 for(const tick of checkpoints){
  assert(Math.abs(c.tickSeconds(tick)-checkTempoIndependent(COMPLEX,tick))<1e-7,
   "tempo integration drift at "+tick);
 }
 // A sustained melody note straddles a tempo change at 7200: integrate both portions, not one BPM.
 const crossing=a.parts[0].events.find(n=>n.startTick===7080&&n.endSeconds>c.tickSeconds(7200));
 assert(crossing,"required note crossing tempo transition");
 const split=(120/480*60/126)+(240/480*60/92);
 assert(Math.abs((crossing.endSeconds-crossing.startSeconds)-split)<1e-7,
  "duration across 126->92 BPM change must integrate both tempo segments");
 const melody=a.parts[0].events;
 for(const [i,n]of COMPLEX.melody.entries()){
  const e=melody[i];assert.equal(e.startTick,n.startTick);assert.equal(e.pitch,n.pitch);
  assert.equal(e.durationTicks,n.durationTicks);assert.equal(e.velocity,n.velocity);
  assert.equal(e.humanizeMs,0);
  assert(Math.abs(e.startSeconds-checkTempoIndependent(COMPLEX,n.startTick))<1e-7);
  assert(Math.abs(e.endSeconds-checkTempoIndependent(COMPLEX,n.startTick+n.durationTicks))<1e-7);
 }
 for(const p of a.parts){
  for(const e of p.events){
   assert(Number.isFinite(e.playbackSeconds)&&e.playbackSeconds>=0);
   assert(Math.abs(e.humanizeMs)<=4);
   assert(e.velocity>=1&&e.velocity<=127);
  }
 }
 const sixEightSnare=a.parts[1].events.filter(n=>n.part==="drums"&&n.role==="snare"&&(n.bar===4||n.bar===5));
 assert.deepEqual(sixEightSnare.map(n=>n.startTick),[7440,8880]);
 const otherSeed=ENGINE.arrange(COMPLEX,{seed:14015});
 assert.notEqual(a.sha256,otherSeed.sha256,"different humanization seed should change arrangement hash");
 const m1=a.parts.find(p=>p.id==="melody").events,m2=otherSeed.parts.find(p=>p.id==="melody").events;
 assert.deepEqual(m1,m2,"seed must not move the original melody");
 const named=["drums","bass","guitar","keys"];
 for(const name of named){
  const x=a.parts.find(p=>p.id===name).events;
  const y=otherSeed.parts.find(p=>p.id===name).events;
  assert.deepEqual(x.map(n=>[n.startTick,n.durationTicks,n.pitch]),
   y.map(n=>[n.startTick,n.durationTicks,n.pitch]),"seed must change groove only");
 }
 // Generated harmony: major third for C/G/F, minor third for Am.
 for(const bar of [2,6]){
  const chord=a.harmony[bar];assert.equal(chord.quality,"minor");
  const third=a.parts.find(p=>p.id==="keys").events.find(n=>n.bar===bar&&n.role==="chord-third");
  assert.equal(third.pitch%12,(chord.rootMidi+3)%12,"minor third must be a natural C");
 }
 fs.writeFileSync(path.join(OUT,"variable-meter.rock-arranged.json"),JSON.stringify(a,null,2)+"\n");
 return {source:COMPLEX,arrangement:a,crossing:split,checkpoints};
}
function corruptCases(){
 const fault=[];
 const R=(label,x,msg)=>{reject(label,()=>ENGINE.arrange(x),msg);fault.push(label)};
 const base=COMPLEX;
 const x=()=>clone(base);
 let a=x();a.rights.status="withdrawn";R("withdrawn-rights",a,"unapproved");
 a=x();a.rights.publicRelease=true;R("public-release-without-approval",a,"direct_public");
 a=x();a.songId="real-unknown-school";a.rights.sourceId=a.songId;R("unapproved-demo-school",a,"unknown_demo");
 a=x();a.rights.scopes=["read_only"];R("no-arranging-scope",a,"conversion_scope");
 a=x();a.rights.sourceId="not-the-song";R("source-and-rights-disagree",a,"rights_song_mismatch");
 a=x();a.timeline.ticksPerQuarter=960;R("bad-ppq",a,"unsupported_ppq");
 a=x();a.timeline.meters[0].bar=1;R("missing-initial-meter",a,"initial_meter");
 a=x();a.timeline.meters[1].bar=0;R("unordered-meter-change",a,"meter_not_sorted");
 a=x();a.timeline.meters[2].denominator=3;R("unsupported-meter-denominator",a,"invalid_meter");
 a=x();a.timeline.tempos[0].tick=120;R("missing-initial-tempo",a,"initial_meter");
 a=x();a.timeline.tempos[1].tick=0;R("unordered-tempo-change",a,"tempo_not_sorted");
 a=x();a.timeline.tempos[1].bpm=0;R("invalid-tempo",a,"invalid_bpm");
 a=x();a.timeline.tempos[1].tick=3851;R("off-grid-tempo",a,"tempo_not_sorted");
 a=x();a.melody[1].startTick=a.melody[0].startTick+240;R("overlap-melody",a,"overlapping");
 a=x();a.melody[1].pitch=130;R("invalid-pitch",a,"unsupported_melody_pitch");
 a=x();a.melody[1].startTick=481;R("off-grid-melody",a,"invalid_melody_grid");
 a=x();a.melody.at(-1).durationTicks=9999;R("past-song-boundary",a,"overlapping_or_out");
 a=x();a.harmony[3].quality="diminished";R("unsupported-chord-quality",a,"unsupported_harmony_quality");
 a=x();a.harmony.pop();R("missing-harmony",a,"harmony_bar_count");
 a=x();a.harmony[0].rootMidi=0;R("harmonic-root-outside-range",a,"missing_or_invalid_harmony");
 reject("seed-out-of-range",()=>ENGINE.arrange(base,{seed:-1}),"invalid_arrangement_seed");
 fault.push("seed-out-of-range");
 const melodyLess=x();melodyLess.melody=[];R("missing-melody",melodyLess,"invalid_melody");
 const canonical=ENGINE.arrange(base);const firstBass=canonical.parts.find(p=>p.id==="bass").events[0];
 firstBass.pitch+=1;
 const audit=ENGINE.auditArrangement(canonical);
 assert.equal(audit.valid,false);assert(audit.errors.some(e=>e.startsWith("harmonic_collision:bass")));
 fault.push("injected-harmonic-collision");
 const mel=ENGINE.arrange(base);mel.parts[0].events[0].humanizeMs=2;
 assert(ENGINE.auditArrangement(mel).errors.includes("melody_shifted"));fault.push("detected-melody-shift");
 return fault;
}
function commandLine(){
 const src=path.join(ROOT,"games/nangam-schoolband-v08/charts/original-variable-meter-exercise.input.v1.json");
 const out=path.join(OUT,"cli-variable-meter.json");
 const cmd=cp.execFileSync(process.execPath,[path.join(ROOT,"scripts/schoolband-rock-arranger-v1.cjs"),
  "--input",src,"--output",out,"--seed","14014"],{encoding:"utf8",timeout:15000});
 const json=JSON.parse(fs.readFileSync(out,"utf8")),unit=JSON.parse(cmd);
 assert.equal(json.sha256,unit.hash);assert.equal(json.quality.metrics.tempoChanges,3);
 assert.equal(json.rights.publicRelease,false);
 const original=path.join(ROOT,"games/nangam-schoolband-v08/charts/original-anthem.music-events.v1.json");
 const output=path.join(OUT,"cli-original.json");
 const res=cp.execFileSync(process.execPath,[path.join(ROOT,"scripts/schoolband-rock-arranger-v1.cjs"),
  "--input",original,"--output",output],{encoding:"utf8",timeout:15000});
 assert.equal(JSON.parse(res).song,EVENTS.songId);
 const unlicensed=path.join(OUT,"unlicensed-source.json");
 const bad=clone(COMPLEX);bad.rights.status="withdrawn";
 fs.writeFileSync(unlicensed,JSON.stringify(bad)+"\n");
 const fail=cp.spawnSync(process.execPath,[path.join(ROOT,"scripts/schoolband-rock-arranger-v1.cjs"),
  "--input",unlicensed,"--output",path.join(OUT,"must-not-exist.json")],{encoding:"utf8",timeout:15000});
 assert.notEqual(fail.status,0);assert(fail.stderr.includes("ARRANGEMENT_REJECTED"));
 assert(!fs.existsSync(path.join(OUT,"must-not-exist.json")),"unlicensed output must not be produced");
 fs.unlinkSync(unlicensed);return {passes:2,unlicensedRejected:true};
}
async function offlineBrowser(arrangements){
 const {chromium}=require("playwright");
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 try{
  const page=await browser.newPage({viewport:{width:1040,height:740}});
  for(const item of arrangements){
   const a=item.arrangement;
   const metrics=await page.evaluate(async arrangement=>{
    const rate=24000,seconds=arrangement.timing.totalSeconds+.28,frames=Math.ceil(seconds*rate);
    const ctx=new OfflineAudioContext(2,frames,rate),master=ctx.createGain();
    master.gain.value=arrangement.mixing.master;
    const compressor=ctx.createDynamicsCompressor();
    compressor.threshold.value=-19;compressor.knee.value=14;compressor.ratio.value=7;
    master.connect(compressor);compressor.connect(ctx.destination);
    const buses={};
    for(const [name,gain]of Object.entries(arrangement.mixing)){
     if(["melody","drums","bass","guitar","keys"].includes(name)){
      const g=ctx.createGain();g.gain.value=gain;g.connect(master);buses[name]=g;
     }
    }
    const types={melody:"triangle",drums:"sine",bass:"triangle",guitar:"sawtooth",keys:"sine"};
    let nodes=0;let maxEvents=0;
    for(const track of arrangement.parts){
     for(const e of track.events){
      const src=ctx.createOscillator(),vol=ctx.createGain();
      src.type=types[track.id];
      src.frequency.setValueAtTime(440*Math.pow(2,(e.pitch-69)/12),e.playbackSeconds);
      const t=e.playbackSeconds,short=Math.min(.20,(e.endSeconds-e.startSeconds)*.7);
      vol.gain.setValueAtTime(.001,t);
      vol.gain.linearRampToValueAtTime(Math.min(.085,e.velocity/127*.075),t+.006);
      vol.gain.exponentialRampToValueAtTime(.0001,t+Math.max(.022,short));
      src.connect(vol);vol.connect(buses[track.id]);src.start(t);src.stop(t+Math.max(.026,short)+.015);
      nodes++;maxEvents=Math.max(maxEvents,e.playbackSeconds);
     }
    }
    const output=await ctx.startRendering();let peak=0,rms=0,count=0,clipped=0,bad=0;
    for(let ch=0;ch<2;ch++)for(const v of output.getChannelData(ch)){
     if(!Number.isFinite(v)){bad++;continue}
     peak=Math.max(peak,Math.abs(v));rms+=v*v;count++;
     if(Math.abs(v)>=.999)clipped++;
    }
    return {nodeCount:nodes,peak,peakDbFS:20*Math.log10(peak),rms:Math.sqrt(rms/count),
      clipped,bad,samples:count,totalSeconds:seconds,lastEventAt:maxEvents,contextState:ctx.state};
   },a);
   assert(metrics.nodeCount===a.parts.reduce((n,p)=>n+p.events.length,0));
   assert(metrics.bad===0&&metrics.clipped===0);
   assert(metrics.peak>0.005&&metrics.peak<.95,"digital headroom for "+a.songId+" "+metrics.peak);
   assert(metrics.rms>.0005);
   assert(metrics.lastEventAt<metrics.totalSeconds);
   REPORT.browser.push({songId:a.songId,passed:true,...metrics});
   console.log("PASS offline Chromium "+a.songId+": "+metrics.nodeCount+" scheduled sound nodes, "+
    metrics.peakDbFS.toFixed(2)+" dBFS maximum, no clip");
  }
 }finally{await browser.close()}
}
(async()=>{
 const ori=originalProof(),complex=variedProof(),negative=corruptCases(),cli=commandLine();
 REPORT.unit={passed:true,original:{id:ori.arrangement.songId,hash:ori.arrangement.sha256,
  metrics:ori.arrangement.quality.metrics,ticks:ori.arrangement.timing.totalTicks,seconds:ori.arrangement.timing.totalSeconds},
  mixed:{id:complex.arrangement.songId,hash:complex.arrangement.sha256,
   metrics:complex.arrangement.quality.metrics,ticks:complex.arrangement.timing.totalTicks,
   seconds:complex.arrangement.timing.totalSeconds,tempoCrossingSeconds:complex.crossing},
  negativeCases:negative,cli,seedControlled:true,melodyIntact:true};
 console.log("PASS unit stage014 two original works, "+negative.length+" malformed inputs rejected, deterministic hash and tempo-crossing note");
 if(process.argv.includes("--browser"))await offlineBrowser([ori,complex]);
 save();console.log("PASS stage014; evidence artifacts/schoolband-stage014/results.json");
})().catch(e=>{REPORT.failure=String(e.stack||e);save();console.error("FAIL Stage014 "+(e.stack||String(e)));process.exitCode=1});
