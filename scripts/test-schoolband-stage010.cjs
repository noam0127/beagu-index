#!/usr/bin/env node
"use strict";
const fs=require("node:fs"),path=require("node:path"),http=require("node:http"),vm=require("node:vm"),assert=require("node:assert/strict");
const ROOT=path.resolve(__dirname,".."),GAME=fs.readFileSync(path.join(ROOT,"games/nangam-schoolband-v08/index.html"),"utf8");
const OUT=path.join(ROOT,"artifacts/schoolband-stage010");
fs.mkdirSync(OUT,{recursive:true});
const INSTRUMENTS=["guitar","drums","bass","keys"];
const RESULTS={stage:"010/030",static:{},browsers:[],limitations:[
 "Web Audio oscillator/noise event capture establishes source scheduling and voice differences; it does not establish subjective hearing quality on headphones or phone speakers.",
 "Actual acoustic clipping/headroom and harmonic compatibility are stage 011, and node stop/disconnect and audio permission are stage 012.",
 "Browser input via Playwright is not an Android/iOS physical speaker/touch test (stage 027).",
 "All melody and school selection data are original or synthetic; no real copyrighted school anthem is used."
]};
const persist=()=>fs.writeFileSync(path.join(OUT,"results.json"),JSON.stringify(RESULTS,null,2)+"\n");
function checkPure(){
 const inline=GAME.match(/<script>([\s\S]*?)<\/script>/i)?.[1];assert(inline,"inline game script");
 new vm.Script(inline,{filename:"nangam-schoolband-stage010.js"});
 const expected=[
  'const AUDIO_EVENT_LIMIT=384,soundEvents=[]',
  'function logAudioEvent(source,part,lane,when,detail="")',
  'function autoPartsAtStep(step,selected)',
  'function melodyVoice(pitch,when,duration)',
  'function voice(inst,beat,when,lane=0,source="auto")',
  'voice(instrument,closest.beat,ctx.currentTime,lane,"hit")',
  'logAudioEvent("miss",instrument,n.lane,ctx.currentTime,"no-hit-sound")',
  'getAudioEvents:()=>soundEvents.map(e=>({...e}))',
  'getAudioPlan:step=>autoPartsAtStep(step,instrument)'
 ];
 expected.forEach(x=>assert(GAME.includes(x),"missing "+x));
 const roles={
  riff:GAME.includes('if(lane===0){ // riff'),
  power:GAME.includes('}else if(lane===1){ // power chord'),
  upstroke:GAME.includes('}else if(lane===2){ // upward strum'),
  high:GAME.includes('}else{ // high riff'),
  kick:GAME.includes('if(kind==="kick")'),
  snare:GAME.includes('// snare: short body plus noise burst'),
  hihat:GAME.includes('kind==="hat"'),
  tom:GAME.includes('o.frequency.exponentialRampToValueAtTime(96,when+.16)'),
 };
 Object.entries(roles).forEach(([k,v])=>assert(v,"missing distinct sound role "+k));
 const before=GAME.indexOf("function autoPartsAtStep("),end=GAME.indexOf("function audioContext(){");
 assert(before>=0&&end>before,"audio source order");
 const pureBlock=GAME.slice(before,GAME.indexOf("\n}",before)+2);
 const plan=vm.runInNewContext("const MELODY_BY_STEP=new Map([[0,1],[4,1],[8,1]]);\n"+pureBlock+"\nautoPartsAtStep",{}, {timeout:1000});
 let comparisons=0;
 for(const selected of INSTRUMENTS){
  const step0=Array.from(plan(0,selected));
  assert(step0.includes("melody"),"original melody must be included on first beat");
  assert.equal(step0.includes(selected),false,"selected instrument must NOT auto-play");
  assert.deepEqual(step0.sort(),["melody",...INSTRUMENTS.filter(x=>x!==selected)].sort(),
   "selected "+selected+" should be the only missing auto-ensemble part at step0");
  for(const step of [0,1,2,3,4,5,8,12]){
   const t=Array.from(plan(step,selected));
   assert.equal(t.includes(selected),false);
   if(step%2!==0)assert(!t.includes("drums"));
   if(step%4!==0)assert(!t.includes("bass"));
   if(step%8!==0)assert(!t.includes("guitar")&&!t.includes("keys"));
   comparisons++;
  }
 }
 assert.equal(GAME.includes('if(source==="miss")voice('),false,"MISS cannot generate instrument voice");
 RESULTS.static={passed:true,supportedInstruments:INSTRUMENTS,voiceRoles:roles,
   arrangementSamples:comparisons,selectedInstrumentNeverInAutoPlan:true,eventLogLimit:384};
 console.log("PASS static stage010: all 8 instrument voices, 4 selected-part omissions and "+comparisons+" soundtrack quantization samples");
}
async function browserTests(){
 const {chromium}=require("playwright");
 const server=http.createServer((req,res)=>{
  res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"});res.end(GAME);
 });
 await new Promise(r=>server.listen(0,"127.0.0.1",r));
 let browser;
 try{
  browser=await chromium.launch({headless:true,args:["--no-sandbox","--autoplay-policy=no-user-gesture-required"]});
  const origin="http://127.0.0.1:"+server.address().port+"/";
  for(const mode of ["desktop","mobile320"]){
   const mobile=mode==="mobile320";
   const context=await browser.newContext({viewport:mobile?{width:320,height:640}:{width:1280,height:850},
    isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1});
   await context.addInitScript(()=>{
    window.__stage010WebAudio=[];
    const Native=window.AudioContext||window.webkitAudioContext;
    if(Native)window.AudioContext=class Stage010TracingAudio extends Native{
     createOscillator(){
      const osc=super.createOscillator(),start=osc.start.bind(osc);
      osc.start=(when)=>{window.__stage010WebAudio.push({kind:"osc",type:osc.type,freq:osc.frequency.value,when});return start(when)};
      return osc;
     }
     createBufferSource(){
      const src=super.createBufferSource(),start=src.start.bind(src);
      src.start=(when)=>{window.__stage010WebAudio.push({kind:"noise",when});return start(when)};
      return src;
     }
    };
   });
   const page=await context.newPage(),pageErrors=[];
   page.on("pageerror",e=>pageErrors.push(e.message));
   let hitTotal=0;
   try{
    assert((await page.goto(origin,{waitUntil:"domcontentloaded"})).ok());
    await page.locator("#demoSchool").click();
    for(const instrument of INSTRUMENTS){
     await page.locator('[data-inst="'+instrument+'"]').click();
     await page.locator("#start").click();
     await page.waitForFunction(()=>window.nangamSchoolbandV08.getStatus().playing);
     const count=await page.evaluate(()=>window.nangamSchoolbandV08.getLaneCount());
     const actual=[];
     for(let lane=0;lane<count;lane++){
      const observation=await page.evaluate(async lane=>{
       const a=window.nangamSchoolbandV08,chart=a.getChart(),target=chart.find(n=>n.lane===lane);
       if(!target)throw Error("missing selected lane "+lane);
       const limit=performance.now()+5000;
       while(a.getPlayhead()<target.t&&performance.now()<limit)await new Promise(r=>setTimeout(r,2));
       if(a.getPlayhead()<target.t)throw Error("audio clock did not reach "+target.t);
       const before=a.getStatus().hits, beforeNodes=window.__stage010WebAudio.length;
       document.querySelector('#pads .taphit[data-lane="'+lane+'"]').dispatchEvent(
        new PointerEvent("pointerdown",{bubbles:true,cancelable:true,pointerType:"touch"}));
       const after=a.getStatus().hits;
       const sounds=a.getAudioEvents();
       return {targetTime:target.t,playhead:a.getPlayhead(),before,after,
        nodes:window.__stage010WebAudio.slice(beforeNodes),
        hitSound:sounds.filter(e=>e.source==="hit"&&e.part===a.getInstrument()&&e.lane===lane).at(-1),
        badAutoSelected:sounds.filter(e=>e.source==="auto"&&e.part===a.getInstrument()),
        background:sounds.filter(e=>e.source==="auto"&&e.part!=="melody").map(e=>e.part),
        melody:sounds.filter(e=>e.source==="auto"&&e.part==="melody"),
        nodeCount:window.__stage010WebAudio.length,logSize:sounds.length};
      },lane);
      assert.equal(observation.after,observation.before+1,instrument+" lane"+lane+" exact on-time hit");
      assert(observation.hitSound&&observation.hitSound.audible===true,"hit event must be audible "+instrument+" lane"+lane);
      assert.equal(observation.hitSound.detail,({guitar:["리프","파워코드","업스트럼","고음 리프"],
       drums:["킥","스네어","하이햇","탐"],bass:["루트","5도","옥타브"],keys:["저음","화음1","화음2","멜로디","고음"]})[instrument][lane]);
      assert(observation.nodes.length>=1,"real Web Audio voice source missing "+instrument+" lane"+lane);
      assert.equal(observation.badAutoSelected.length,0,"selected part auto-played "+instrument);
      assert(observation.melody.length>=1,"original melody not playing under hit "+instrument);
      assert(observation.background.length>=1,"no background instrumental ensemble "+instrument);
      assert(observation.logSize<=384,"audio events must stay bounded");
      actual.push({lane,timingErrorMs:Math.round((observation.playhead-observation.targetTime)*1000),
       nodes:observation.nodes.map(x=>x.kind==="noise"?"noise":x.type),
       event:observation.hitSound,autoEnsemble:[...new Set(observation.background)].sort()});
      hitTotal++;
     }
     // Distinct four guitar/drum voices verified through node type, polyphony and strum offsets.
     if(instrument==="guitar"){
      assert.deepEqual(actual[0].nodes,["sawtooth"],"guitar riff one pick");
      assert.deepEqual(actual[1].nodes,["sawtooth","sawtooth","triangle"],"power chord has fifth + octave");
      assert.deepEqual(actual[2].nodes,["sawtooth","sawtooth","sawtooth"],"upward strum staggered");
      assert.deepEqual(actual[3].nodes,["sawtooth","triangle"],"high riff overtone");
     }
     if(instrument==="drums"){
      assert.deepEqual(actual[0].nodes,["sine"],"kick sine");
      assert.deepEqual(actual[1].nodes,["triangle","noise"],"snare body/noise");
      assert.deepEqual(actual[2].nodes,["noise"],"hi-hat noise only");
      assert.deepEqual(actual[3].nodes,["triangle"],"tom pitch sweep");
     }
     if(instrument==="bass")assert(actual.every(x=>x.nodes.includes("triangle")),"bass triangle pulse");
     if(instrument==="keys")assert(actual.every(x=>x.nodes.includes("sine")),"keyboard sine harmonics");
     if(instrument==="guitar"||instrument==="drums"){
      const metrics=await page.evaluate(()=>{
       const e=window.__stage010WebAudio;
       const recent=e.slice(-12);
       return {events:recent.length,first:e.length};
      });
      assert(metrics.first>0);
     }
     const misses=await page.evaluate(()=>window.nangamSchoolbandV08.getAudioEvents().filter(x=>x.source==="miss"));
     assert(misses.length>=1,"must demonstrate that unhit notes produce silent MISS "+instrument);
     assert(misses.every(x=>!x.audible&&x.part===instrument),"MISS cannot create instrument sound");
     if(instrument==="guitar"||instrument==="drums"){
      await page.locator(".stage-wrap").screenshot({path:path.join(OUT,mode+"-"+instrument+"-ensemble.png")});
     }
     RESULTS.browsers.push({mode,instrument,passed:true,laneCount:count,hits:actual,
       silentMisses:misses.length,selectedPartAutoSuppressed:true,automaticMelody:true});
     console.log("PASS "+mode+" "+instrument+": "+count+" sounding manual lanes, separate background melody and silent missed notes");
     await page.locator("#stop").click();
    }
    // Muting a manual hit preserves scoring while suppressing *all* new sound-source starts.
    await page.locator("#mute").click();
    await page.locator('[data-inst="guitar"]').click();
    await page.locator("#start").click();
    await page.waitForFunction(()=>window.nangamSchoolbandV08.getPlayhead()>=0,{timeout:3500});
    const mute=await page.evaluate(()=>{
      const a=window.nangamSchoolbandV08;
      const before=window.__stage010WebAudio.length;
      const beforeHits=a.getStatus().hits;
      document.querySelector('#pads .taphit[data-lane="0"]').dispatchEvent(new PointerEvent("pointerdown",{bubbles:true,cancelable:true,pointerType:"touch"}));
      const ev=a.getAudioEvents().filter(x=>x.source==="hit").at(-1);
      return {before,after:window.__stage010WebAudio.length,beforeHits,afterHits:a.getStatus().hits,event:ev};
    });
    assert.equal(mute.afterHits,mute.beforeHits+1,"muted scoring still works");
    assert.equal(mute.after,mute.before,"muted hit must create no Web Audio source");
    assert.equal(mute.event?.audible,false,"muted log must indicate inaudible");
    await page.locator("#stop").click();
    RESULTS.browsers.push({mode,instrument:"mute",passed:true,mutedHitNoSound:true,mutedHitStillScores:true});
    assert.deepEqual(pageErrors,[],"runtime errors "+mode);
   }finally{await context.close();}
  }
  assert.equal(hitTotal,32,"two viewport x all 4+4+3+5 voices");
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
}
(async()=>{
 checkPure();if(process.argv.includes("--browser"))await browserTests();
 persist();console.log("PASS Stage010 event-logged ensemble and eight guitar/drum sound signatures");
})().catch(e=>{RESULTS.failure=String(e.stack||e);persist();console.error("FAIL Stage010 "+(e.stack||String(e)));process.exitCode=1});
