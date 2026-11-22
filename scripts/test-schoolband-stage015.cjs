#!/usr/bin/env node
"use strict";
const fs=require("node:fs"),path=require("node:path"),http=require("node:http"),assert=require("node:assert/strict");
const ROOT=path.resolve(__dirname,".."),GAME=fs.readFileSync(path.join(ROOT,"games/nangam-schoolband-v08/index.html"),"utf8");
const EVENT_SOURCE=JSON.parse(fs.readFileSync(path.join(ROOT,"games/nangam-schoolband-v08/charts/original-anthem.music-events.v1.json"),"utf8"));
const METER_SOURCE=JSON.parse(fs.readFileSync(path.join(ROOT,"games/nangam-schoolband-v08/charts/original-variable-meter-exercise.input.v1.json"),"utf8"));
const ARR=require("./schoolband-rock-arranger-v1.cjs"),G=require("./schoolband-chart-generator-v1.cjs");
const OUT=path.join(ROOT,"artifacts/schoolband-stage015");fs.mkdirSync(OUT,{recursive:true});
const PROOF={stage:"015/030",unit:{},browser:[],limitations:[
 "Public registration stays BLOCKED without independent rights-holder confirmation. Both inputs are original fictional-school demo works.",
 "Only the original constant 108 BPM/4-4 song is loaded into the existing live game for 40 Chromium playthroughs; variable-meter charts are generated and timing-audited offline, not played with a broken fixed-BPM scheduler.",
 "Chromium mobile320 emulation is not physical Android/iOS touch testing or speaker listening.",
 "Five-tier chart conversion reduces some auto-arranged chord voices to at most two simultaneous lane hits; source pitches and transformation metadata remain auditable.",
 "Player hit notes are judged against source startSeconds; the backing arrangement's deterministic ±4ms humanization remains independent and bounded."
]};
const save=()=>fs.writeFileSync(path.join(OUT,"results.json"),JSON.stringify(PROOF,null,2)+"\n");
const copy=x=>JSON.parse(JSON.stringify(x));
const orig=ARR.arrange(ARR.fromStage013(EVENT_SOURCE),{seed:14014});
const mixed=ARR.arrange(METER_SOURCE,{seed:14014});
const cat=G.registerPrivateTrial(orig);
const complexCat=G.registerPrivateTrial(mixed);
const TIERS=G.DIFFICULTY,PARTS=Object.keys(G.INSTRUMENTS);
function expectedNotes(c,tier,inst){return c.charts[inst][tier].notes;}
function negative(label,fn){
 assert.throws(fn,e=>e instanceof G.ChartGateError,label+" must fail closed");
 return label;
}
function validate(){
 assert.equal(orig.quality.valid,true);assert.equal(mixed.quality.valid,true);
 assert.equal(cat.publicRelease,false);assert.equal(complexCat.publicRelease,false);
 assert.equal(cat.registration.publicApproved,false);
 assert.equal(G.validateCatalog(cat,orig).valid,true);
 assert.equal(G.validateCatalog(complexCat,mixed).valid,true);
 assert.equal(cat.review.qualityGate.totalCharts,20);
 assert.equal(cat.registration.auditTrail.length,3);
 const results={};
 let total=0,checked=0,positiveTimeline=0,topLevelChartPairs=0;
 for(const [name,arr,c] of [["original",orig,cat],["variable",mixed,complexCat]]){
  const music=Object.fromEntries(arr.parts.map(x=>[x.id,x.events]));
  const item={songId:arr.songId,timeSeconds:arr.timing.totalSeconds,
   charts:{},registration:c.registration.status,
   tempoChanges:arr.timing.tempos.length-1,meterChanges:arr.timing.meters.length-1};
  for(const inst of PARTS){
   item.charts[inst]=[];
   const all=new Set();
   for(const tier of TIERS){
    const notes=expectedNotes(c,tier,inst),sources=music[inst];
    assert.equal(notes.length,c.charts[inst][tier].noteCount);
    assert(notes.length>all.size,"density strictly ascending "+name+" "+inst+" "+tier);
    assert(notes.every(n=>Number.isFinite(n.startSeconds)&&n.startSeconds>=0&&
      n.startSeconds<c.timing.totalSeconds),"no note beyond track end");
    const lanes=Array(G.INSTRUMENTS[inst].length).fill(0),simul=new Map();
    for(const n of notes){
     checked++;
     const actual=sources.find(s=>s.startTick===n.source.startTick&&s.pitch===n.source.pitch&&
      s.role===n.source.role);
     assert(actual,"charted note lacks reference music");
     assert.equal(actual.startSeconds,n.startSeconds,"music-note timestamp identity");
     assert.equal(n.startTick,n.source.startTick);
     assert(Math.abs(actual.playbackSeconds-n.startSeconds)<=.0040001,"humanization latency limit");
     assert(n.pitch===actual.pitch||n.transform!=="identity","transformation must be named");
     assert(n.lane>=0&&n.lane<lanes.length);
     lanes[n.lane]++;
     simul.set(n.startTick,(simul.get(n.startTick)||0)+1);
     if(n.transform!=="identity")positiveTimeline++;
    }
    assert(lanes.every(x=>x>0),"all lanes have a note");
    assert([...simul.values()].every(n=>n<=2),"max two simultaneous notes");
    assert([...all].every(id=>notes.some(n=>n.id===id)),"tier must be nested");
    notes.forEach(n=>all.add(n.id));
    item.charts[inst].push({tier,noteCount:notes.length,perLane:lanes,
      maxConcurrent:Math.max(...simul.values()),convertedNotesWithSource:notes.length});
    total+=notes.length;topLevelChartPairs++;
   }
  }
  results[name]=item;
 }
 assert.equal(topLevelChartPairs,40,"two original compositions × 20 charts");
 assert(positiveTimeline>0,"must document explicit derived/revoiced notes");
 let rejected=[];
 function reject(label,fn){rejected.push(negative(label,fn));}
 const corrupt=fn=>{const c=copy(cat);fn(c);return G.validateCatalog(c,orig);};
 const requiredError=(label,fn,needle)=>reject(label,()=>{
  const verdict=corrupt(fn);if(verdict.valid||!verdict.errors.some(e=>e.includes(needle)))throw new Error("test did not detect "+label);
  throw new G.ChartGateError(verdict.errors.join(","));
 });
 requiredError("wrong-catalog-version",x=>x.catalogVersion="fake","catalog_version");
 requiredError("wrong-arrangement-hash",x=>x.arrangementSha256="fake","arrangement_sha_mismatch");
 requiredError("public-release-flag",x=>x.publicRelease=true,"public_release_gate");
 requiredError("public-registration",x=>x.registration.status="published","public_release_gate");
 requiredError("rights-status",x=>x.rights.status="unverified","rights");
 requiredError("timing-beyond-song",x=>x.timing.totalTicks++,"timing");
 requiredError("pitch-tampering",x=>x.charts.guitar.easy.notes[0].pitch++,"music_note_mismatch");
 requiredError("shifted-note-time",x=>x.charts.keys.normal.notes[0].startSeconds+=.12,"music_note_mismatch");
 requiredError("wrong-input-lane",x=>x.charts.bass.hard.notes[0].lane=2,"music_note_mismatch");
 requiredError("duplicate-note",x=>x.charts.drums.easy.notes.push(copy(x.charts.drums.easy.notes[0])),"duplicate_note");
 requiredError("missing-easy-lane",x=>x.charts.keys.easy.notes=x.charts.keys.easy.notes.filter(n=>n.lane!==3),"empty_lane");
 requiredError("difficulty-not-strictly-rising",x=>x.charts.guitar.normal.notes=copy(x.charts.guitar.easy.notes),"nonincreasing_difficulty");
 requiredError("difficulty-subset-broken",x=>x.charts.keys.normal.notes=x.charts.keys.normal.notes.filter(n=>n.id!==x.charts.keys.easy.notes[0].id),"tier_not_nested");
 requiredError("review-not-approved",x=>x.review.qualityGate.passed=false,"quality_gate_not_passed");
 requiredError("audit-trail-missing",x=>x.registration.auditTrail=[],"review_audit_trail_incomplete");
 reject("arranger-sha-corrupt",()=>G.registerPrivateTrial({...orig,sha256:"tampered"}));
 reject("arrangement-rights-unverified",()=>G.registerPrivateTrial({...orig,rights:{...orig.rights,status:"unverified"}}));
 reject("arrangement-no-quality",()=>G.registerPrivateTrial({...orig,quality:{valid:false,errors:["bad"]}}));
 reject("third-party-unknown-song",()=>G.registerPrivateTrial({...orig,songId:"school-unknown"}));
 reject("public-registration-explicitly-blocked",()=>G.requestPublication(cat));
 assert.equal(rejected.length,20);
 const outOrig=path.join(OUT,"original-20-charts.private.json"),outVariable=path.join(OUT,"variable-meter-20-charts.private.json");
 fs.writeFileSync(outOrig,JSON.stringify(cat,null,2)+"\n");fs.writeFileSync(outVariable,JSON.stringify(complexCat,null,2)+"\n");
 // Real CLI generation from the persisted stage014 arrangements
 for(const [name,arrFile,c]of [["original",path.join(OUT,"original-arrangement.json"),cat],
  ["variable",path.join(OUT,"variable-arrangement.json"),complexCat]]){
  fs.writeFileSync(arrFile,JSON.stringify(name==="original"?orig:mixed,null,2)+"\n");
  const generated=G.cli(arrFile,path.join(OUT,name+"-cli-catalog.json"));
  assert.deepEqual(generated,c,"CLI chart must equal in-memory chart exactly");
 }
 PROOF.unit={passed:true,compositions:results,charts:40,chartNotesChecked:checked,
  convertedRevoicings:positiveTimeline,sourceEvents:200+185,
  publicReleaseBlocked:true,negativeControls:rejected,
  originalsPrivateQaOnly:true};
 console.log("PASS Stage015 40 generated charts / "+checked+" note-to-music checks, all lanes, tiers and "+rejected.length+" fail-closed corruptions");
}
function keyCode(lanes,index){
 const keys={guitar:["d","f","j","k"],drums:["d","f","j","k"],bass:["f","Space","j"],keys:["a","s","d","j","k"]};
 return keys[lanes][index];
}
async function browser(){
 const {chromium}=require("playwright");
 const server=http.createServer((req,res)=>{
  res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"});res.end(GAME);
 });
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 let b;
 try{
  b=await chromium.launch({headless:true,args:["--no-sandbox","--autoplay-policy=no-user-gesture-required"]});
  const origin="http://127.0.0.1:"+server.address().port;
  for(const mode of ["desktop","mobile320"]){
   const mobile=mode==="mobile320";
   const context=await b.newContext({viewport:mobile?{width:320,height:640}:{width:1280,height:850},
    isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1});
   await context.addInitScript(()=>{
    const Native=window.AudioContext||window.webkitAudioContext;
    window.__stage015Clock=0;
    if(Native)window.AudioContext=class AcceleratedForFiftyCharts extends Native{
     get currentTime(){return window.__stage015Clock}
    };
   });
   const page=await context.newPage(),errors=[];
   page.on("pageerror",e=>errors.push(e.message));
   try{
    assert((await page.goto(origin,{waitUntil:"domcontentloaded"})).ok());
    await page.evaluate(c=>{window.__stage015Catalog=c},cat);
    const rejected=await page.evaluate(c=>({
      invalid:window.nangamSchoolbandV08.loadGeneratedTrial({...c,publicRelease:true},"guitar","easy"),
      variable:window.nangamSchoolbandV08.loadGeneratedTrial({...c,timing:{...c.timing,tempos:[{tick:0,bpm:120}]}},"guitar","easy")
    }),cat);
    assert.deepEqual(rejected,{invalid:false,variable:false},"unapproved or inaccurate demo chart must not enter actual live player");
    let played=0,hitCount=0;
    for(const inst of PARTS){
     for(const tier of TIERS){
      const expected=expectedNotes(cat,tier,inst);
      const loaded=await page.evaluate(({inst,tier})=>{
       return window.nangamSchoolbandV08.loadGeneratedTrial(window.__stage015Catalog,inst,tier);
      },{inst,tier});
      assert.equal(loaded,true,"internal preview failed "+inst+"/"+tier);
      assert.equal(await page.locator("#pads .taphit").count(),G.INSTRUMENTS[inst].length);
      await page.evaluate(()=>{window.__stage015Clock=0});
      await page.locator("#start").click();
      await page.waitForFunction(()=>window.nangamSchoolbandV08.getStatus().playing);
      const game=await page.evaluate(()=>({
       chart:window.nangamSchoolbandV08.getChart(),
       trial:window.nangamSchoolbandV08.getGeneratedTrial(),
       status:window.nangamSchoolbandV08.getStatus(),
       lanes:window.nangamSchoolbandV08.getLanes(),
       horizontalOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2
      }));
      assert.equal(game.chart.length,expected.length);
      assert.equal(game.horizontalOverflow,false);
      assert.equal(game.trial.notes,expected.length);
      for(let i=0;i<expected.length;i++){
       assert.equal(game.chart[i].t,expected[i].startSeconds,inst+"/"+tier+" chart timing");
       assert.equal(game.chart[i].lane,expected[i].lane,inst+"/"+tier+" chart lane");
       assert.equal(game.chart[i].pitch,expected[i].pitch,inst+"/"+tier+" sounding pitch");
      }
      const first=game.lanes.map((_,lane)=>expected.find(x=>x.lane===lane));
      assert(first.every(Boolean));
      const hits=first.map((x,lane)=>({...x,lane})).sort((a,b)=>a.startSeconds-b.startSeconds||a.lane-b.lane);
      for(const note of hits){
       await page.evaluate(t=>{window.__stage015Clock=1.05+t},note.startSeconds);
       const pre=await page.evaluate(()=>window.nangamSchoolbandV08.getStatus().hits);
       await page.keyboard.press(keyCode(inst,note.lane));
       const post=await page.evaluate(()=>({
        hits:window.nangamSchoolbandV08.getStatus().hits,
        hitEvents:window.nangamSchoolbandV08.getAudioEvents().filter(e=>e.source==="hit"),
        chart:window.nangamSchoolbandV08.getChart()
       }));
       assert.equal(post.hits,pre+1,"lane physical key did not score exactly one");
       assert.equal(post.hitEvents.at(-1).part,inst);
       assert.equal(post.hitEvents.at(-1).lane,note.lane);
       hitCount++;
      }
      await page.waitForTimeout(45);
      const beforeEnd=await page.evaluate(()=>({
       source:window.nangamSchoolbandV08.getAudioEvents().filter(e=>e.source==="auto").map(e=>e.part),
       hit:window.nangamSchoolbandV08.getAudioEvents().filter(e=>e.source==="hit").length,
       empty:window.nangamSchoolbandV08.getStatus().emptyPresses
      }));
      assert(beforeEnd.source.includes("melody"),"song melody must be scheduled");
      assert(!beforeEnd.source.includes(inst),"selected instrument cannot autoplay");
      assert.equal(beforeEnd.hit,game.lanes.length);
      await page.evaluate(seconds=>{window.__stage015Clock=1.05+seconds+.40},cat.timing.totalSeconds);
      await page.waitForFunction(()=>!window.nangamSchoolbandV08.getStatus().playing,null,{timeout:4000});
      const final=await page.evaluate(()=>({
       score:window.nangamSchoolbandV08.getStatus().score,
       hits:window.nangamSchoolbandV08.getStatus().hits,
       result:document.getElementById("result").textContent,
       progress:document.getElementById("progress").style.width
      }));
      assert.equal(final.hits,game.lanes.length);
      assert(final.score>0&&final.result.includes("PERFECT"));
      assert.equal(final.progress,"100%");
      played++;
      PROOF.browser.push({mode,inst,tier,completed:true,totalNotes:game.chart.length,
       correctLaneHits:game.lanes.length,autoMelody:true,selectedAutoExcluded:true,
       actualAudioEvents:beforeEnd.source.length});
      console.log("PASS "+mode+" "+inst+"/"+tier+": "+game.chart.length+" mapped notes, "+game.lanes.length+" real keyboard hits, full song complete");
     }
    }
    assert.equal(played,20);assert.deepEqual(errors,[],"unexpected runtime JS errors");
    console.log("PASS "+mode+" all 20 live generated trial games, "+hitCount+" lane hits");
   }finally{await context.close();}
  }
 }finally{if(b)await b.close();await new Promise(resolve=>server.close(resolve));}
}
(async()=>{validate();if(process.argv.includes("--browser"))await browser();save();console.log("PASS Stage015 chart conversion, 20×2 playthroughs and quality gate");})()
.catch(e=>{PROOF.failure=String(e.stack||e);save();console.error("FAIL Stage015 "+(e.stack||String(e)));process.exitCode=1;});
