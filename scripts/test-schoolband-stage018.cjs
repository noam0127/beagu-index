#!/usr/bin/env node
"use strict";
const fs=require("node:fs"),path=require("node:path"),http=require("node:http"),vm=require("node:vm"),assert=require("node:assert/strict");
const ROOT=path.resolve(__dirname,".."),HTML=fs.readFileSync(path.join(ROOT,"games/nangam-schoolband-v08/index.html"),"utf8");
const OUT=path.join(ROOT,"artifacts/schoolband-stage018");fs.mkdirSync(OUT,{recursive:true});
const RESULTS={stage:"018/030",unit:{},browser:[],limitations:[
 "Chromium 4x CPU emulation is not a physical phone battery, thermal, or DSP measurement.",
 "The accelerated audio currentTime in tests proves deterministic judgement, not acoustic hardware latency.",
 "30fps is a visual budget, not a guaranteed hardware rate. All judgement and Web Audio calls remain untrottled.",
 "Actual physical iOS/Android haptic feedback, speaker listening, and screen readers require the separate stage027 device check.",
 "No copyrighted school songs or private Supabase data used."
]};
const save=()=>fs.writeFileSync(path.join(OUT,"results.json"),JSON.stringify(RESULTS,null,2)+"\n");
function sourceTest(){
 const js=HTML.match(/<script>([\s\S]*?)<\/script>/i)?.[1];assert(js);new vm.Script(js);
 const strings=['id="lowPowerFx"','id="fxModeStatus"',"FX_PERF.judgementFrames++",
  "FX_PERF.skippedVisualFrames++","if(!lowPowerFx||frameWall-FX_PERF.lastDrawWall>=32)",
  "lowPowerFx?12:PARTICLE_LIMIT","getPerformanceFx:()=>(",
  "vibrationEnabled&&!motionReduced()&&!lowPowerFx",
  'clockSource:"AudioContext.currentTime"'];
 strings.forEach(x=>assert(HTML.includes(x),"source contract "+x));
 assert(js.indexOf("isNoteMissed(n.t,correctedNow,idx)")<js.indexOf("if(!lowPowerFx||frameWall-FX_PERF.lastDrawWall>=32)"));
 RESULTS.unit={passed:true,renderThresholdMs:32,lowParticleCap:12,judgementAudioClockSeparateFromVisuals:true,contracts:strings.length};
 console.log("PASS 018 static: real score clock not throttled, only costly visual canvas paints");
}
async function browserTest(){
 const {chromium}=require("playwright");
 const srv=http.createServer((req,res)=>{res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"});res.end(HTML);});
 await new Promise(r=>srv.listen(0,"127.0.0.1",r));
 let browser;
 try{
  browser=await chromium.launch({headless:true,args:["--no-sandbox","--autoplay-policy=no-user-gesture-required"]});
  for(const mode of ["desktop1280","mobile320"]){
   const mobile=mode==="mobile320";
   const c=await browser.newContext({viewport:mobile?{width:320,height:640}:{width:1280,height:850},
    isMobile:mobile,hasTouch:mobile,reducedMotion:"no-preference",deviceScaleFactor:1});
   await c.addInitScript(()=>{
    window.__testClock=0;window.__vibes=[];
    const Native=window.AudioContext||window.webkitAudioContext;
    if(Native)window.AudioContext=class ClockShim extends Native{get currentTime(){return window.__testClock}};
    try{Object.defineProperty(navigator,"vibrate",{configurable:true,value:n=>{window.__vibes.push(n);return true}})}catch(_){}
   });
   const p=await c.newPage(),errors=[];p.on("pageerror",e=>errors.push(e.message));
   try{
    assert((await p.goto("http://127.0.0.1:"+srv.address().port,{waitUntil:"domcontentloaded"})).ok());
    await p.locator("#demoSchool").click();
    for(const inst of ["guitar","drums","bass","keys"]){
     await p.locator('[data-inst="'+inst+'"]').click();
     const g=await p.evaluate(()=>({
      n:document.querySelectorAll("#pads .taphit").length,
      overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+1}));
     assert.equal(g.n,{guitar:4,drums:4,bass:3,keys:5}[inst]);assert(!g.overflow);
    }
    await p.locator('[data-inst="guitar"]').click();
    const scores=[];
    for(const fx of ["full","low","reduced"]){
     await p.locator("#reduceFx").setChecked(fx==="reduced");
     await p.locator("#lowPowerFx").setChecked(fx==="low");
     if(fx!=="reduced")await p.locator("#vibrationFx").check();
     const state=await p.evaluate(()=>({
      fx:window.nangamSchoolbandV08.getPerformanceFx(),
      prefs:JSON.parse(localStorage.getItem("nangam-band-fx-v1"))}));
     assert.equal(state.fx.mode,fx);
     assert.equal(state.fx.maxParticles,fx==="low"?12:60);
     assert.equal(state.fx.vibrationEnabled,fx==="full");
     assert.equal(state.prefs.lowPower,fx==="low");
     await p.evaluate(()=>{window.__testClock=0;window.__vibes.length=0});
     await p.locator("#start").click();
     await p.waitForFunction(()=>window.nangamSchoolbandV08.getStatus().playing,null,{timeout:4000});
     await p.waitForTimeout(650);
     const counts=await p.evaluate(()=>window.nangamSchoolbandV08.getPerformanceFx());
     assert(counts.judgementFrames>=8,"rAF judgement must keep running in "+fx);
     if(fx==="low"){
      assert(counts.skippedVisualFrames>0,"low mode must skip canvas paints");
      assert(counts.judgementFrames>counts.renderedFrames);
     }else assert.equal(counts.skippedVisualFrames,0);
     const devtools=await c.newCDPSession(p);
     await devtools.send("Emulation.setCPUThrottlingRate",{rate:4});
     const note=await p.evaluate(()=>{
      const a=window.nangamSchoolbandV08;
      return {first:a.getChart().find(n=>n.lane===0),key:a.getLanes()[0].key};
     });
     assert(note.first);
     await p.evaluate(t=>{window.__testClock=1.05+t},note.first.t);
     await p.keyboard.press(note.key.toLowerCase());
     const hit=await p.evaluate(()=>({
      game:window.nangamSchoolbandV08.getStatus(),
      fx:window.nangamSchoolbandV08.getPerformanceFx(),
      sound:window.nangamSchoolbandV08.getAudioEvents().filter(e=>e.source==="hit"),
      vib:window.__vibes
     }));
     await devtools.send("Emulation.setCPUThrottlingRate",{rate:1});await devtools.detach();
     assert.equal(hit.game.hits,1,"perfect hit under CPU pressure in "+fx);
     assert.equal(hit.game.score,1005,"PERFECT scoring parity in "+fx);
     assert.equal(hit.sound.length,1);
     assert.equal(hit.vib.length>0,fx==="full","vibration only full FX");
     assert(hit.fx.particleCount<=hit.fx.maxParticles);
     if(fx==="reduced")assert.equal(hit.fx.particleCount,0);
     await p.locator("#stepPlay").screenshot({path:path.join(OUT,mode+"-"+fx+"-fx.png")});
     await p.locator("#stop").click();
     await p.waitForFunction(()=>!window.nangamSchoolbandV08.getStatus().playing);
     scores.push(hit.game.score);
     RESULTS.browser.push({viewport:mode,fx,passed:true,rafJudgements:counts.judgementFrames,
      canvasDraws:counts.renderedFrames,skippedVisualFrames:counts.skippedVisualFrames,
      hits:hit.game.hits,score:hit.game.score,vibrationCalls:hit.vib.length,
      particleCount:hit.fx.particleCount,cpuThrottle:4});
     console.log("PASS "+mode+"/"+fx+" judgement="+counts.judgementFrames+" visual="+counts.renderedFrames+
      " skipped="+counts.skippedVisualFrames+" score="+hit.game.score);
    }
    assert.deepEqual(scores,[1005,1005,1005]);
    await p.locator("#reduceFx").uncheck();
    await p.locator("#lowPowerFx").check();
    await p.locator("#volumeRange").evaluate(el=>{el.value="45";el.dispatchEvent(new Event("input",{bubbles:true}))});
    await p.reload({waitUntil:"domcontentloaded"});
    const persisted=await p.evaluate(()=>({
      perf:window.nangamSchoolbandV08.getPerformanceFx(),
      low:document.getElementById("lowPowerFx").checked,
      volume:document.getElementById("volumeRange").value}));
    assert(persisted.low);assert.equal(persisted.perf.mode,"low");assert.equal(persisted.volume,"45");
    assert.deepEqual(errors,[]);
   }finally{await c.close();}
  }
 }finally{if(browser)await browser.close();await new Promise(r=>srv.close(r));}
}
(async()=>{sourceTest();if(process.argv.includes("--browser"))await browserTest();save();console.log("PASS Stage018 accessible visual and power modes");})()
.catch(e=>{RESULTS.failure=String(e.stack||e);save();console.error("FAIL Stage018 "+(e.stack||String(e)));process.exitCode=1;});
