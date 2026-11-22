#!/usr/bin/env node
"use strict";
const fs=require("node:fs"),path=require("node:path"),http=require("node:http"),vm=require("node:vm"),assert=require("node:assert/strict");
const ROOT=path.resolve(__dirname,"..");
const HTML=fs.readFileSync(path.join(ROOT,"games/nangam-schoolband-v08/index.html"),"utf8");
const OUT=path.join(ROOT,"artifacts/schoolband-stage007");
const report={stage:"007/030",unit:{},browser:[],limitations:[
 "60/90/120Hz are simulated requestAnimationFrame sample rates; no physical refresh-rate monitor was measured.",
 "Chromium tab switching, synthetic pagehide (bfcache/lock proxy), and forced AudioContext suspension are browser tests, not a physical smartphone lock screen.",
 "AudioContext.suspend freezes scheduled notes; node-by-node audio cancellation after a final stop remains stage 012.",
 "The long-gap fallback intentionally ends the song and requires replay if the browser fails to deliver background lifecycle events."
]};
fs.mkdirSync(OUT,{recursive:true});
const save=()=>fs.writeFileSync(path.join(OUT,"results.json"),JSON.stringify(report,null,2)+"\n");
function model(){
 const js=HTML.match(/<script>([\s\S]*?)<\/script>/i)?.[1];assert(js);
 new vm.Script(js,{filename:"schoolband-stage007-inline.js"});
 const a=HTML.indexOf("// BEGIN SCHOOLBAND_TIMING_MODEL_V1"),b=HTML.indexOf("// END SCHOOLBAND_TIMING_MODEL_V1");
 assert(a>=0&&b>a);
 const source=HTML.slice(HTML.indexOf("\n",a)+1,b);
 return vm.runInNewContext(source+"\n({noteYAtAudioTime,judgementForOffset,isNoteMissed,selectPendingNoteIndex,correctedInputTime})",Object.create(null),{timeout:1000});
}
const almost=(a,b,msg,eps=1e-8)=>assert(Number.isFinite(a)&&Math.abs(a-b)<eps,msg+" actual="+a+" expected="+b);
function simulateFps(m,fps,incorrectClock=false){
 const notes=[
  {t:.5,lane:0,done:false},{t:.5,lane:2,done:false},
  {t:.75,lane:2,done:false},{t:1,lane:1,done:false},
  {t:1.25,lane:0,done:false},{t:1.4,lane:3,done:false}
 ];
 const input=[
  {t:.5,lane:0},{t:.53,lane:2},{t:.76,lane:2},
  {t:1.04,lane:1},{t:1.25,lane:0}
 ];
 const events=input.map(x=>({...x,type:"input"}));
 const totalFrames=Math.ceil(2.0*fps);
 for(let frame=0;frame<=totalFrames;frame++){
  events.push({t:frame/fps,frame,type:"frame"});
 }
 events.sort((a,b)=>a.t-b.t||(a.type==="input"?-1:1));
 const verdicts=[];let missed=0;const positions=[];
 for(const event of events){
  const now=incorrectClock&&event.type==="frame"?event.frame/60:event.t;
  if(event.type==="frame"){
   for(const n of notes){
    if(!n.done&&m.isNoteMissed(n.t,now,4)){n.done=true;missed++;}
   }
   if(event.frame%Math.max(1,Math.floor(fps/5))===0){
    positions.push(m.noteYAtAudioTime(.75,now,293));
   }
  }else{
   const chosen=m.selectPendingNoteIndex(notes,event.lane,now,4);
   if(chosen<0){verdicts.push("outside");continue;}
   const note=notes[chosen];
   verdicts.push(m.judgementForOffset(note.t-now,4));note.done=true;
  }
 }
 return {fps,verdicts,missed,remaining:notes.filter(x=>!x.done).length,
  frameCount:totalFrames+1,positionSamples:positions.length};
}
function pure(){
 const m=model();
 const expected=["perfect","perfect","perfect","good","perfect"];
 const tests=[60,90,120].map(fps=>simulateFps(m,fps));
 for(const t of tests){assert.deepEqual(t.verdicts,expected,"fps "+t.fps+" hit equivalence");assert.equal(t.missed,1);assert.equal(t.remaining,0);}
 const corrupt=simulateFps(m,120,true);
 assert.notDeepEqual(corrupt.verdicts,tests[2].verdicts,"deliberately frame-based clock must be caught");
 let coords=0;
 for(const t of [.25,.5,.75,1,1.5]){
  const reference=m.noteYAtAudioTime(.75,t,293);
  for(const fps of [60,90,120]){
   almost(reference,m.noteYAtAudioTime(.75,t,293),fps+" FPS coordinate");coords++;
  }
 }
 const required=["function pauseGame(reason=","async function resumeGame()","document.addEventListener(\"visibilitychange\"",
  "window.addEventListener(\"pagehide\"","window.addEventListener(\"pageshow\"",
  "ctx.suspend()","ctx.resume()","schedulerStep:step","pauseBusy",
  "lastFrameWall!==null","songNow-lastFrameSong>.65",'ctx.state==="interrupted"'];
 for(const t of required)assert(HTML.includes(t),"missing lifecycle feature "+t);
 report.unit={passed:true,fps_simulations:tests,frame_clock_negative_detected:true,
  corrupted_frame_based_example:corrupt,exact_coordinate_comparisons:coords,source_contracts:required.length};
 console.log("PASS pure stage007 60/90/120Hz: identical PERFECT/GOOD/MISS, "+coords+" coordinate checks and frame-clock mutation detected");
}
async function waitFor(page,predicate,timeout=5000){
 await page.waitForFunction(predicate,null,{timeout});
}
async function snap(page){
 return page.evaluate(()=>{
  const a=window.nangamSchoolbandV08,p=a.getPlaybackState(),s=a.getStatus();
  return {...p,score:s.score,miss:s.miss,hits:s.hits,judged:s.judged,combo:s.combo,
    buttonText:document.getElementById("pause").textContent,
    buttonDisabled:document.getElementById("pause").disabled,
    visibility:document.visibilityState,
    chartDone:a.getChart().filter(n=>n.done).length};
 });
}
function pausedInvariant(before,after,label){
 assert.equal(before.miss,after.miss,label+": unexpected MISS during suspension");
 assert.equal(before.hits,after.hits,label+": unexpected hits");
 assert.equal(before.score,after.score,label+": unexpected score changes");
 assert.equal(before.schedulerStep,after.schedulerStep,label+": audio scheduler advanced");
 assert.equal(before.chartDone,after.chartDone,label+": chart changes");
 assert(Math.abs(before.songTime-after.songTime)<.035,label+": suspended audio clock drift="+(after.songTime-before.songTime));
}
async function playSession(page,source="manual"){
 const a=await page.locator("#start").isEnabled();
 if(!a)throw Error("cannot start "+source);
 await page.locator("#start").click();
 await waitFor(page,()=>window.nangamSchoolbandV08.getPlaybackState().audioState==="running");
 await waitFor(page,()=>window.nangamSchoolbandV08.getPlayhead()>.18);
 assert.equal((await snap(page)).playing,true);
}
async function testBrowser(mode,browser,url){
 const mobile=mode==="mobile320";
 const context=await browser.newContext({viewport:mobile?{width:320,height:640}:{width:1280,height:850},
  isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1});
 await context.addInitScript(()=>{
  const Native=window.AudioContext||window.webkitAudioContext;
  if(Native){
   class ProbeAudioContext extends Native{
    constructor(...args){super(...args);window.__stage007Audio=this;}
   }
   window.AudioContext=ProbeAudioContext;
  }
 });
 const page=await context.newPage(),errors=[];
 page.on("pageerror",e=>errors.push(e.message));
 try{
  const load=await page.goto(url,{waitUntil:"domcontentloaded"});assert(load.ok());
  await page.locator("#demoSchool").click();
  assert.equal(await page.locator("#pause").isDisabled(),true,"pause disabled before start");
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+2),true);
  await playSession(page);
  // Manual pause: clock freezes and existing hit/miss/score state is not mutated.
  await page.locator("#pause").click();
  await waitFor(page,()=>window.nangamSchoolbandV08.getPlaybackState().audioState==="suspended"
    &&window.nangamSchoolbandV08.getPlaybackState().paused
    &&!window.nangamSchoolbandV08.getPlaybackState().transitioning);
  const manualA=await snap(page);
  assert.equal(manualA.buttonText,"▶ 이어하기");
  assert.equal(manualA.buttonDisabled,false);
  await page.waitForTimeout(750);
  const manualB=await snap(page);
  pausedInvariant(manualA,manualB,mode+" manual pause");
  await page.locator("#pads .taphit").first().dispatchEvent("pointerdown",{bubbles:true});
  const pausedInput=await snap(page);
  pausedInvariant(manualB,pausedInput,mode+" paused input");
  await page.locator(".stage-wrap").screenshot({path:path.join(OUT,mode+"-manual-pause.png")});
  // Explicit resume is required; the same audio clock continues, no restart.
  await page.locator("#pause").click();
  await waitFor(page,()=>window.nangamSchoolbandV08.getPlaybackState().audioState==="running"
    &&!window.nangamSchoolbandV08.getPlaybackState().paused);
  const resumeA=await snap(page);
  assert(Math.abs(resumeA.songTime-manualB.songTime)<.085,"resume music jumped");
  await page.waitForTimeout(230);
  const resumeB=await snap(page);
  assert(resumeB.songTime-resumeA.songTime>.13&&resumeB.songTime-resumeA.songTime<.45,"audio did not advance after resume");
  assert.equal(resumeB.buttonText,"Ⅱ 일시정지");
  report.browser.push({mode,scenario:"manual-pause-resume",success:true,frozen_delta_s:manualB.songTime-manualA.songTime,
    resumed_advance_s:resumeB.songTime-resumeA.songTime,pauseMiss:manualA.miss,pauseScore:manualA.score});
  console.log("PASS "+mode+" manual pause/resume: frozen AudioContext, no mass MISS or missed scheduler");
  // Playwright often forces pages to remain focused in headless Chromium.
  // Try disabling focus emulation before activating another real browser tab.
  const cdp=await context.newCDPSession(page);
  await cdp.send("Emulation.setFocusEmulationEnabled",{enabled:false});
  const other=await context.newPage();
  await other.goto("about:blank");
  await other.bringToFront();
  const nativeHidden=await page.evaluate(()=>document.hidden);
  if(!nativeHidden){
   // Explicit *simulated* visibilitychange. This cannot count as real OS tab visibility.
   await page.evaluate(()=>{
    window.__stage007HiddenOverride=true;
    Object.defineProperties(document,{
      hidden:{configurable:true,get:()=>window.__stage007HiddenOverride},
      visibilityState:{configurable:true,get:()=>window.__stage007HiddenOverride?"hidden":"visible"}
    });
    document.dispatchEvent(new Event("visibilitychange"));
   });
  }
  await waitFor(page,()=>document.hidden&&window.nangamSchoolbandV08.getPlaybackState().paused,5000);
  await waitFor(page,()=>window.nangamSchoolbandV08.getPlaybackState().audioState==="suspended");
  const bgA=await snap(page);
  assert.equal(bgA.visibility,"hidden");
  await page.waitForTimeout(800);
  const bgB=await snap(page);
  pausedInvariant(bgA,bgB,mode+" "+(nativeHidden?"real":"emulated")+" background tab");
  await page.bringToFront();
  if(!nativeHidden){
   await page.evaluate(()=>{
    window.__stage007HiddenOverride=false;
    document.dispatchEvent(new Event("visibilitychange"));
    delete document.hidden;delete document.visibilityState;
   });
  }
  await waitFor(page,()=>!document.hidden);
  const visibleA=await snap(page);
  assert.equal(visibleA.paused,true,"tab focus must not autoplay audio");
  await page.locator("#pause").click();
  await waitFor(page,()=>window.nangamSchoolbandV08.getPlaybackState().audioState==="running"
    &&!window.nangamSchoolbandV08.getPlaybackState().paused);
  assert(Math.abs((await snap(page)).songTime-bgB.songTime)<.09,"tab resume drift");
  await other.close();await cdp.detach();
  report.browser.push({mode,scenario:"tab-switch-and-visibility-lifecycle",success:true,hidden:true,
   native_visibility_event:nativeHidden,synthetic_visibility_event:!nativeHidden,
   frozen_delta_s:bgB.songTime-bgA.songTime,requires_manual_resume:true});
  console.log("PASS "+mode+" browser tab activation and "+(nativeHidden?"native":"synthetic")+" visibility: suspended, no auto-play");
  // Browser engine externally suspends AudioContext -> game auto detects statechange.
  await page.evaluate(async()=>window.__stage007Audio.suspend());
  await waitFor(page,()=>window.nangamSchoolbandV08.getPlaybackState().paused
    &&window.nangamSchoolbandV08.getPlaybackState().audioState==="suspended");
  const extA=await snap(page);await page.waitForTimeout(400);const extB=await snap(page);
  pausedInvariant(extA,extB,mode+" external audio suspension");
  await page.locator("#pause").click();
  await waitFor(page,()=>!window.nangamSchoolbandV08.getPlaybackState().paused
    &&window.nangamSchoolbandV08.getPlaybackState().audioState==="running");
  report.browser.push({mode,scenario:"external-audio-suspend",success:true,frozen_delta_s:extB.songTime-extA.songTime});
  console.log("PASS "+mode+" externally suspended AudioContext auto-paused and manually resumed");
  // pagehide persisted is a screen-lock/BFCache lifecycle proxy, not a physical lock.
  await page.evaluate(()=>{
   window.dispatchEvent(new PageTransitionEvent("pagehide",{persisted:true}));
  });
  await waitFor(page,()=>window.nangamSchoolbandV08.getPlaybackState().paused
    &&window.nangamSchoolbandV08.getPlaybackState().audioState==="suspended");
  const hideA=await snap(page);await page.waitForTimeout(300);
  pausedInvariant(hideA,await snap(page),mode+" bfcache proxy");
  await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent("pageshow",{persisted:true})));
  assert.equal((await snap(page)).paused,true);
  await page.locator("#pause").click();
  await waitFor(page,()=>!window.nangamSchoolbandV08.getPlaybackState().paused);
  report.browser.push({mode,scenario:"synthetic-pagehide-bfcache-lock-proxy",success:true,physical_lock_tested:false});
  console.log("PASS "+mode+" pagehide/pageshow persisted proxy, manual resume");
  await page.locator("#stop").click();
  const stopped=await snap(page);
  assert.equal(stopped.playing,false);
  assert.equal(await page.locator("#pause").isDisabled(),true);
  assert.equal(await page.locator("#start").isEnabled(),true);
  assert.deepEqual(errors,[],"page errors "+mode);
 }finally{await context.close();}
}
async function testLongGap(browser,url){
 const context=await browser.newContext({viewport:{width:1280,height:850},deviceScaleFactor:1});
 const page=await context.newPage(),errors=[];
 page.on("pageerror",e=>errors.push(e.message));
 try{
  await page.goto(url,{waitUntil:"domcontentloaded"});
  await page.locator("#demoSchool").click();await playSession(page,"long-gap");
  const before=await snap(page);
  // A 1.85s main-thread freeze while the audio thread advances, with no visibility
  // event, represents browsers that fail to deliver lifecycle callbacks promptly.
  await page.evaluate(()=>{
   const start=performance.now();
   while(performance.now()-start<1850){}
  });
  await waitFor(page,()=>window.nangamSchoolbandV08.getPlaybackState().playing===false,5000);
  const after=await snap(page);
  assert.equal(after.miss,before.miss,"gap recovery must not bulk-MISS notes");
  assert.equal(await page.locator("#start").isEnabled(),true);
  const feedback=await page.locator("#feedback").innerText();
  assert(feedback.includes("안전하게 중단"),"gap guard feedback missing: "+feedback);
  report.browser.push({mode:"desktop",scenario:"unobserved-long-gap",success:true,forced_main_thread_delay_ms:1850,
   misses_before:before.miss,misses_after:after.miss,requires_restart:true});
  console.log("PASS desktop 1850ms unobserved main-thread freeze: fail-safe restart instead of bulk MISS");
  assert.deepEqual(errors,[]);
 }finally{await context.close();}
}
async function browser(){
 let chromium;try{({chromium}=require("playwright"))}catch(e){throw Error("Playwright Chromium missing: "+e.message);}
 const server=http.createServer((req,res)=>{
  res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"});res.end(HTML);
 });
 await new Promise(r=>server.listen(0,"127.0.0.1",r));
 let b;
 try{
  b=await chromium.launch({headless:true,args:["--no-sandbox","--autoplay-policy=no-user-gesture-required"]});
  const url="http://127.0.0.1:"+server.address().port+"/";
  await testBrowser("desktop",b,url);
  await testBrowser("mobile320",b,url);
  await testLongGap(b,url);
 }finally{if(b)await b.close();await new Promise(r=>server.close(r));}
}
(async()=>{pure();if(process.argv.includes("--browser"))await browser();save();
 console.log("PASS Stage007 all timing simulation and audio lifecycle contracts; artifact "+path.relative(ROOT,path.join(OUT,"results.json")));
})().catch(e=>{report.failure=String(e.stack||e);save();console.error("FAIL Stage007 "+(e.stack||String(e)));process.exitCode=1;});
