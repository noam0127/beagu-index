#!/usr/bin/env node
"use strict";
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),assert=require("node:assert/strict"),cp=require("node:child_process"),http=require("node:http");
const ROOT=path.resolve(__dirname,".."),DIR=path.join(ROOT,"games/nangam-schoolband-v08");
const GAME=fs.readFileSync(path.join(DIR,"index.html"),"utf8");
const CHART=JSON.parse(fs.readFileSync(path.join(DIR,"charts/creative-school-anthem.chart.v1.json"),"utf8"));
const DOC=JSON.parse(fs.readFileSync(path.join(DIR,"charts/original-anthem.music-events.v1.json"),"utf8"));
const TOOL=require("./schoolband-music-events-v1.cjs"),OUT=path.join(ROOT,"artifacts/schoolband-stage013");
fs.mkdirSync(OUT,{recursive:true});
const proof={stage:"013/030",codeVersion:"creative-anthem-events-v1.0.0",unit:{},browser:[],limitations:[
 "MIDI/MusicXML example files are generated from the existing internally authored demo tune, not externally licensed school property.",
 "Stage013 parsers intentionally support single-part 4/4, constant-tempo, quantized eight-bar melody. Multi-voice, tempo/meter changes, key shifts and more expressive scores remain stage014.",
 "Permission-status gate is a necessary process check, not independent legal validation of a rights-holder's signature. Real school songs remain BLOCKED pending documented permission (022-023).",
 "Chromium browser verification does not represent a physical mobile device's sound, touch or operating-system audio permission."
]};
const persist=()=>fs.writeFileSync(path.join(OUT,"results.json"),JSON.stringify(proof,null,2)+"\n");
function melodySource(){
 const m=GAME.match(/const MELODY=(\[[\s\S]*?\]);\nconst MELODY_BY_STEP=/);
 assert(m,"original melody source missing");
 return JSON.parse(m[1]);
}
function checkDocument(){
 assert.equal(DOC.schemaVersion,1);
 assert.equal(DOC.standard,"schoolband-music-events-v1");
 assert.equal(DOC.arrangementVersion,"creative-anthem-events-v1.0.0");
 assert.equal(DOC.songId,CHART.songId);
 assert.equal(DOC.timing.bpm,CHART.bpm);
 assert.equal(DOC.timing.barCount,CHART.barCount);
 assert.deepEqual(DOC.noteTypes,["tap"]);
 assert.equal(DOC.timing.ticksPerQuarter,480);
 assert.equal(DOC.timing.totalTicks,15360);
 assert.equal(DOC.rights.status,"demo_original");
 assert.equal(DOC.rights.publicRelease,false);
 assert(DOC.rights.scopes.includes("convert_to_game"));
 const source=melodySource(),parts=Object.fromEntries(DOC.parts.map(x=>[x.id,x]));
 assert.deepEqual(Object.keys(parts),["melody","drums","bass","guitar","keys"]);
 assert.deepEqual(Object.fromEntries(Object.entries(parts).map(([k,v])=>[k,v.events.length])),
   {melody:28,drums:64,bass:32,guitar:16,keys:16});
 assert.deepEqual(parts.melody.events.map(x=>[x.step,x.pitch,x.duration]),source);
 const rootMidi=[48,48,43,43,45,45,41,48],symbols=["C","C","G","G","Am","Am","F","C"];
 assert.deepEqual(DOC.harmony.map(x=>x.symbol),symbols);
 for(let i=0;i<8;i++){assert.equal(DOC.harmony[i].rootMidi,rootMidi[i]);assert.equal(DOC.harmony[i].bar,i);}
 const beat=60/108,all=DOC.parts.flatMap(x=>x.events);
 assert.equal(all.length,156);
 let timeCount=0;
 for(const [id,p]of Object.entries(parts)){
  for(const [i,e]of p.events.entries()){
   assert.equal(e.part,id);
   assert(Number.isInteger(e.step)&&e.step>=0&&e.step<128);
   assert(Number.isInteger(e.pitch)&&e.pitch>=0&&e.pitch<=127);
   assert(Number.isInteger(e.duration)&&e.duration>0&&e.step+e.duration<=128);
   assert.equal(e.startTick,e.step*120);
   assert.equal(e.durationTicks,e.duration*120);
   assert(Math.abs(e.startSeconds-e.step/4*beat)<1e-7,"time drift "+id+"/"+i);
   assert(Math.abs(e.durationSeconds-e.duration/4*beat)<1e-7,"duration drift "+id+"/"+i);
   timeCount+=2;
  }
 }
 for(const [i,e]of parts.drums.events.entries()){
  const step=i*2;
  assert.equal(e.step,step);
  assert.equal(e.pitch,step%4===0?(step%16===0?36:38):42,"drum kick/snare/hat role drift");
 }
 for(let i=0;i<32;i++){
  const e=parts.bass.events[i];
  assert.equal(e.step,i*4);
  assert.equal(e.pitch,rootMidi[Math.floor(i/4)]-12,"bass root changed");
 }
 for(let i=0;i<16;i++){
  assert.equal(parts.guitar.events[i].step,i*8);
  assert.equal(parts.guitar.events[i].pitch,rootMidi[Math.floor(i/2)]+12);
  assert.equal(parts.keys.events[i].step,i*8);
  assert.equal(parts.keys.events[i].pitch,rootMidi[Math.floor(i/2)]);
 }
 return {source,melody:parts.melody.events,partCounts:Object.fromEntries(Object.entries(parts).map(([k,v])=>[k,v.events.length])),timelineComparisons:timeCount};
}
function expectError(fn,label){
 let thrown=false;try{fn()}catch(e){thrown=true;assert(e instanceof TOOL.MusicInputError||e instanceof Error,label+" not a proper error");}
 assert(thrown,"expected rejection of "+label);
}
function unitTests(){
 const obj=checkDocument(),rights=DOC.rights,melody=obj.melody;
 const midi=TOOL.makeMidiFixture(melody,108);
 const xml=TOOL.makeMusicXmlFixture(melody,108);
 const midiFile=path.join(OUT,"original-demo-28notes.mid"),xmlFile=path.join(OUT,"original-demo-28notes.musicxml");
 const rightsFile=path.join(OUT,"original-demo-rights.json");
 fs.writeFileSync(midiFile,midi);fs.writeFileSync(xmlFile,xml);fs.writeFileSync(rightsFile,JSON.stringify(rights,null,2)+"\n");
 const midiResult=TOOL.parseMidi(midi,rights),xmlResult=TOOL.parseMusicXml(xml,rights);
 assert.equal(midiResult.sourceFormat,"midi");
 assert.equal(xmlResult.sourceFormat,"musicxml");
 assert.equal(midiResult.notes.length,28);assert.equal(xmlResult.notes.length,28);
 assert.equal(midiResult.sourceTempoMicroseconds,555556);
 assert(Math.abs(midiResult.bpm-108)<.0002);
 assert.equal(xmlResult.bpm,108);
 let roundTrip=0,maxTimingDifference=0;
 for(let i=0;i<28;i++){
  const ref=melody[i],a=midiResult.notes[i],b=xmlResult.notes[i];
  for(const x of [a,b]){
   assert.equal(x.step,ref.step);
   assert.equal(x.pitch,ref.pitch);
   assert.equal(x.duration,ref.duration);
   assert.equal(x.startTick,ref.startTick);
   assert.equal(x.durationTicks,ref.durationTicks);
   assert.equal(x.velocity,96);
   const dt=Math.abs(x.startSeconds-ref.startSeconds);
   maxTimingDifference=Math.max(maxTimingDifference,dt);
   assert(dt<.00002,"MIDI tempo us/quarternote quantization drift "+dt);
   roundTrip+=6;
  }
 }
 const expectedEnd=128/4*60/108;
 assert(Math.abs((midiResult.notes.at(-1).startSeconds+midiResult.notes.at(-1).durationSeconds)-expectedEnd)<.00002);
 assert(Math.abs((xmlResult.notes.at(-1).startSeconds+xmlResult.notes.at(-1).durationSeconds)-expectedEnd)<1e-7);
 // Command-line workflow is actually executed as a separate Node process.
 for(const format of ["midi","musicxml"]){
  const out=path.join(OUT,"converted-"+format+".json");
  const input= format==="midi"?midiFile:xmlFile;
  const log=cp.execFileSync(process.execPath,[path.join(ROOT,"scripts/schoolband-music-events-v1.cjs"),
   "--format",format,"--input",input,"--output",out,"--rights",rightsFile],{encoding:"utf8",timeout:10000});
  assert(log.includes("Converted 28 notes"));
  const parsed=JSON.parse(fs.readFileSync(out,"utf8"));
  assert.equal(parsed.notes.length,28);assert.deepEqual(parsed.rights.sourceId,rights.sourceId);
 }
 const errors=[];
 function bad(label,callback){expectError(callback,label);errors.push(label);}
 bad("no-rights",()=>TOOL.parseMidi(midi,null));
 bad("denied-rights",()=>TOOL.parseMusicXml(xml,{...rights,status:"denied"}));
 bad("wrong-demo-source",()=>TOOL.parseMusicXml(xml,{...rights,sourceId:"some-unlicensed-school"}));
 bad("missing-conversion-scope",()=>TOOL.parseMidi(midi,{...rights,scopes:["read_only"]}));
 bad("public-release-for-demo",()=>TOOL.parseMidi(midi,{...rights,publicRelease:true}));
 bad("approved-no-evidence",()=>TOOL.parseMidi(midi,{...rights,status:"approved"}));
 bad("expired-permission",()=>TOOL.parseMidi(midi,{...rights,status:"approved",permissionRecordId:"test-only-not-real",validUntil:"2020-01-01"}));
 bad("truncated-midi",()=>TOOL.parseMidi(midi.subarray(0,midi.length-4),rights));
 const smpte=Buffer.from(midi);smpte.writeUInt16BE(0xE728,12);
 bad("midi-SMPTE",()=>TOOL.parseMidi(smpte,rights));
 const type2=Buffer.from(midi);type2.writeUInt16BE(2,8);
 bad("midi-unsupported-type-2",()=>TOOL.parseMidi(type2,rights));
 const meter=Buffer.from(midi);
 const pos=meter.indexOf(Buffer.from([0xFF,0x58,0x04,4,2,24,8]));
 assert(pos>=0);meter[pos+3]=3;
 bad("midi-non-four-four",()=>TOOL.parseMidi(meter,rights));
 const off=Buffer.from(midi);
 const offIndex=off.indexOf(Buffer.from([0x80,76,0]));
 assert(offIndex>=0);off[offIndex+1]=77;
 bad("midi-mismatched-off",()=>TOOL.parseMidi(off,rights));
 bad("oversized-midi",()=>TOOL.parseMidi(Buffer.alloc(1048577),rights));
 bad("XML-external-entity",()=>TOOL.parseMusicXml('<!DOCTYPE x [<!ENTITY q SYSTEM "file:///etc/passwd">]>'+xml,rights));
 bad("XML-invalid-pitch",()=>TOOL.parseMusicXml(xml.replace("<step>E</step>","<step>H</step>"),rights));
 bad("XML-bad-meter",()=>TOOL.parseMusicXml(xml.replace("<beats>4</beats>","<beats>3</beats>"),rights));
 bad("XML-incomplete-bar",()=>TOOL.parseMusicXml(xml.replace("<duration>480</duration>","<duration>240</duration>"),rights));
 bad("XML-chord-unsupported",()=>TOOL.parseMusicXml(xml.replace("<note>","<note><chord/>"),rights));
 bad("XML-multi-voice",()=>TOOL.parseMusicXml(xml.replace('<measure number="2">','<measure number="2"><backup><duration>480</duration></backup>'),rights));
 bad("XML-unapproved-tempo-change",()=>TOOL.parseMusicXml(xml.replace('<measure number="2">','<measure number="2"><direction><sound tempo="122"/></direction>'),rights));
 bad("XML-missing-notes",()=>TOOL.parseMusicXml(xml.replace(/<note>[\s\S]*?<\/note>/,""),rights));
 proof.unit={passed:true,songId:DOC.songId,partCounts:obj.partCounts,musicEvents:156,melodyNotes:28,
   canonicalPPQ:480,bpm:108,beatsPerBar:4,barCount:8,harmonyBars:8,
   timelineComparisons:obj.timelineComparisons,midiMusicXmlPitchAndTickComparisons:roundTrip,
   maxConversionSecondsDifference:maxTimingDifference,fullSongSeconds:expectedEnd,
   cliConversions:2,negativeCases:errors};
 console.log("PASS original 28-note tune; 156 structured events, 8 chords, "+roundTrip+" MIDI/MusicXML parity checks and "+errors.length+" rejects");
 return obj;
}
async function browserTests(){
 const {chromium}=require("playwright");
 const srv=http.createServer((req,res)=>{res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"});res.end(GAME)});
 await new Promise(resolve=>srv.listen(0,"127.0.0.1",resolve));
 let browser;try{
  browser=await chromium.launch({headless:true,args:["--no-sandbox","--autoplay-policy=no-user-gesture-required"]});
  const url="http://127.0.0.1:"+srv.address().port+"/";
  for(const mode of ["desktop","mobile320"]){
   const mobile=mode==="mobile320";
   const ctx=await browser.newContext({viewport:mobile?{width:320,height:640}:{width:1280,height:850},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1});
   const page=await ctx.newPage(),errors=[];page.on("pageerror",e=>errors.push(e.message));
   try{
    assert((await page.goto(url,{waitUntil:"domcontentloaded"})).ok());
    const api=await page.evaluate(()=>{
     const x=window.nangamSchoolbandV08;return {notes:x.getMelody(),meta:x.getChartMetadata(),rules:x.getTimingRules(),n:x.getLaneCount(),
      overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2};
    });
    assert.equal(api.notes.length,28);assert.equal(api.meta.bpm,108);assert.equal(api.meta.barCount,8);assert.equal(api.overflow,false);
    assert.deepEqual(api.notes.map(x=>[x.step,x.pitch,x.duration]),proof.unit&&melodySource());
    let timeline=0;
    for(const note of api.notes){
     const e=DOC.parts[0].events.find(x=>x.step===note.step);
     assert(e);
     assert(Math.abs(e.startSeconds-note.step/4*api.rules.beatSeconds)<1e-7);
     timeline++;
    }
    await page.locator("#demoSchool").click();await page.locator("#start").click();
    await page.waitForFunction(()=>window.nangamSchoolbandV08.getAudioEvents().filter(x=>x.part==="melody").length>=8,null,{timeout:7000});
    const played=await page.evaluate(()=>({
      events:window.nangamSchoolbandV08.getAudioEvents().filter(x=>x.part==="melody"),
      state:window.nangamSchoolbandV08.getPlaybackState(),
      source:window.nangamSchoolbandV08.getAudioLifetime()
    }));
    const first=played.events[0].when;
    for(let i=0;i<8;i++){
     const expected=DOC.parts[0].events[i];
     assert(Math.abs((played.events[i].when-first)-expected.startSeconds)<.000003,
       "real WebAudio melody scheduler drift at "+i);
    }
    assert.equal(played.state.playing,true);
    await page.locator("#stop").click();
    await page.waitForFunction(()=>!window.nangamSchoolbandV08.getAudioLifetime().hasContext);
    assert.deepEqual(errors,[]);
    proof.browser.push({mode,passed:true,melodyScheduleEventsVerified:8,musicEventsComparedToGame:timeline,
      audioContextClosed:true,errors:0});
    console.log("PASS "+mode+" original melody 28 pitch events and first 8 real WebAudio scheduling offsets");
   }finally{await ctx.close();}
  }
 }finally{if(browser)await browser.close();await new Promise(r=>srv.close(r))}
}
(async()=>{unitTests();if(process.argv.includes("--browser"))await browserTests();persist();console.log("PASS Stage013 canonical song, rights gate, MIDI/MusicXML parsers, CLI, and live scheduler");})()
.catch(e=>{proof.failure=String(e.stack||e);persist();console.error("FAIL Stage013 "+(e.stack||String(e)));process.exitCode=1;});
