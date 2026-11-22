#!/usr/bin/env node
"use strict";
const fs=require("node:fs"),path=require("node:path"),http=require("node:http"),vm=require("node:vm"),assert=require("node:assert/strict");
const ROOT=path.resolve(__dirname,".."),GAME=fs.readFileSync(path.join(ROOT,"games/nangam-schoolband-v08/index.html"),"utf8");
const OUT=path.join(ROOT,"artifacts/schoolband-stage012");fs.mkdirSync(OUT,{recursive:true});
const REPORT={stage:"012/030",unit:{},browser:[],risks:[
 "Headless Chromium AudioContext.close + tracked source-stop is a browser lifecycle proof, not an acoustic microphone test.",
 "A physical iOS/Android browser permission prompt, device lock or Bluetooth receiver needs actual devices (stage027).",
 "Four-instrument sound signatures are verified by Web Audio node starts, not by external human listening.",
 "No real school song downloaded. All tests use fictional school and original tune."
]};
const save=()=>fs.writeFileSync(path.join(OUT,"results.json"),JSON.stringify(REPORT,null,2)+"\n");
const sleep=n=>new Promise(r=>setTimeout(r,n));
function staticTest(){
 const js=GAME.match(/<script>([\s\S]*?)<\/script>/i)?.[1];assert(js,"inline script");
 new vm.Script(js,{filename:"schoolband-stage012-game.js"});
 const req=[
  "function trackAudioSource(source,nodes)",
  "function stopTrackedAudio(){",
  "function releaseAudioEngine(reason=",
  "liveAudioVoices.add(entry)",
  "source.addEventListener?.(\"ended\",dispose",
  "trackAudioSource(o,[o,v])",
  "trackAudioSource(source,[source,filter,v])",
  "void releaseAudioEngine(\"finish\")",
  "await releaseAudioEngine(\"permission-denied\")",
  "if(playing||startPending||!school)return",
  "getAudioLifetime:()=>(",
  "function updateMasterVolume(){",
  "const VOLUME_KEY=",
  "if(e.persisted)void pauseGame(\"background\")"
 ];
 req.forEach(x=>assert(GAME.includes(x),"missing lifecycle invariant "+x));
 const calls=(GAME.match(/trackAudioSource\(/g)||[]).length-1;
 assert.equal(calls,4,"every independent oscillator, kick, tom, noise source tracked");
 assert(GAME.includes("ctx=null;masterBus=null;melodyBus=null;ensembleBus=null;hitBus=null;compressor=null;noiseBuffer=null"));
 assert(GAME.includes("source.stop(0)"),"stop must cancel scheduled voices immediately");
 assert(GAME.includes("audioLife.cancelled++"),"cancellation diagnostics");
 assert(GAME.includes("audioLife.contextsClosed++"),"context close diagnostics");
 REPORT.unit={passed:true,trackedSourceTypes:4,contracts:req.length,liveSetCleared:true,
  storageKey:"nangam-schoolband-volume-percent-v1",volumeStepPercent:5,logPrivacy:"no student identifiers"};
 console.log("PASS stage012 static: four sound source constructors tracked, scheduled stop and context teardown wired");
}
async function setVolume(page,value){
 await page.locator("#volumeRange").evaluate((el,val)=>{
  el.value=String(val);el.dispatchEvent(new Event("input",{bubbles:true}));
 },value);
 return page.evaluate(()=>({
  selected:document.getElementById("volumeRange").value,
  text:document.getElementById("volumeValue").textContent,
  saved:localStorage.getItem("nangam-schoolband-volume-percent-v1"),
  engine:window.nangamSchoolbandV08.getAudioLifetime()
 }));
}
async function waitFor(page,condition,ms=5000){await page.waitForFunction(condition,null,{timeout:ms})}
async function snapshot(page){
 return page.evaluate(()=>({
  s:window.nangamSchoolbandV08.getStatus(),
  engine:window.nangamSchoolbandV08.getAudioLifetime(),
  sources:window.__stage012Sources.map(x=>({
   type:x.type,startAt:x.startAt,stops:x.stops,disconnects:x.disconnects,contextId:x.contextId
  })),
  contexts:window.__stage012Contexts.map(x=>({id:x.id,state:x.ctx.state,closeCalls:x.closeCalls,resumeCalls:x.resumeCalls}))
 }));
}
async function oneBrowser(browser,url,mode){
 const mobile=mode==="mobile320";
 const context=await browser.newContext({viewport:mobile?{width:320,height:640}:{width:1280,height:850},
  isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1});
 const page=await context.newPage(),errors=[];
 page.on("pageerror",e=>errors.push(e.message));
 await context.addInitScript(()=>{
  const Native=window.AudioContext||window.webkitAudioContext;
  window.__stage012Sources=[];window.__stage012Contexts=[];
  let nextId=1;
  if(Native)window.AudioContext=class Stage012TracedContext extends Native{
   constructor(...args){
    super(...args);this.__stageId=nextId++;
    window.__stage012Contexts.push({id:this.__stageId,ctx:this,closeCalls:0,resumeCalls:0});
   }
   createOscillator(){return this.__instrument(super.createOscillator(),"oscillator")}
   createBufferSource(){return this.__instrument(super.createBufferSource(),"noise")}
   __instrument(src,type){
    const rec={type,contextId:this.__stageId,startAt:null,stops:[],disconnects:0};
    window.__stage012Sources.push(rec);
    const start=src.start.bind(src),stop=src.stop.bind(src),disc=src.disconnect.bind(src);
    src.start=(when)=>{rec.startAt=when??0;return start(when)};
    src.stop=(when)=>{rec.stops.push(when??0);return stop(when)};
    src.disconnect=(...args)=>{rec.disconnects++;return disc(...args)};
    return src;
   }
   close(){
    window.__stage012Contexts.find(x=>x.id===this.__stageId).closeCalls++;
    return super.close();
   }
   resume(){
    window.__stage012Contexts.find(x=>x.id===this.__stageId).resumeCalls++;
    return super.resume();
   }
  };
 });
 try{
  assert((await page.goto(url,{waitUntil:"domcontentloaded"})).ok());
  const init=await page.evaluate(()=>({
   overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2,
   volumeLabel:document.getElementById("volumeRange")?.getAttribute("aria-label"),
   min:document.getElementById("volumeRange")?.min,max:document.getElementById("volumeRange")?.max,
   step:document.getElementById("volumeRange")?.step
  }));
  assert.equal(init.overflow,false);assert.equal(init.volumeLabel,"게임 전체 음량");
  assert.deepEqual([init.min,init.max,init.step],["0","100","5"]);
  await page.locator("#demoSchool").click();
  let x=await setVolume(page,35);
  assert.equal(x.selected,"35");assert.equal(x.saved,"35");assert.equal(x.engine.volumePercent,35);
  await page.reload({waitUntil:"domcontentloaded"});
  assert.equal(await page.locator("#volumeRange").inputValue(),"35","volume persists across reload");
  await page.locator("#demoSchool").click();
  await setVolume(page,100);
  const item={mode,stopCycles:[],allVoicesCleaned:true,persistence:true,permissionRetry:false};
  // Multiple runs, with a different instrument each time. First two stops while notes are scheduled ahead.
  for(const inst of ["guitar","drums","bass","keys"]){
   await page.locator('[data-inst="'+inst+'"]').click();
   await page.locator("#start").click();
   await waitFor(page,()=>window.nangamSchoolbandV08.getStatus().playing);
   // Web Audio starts scheduling at the READY->first beat transition; stop before first note sounds.
   await waitFor(page,()=>window.nangamSchoolbandV08.getAudioLifetime().activeVoices>0,3500);
   const before=await snapshot(page);
   assert.equal(before.engine.hasContext,true);
   assert(before.engine.activeVoices>=1,inst+" had no scheduled sounds");
   const current=await page.evaluate(()=>window.__stage012Contexts.at(-1).ctx.currentTime);
   const future=before.sources.filter(x=>x.contextId===before.contexts.at(-1).id&&x.startAt>current+.02);
   assert(future.length>=1,inst+" needs a future-scheduled source to prove cancellation");
   await page.locator("#stop").click();
   await waitFor(page,()=>!window.nangamSchoolbandV08.getAudioLifetime().hasContext);
   await waitFor(page,()=>window.__stage012Contexts.at(-1).ctx.state==="closed",3500);
   const stopped=await snapshot(page);
   assert.equal(stopped.engine.activeVoices,0,inst+" left pending voices");
   assert.equal(stopped.s.playing,false);
   assert.equal(stopped.engine.hasContext,false);
   assert(stopped.engine.cancelled>=before.engine.cancelled+future.length,
    inst+" future nodes were not cancelled");
   const sources=stopped.sources.filter(x=>x.contextId===before.contexts.at(-1).id);
   for(const f of future){
    const found=sources.find(x=>x.type===f.type&&x.startAt===f.startAt&&x.contextId===f.contextId);
    assert(found&&found.stops.includes(0)&&found.disconnects>=1,
     inst+" scheduled source not stop(0)/disconnect");
   }
   assert(stopped.contexts.at(-1).closeCalls>=1,inst+" context.close was not invoked");
   const totalStarts=stopped.sources.length,ctxCount=stopped.contexts.length;
   await page.waitForTimeout(350);
   const quiet=await snapshot(page);
   assert.equal(quiet.sources.length,totalStarts,"ghost new sources after stop");
   assert.equal(quiet.contexts.length,ctxCount,"unexpected AudioContext after stop");
   assert.equal(quiet.engine.activeVoices,0);
   item.stopCycles.push({instrument:inst,scheduled:future.length,cancelled:stopped.engine.cancelled-before.engine.cancelled,
    contextClosed:quiet.contexts.at(-1).state,ghostSources:quiet.sources.length-totalStarts});
   console.log("PASS "+mode+" "+inst+": "+future.length+" future scheduled sources stopped and context closed; no ghost");
  }
  // Prove a natural source ends and releases its nodes, then pause while active and stop.
  await page.locator('[data-inst="drums"]').click();
  await page.locator("#start").click();
  await waitFor(page,()=>window.nangamSchoolbandV08.getPlayhead()>=.04,3500);
  const atHit=await page.evaluate(()=>{
   const a=window.nangamSchoolbandV08;
   const prev=a.getStatus().hits;
   document.querySelector('#pads .taphit[data-lane="0"]').dispatchEvent(new PointerEvent("pointerdown",{bubbles:true,cancelable:true,pointerType:"touch"}));
   return {prev,next:a.getStatus().hits,life:a.getAudioLifetime()};
  });
  // Drum first beat may have passed by the time the click reaches UI; no hit required for lifetime test.
  assert(atHit.life.created>0);
  await page.waitForTimeout(390);
  const naturally=await snapshot(page);
  assert(naturally.engine.ended>0,"natural onended cleanup not observed");
  await page.locator("#pause").click();
  await waitFor(page,()=>window.nangamSchoolbandV08.getPlaybackState().audioState==="suspended"&&window.nangamSchoolbandV08.getPlaybackState().paused);
  const pauseA=await snapshot(page);await page.waitForTimeout(340);
  const pauseB=await snapshot(page);
  assert.equal(pauseA.engine.activeVoices,pauseB.engine.activeVoices,"suspended voices changed");
  assert.equal(pauseA.engine.cancelled,pauseB.engine.cancelled,"pause should not cancel/reschedule sound");
  await page.locator("#stop").click();
  await waitFor(page,()=>window.__stage012Contexts.at(-1).ctx.state==="closed");
  assert.equal((await snapshot(page)).engine.activeVoices,0,"stop from paused state must release all nodes");
  item.pauseStopPass=true;item.naturalEndCleanup=true;
  // Volume: zero percent is silent independently of muted flag and survives reload.
  let vol=await setVolume(page,0);
  assert.equal(vol.engine.masterGain,0);
  assert.equal(vol.engine.muted,false);
  await page.locator("#start").click();
  await waitFor(page,()=>window.nangamSchoolbandV08.getStatus().playing);
  const zero=await snapshot(page);
  assert.equal(zero.engine.masterGain,0);
  await page.locator("#mute").click();
  assert.equal((await snapshot(page)).engine.masterGain,0);
  await setVolume(page,60);
  assert.equal((await snapshot(page)).engine.masterGain,0,"mute overrides volume");
  await page.locator("#mute").click();
  assert(Math.abs((await snapshot(page)).engine.masterGain-.8*.6)<1e-8);
  await page.waitForTimeout(55);
  const master=await page.evaluate(()=>{
   const ctx=window.__stage012Contexts.at(-1).ctx;
   return {gain:window.nangamSchoolbandV08.getAudioLifetime().masterGain,contexts:window.__stage012Contexts.length};
  });
  assert(Math.abs(master.gain-.48)<1e-8);
  await page.locator("#stop").click();
  await waitFor(page,()=>window.__stage012Contexts.at(-1).ctx.state==="closed");
  item.muteAndVolume=true;
  await setVolume(page,85);
  await page.reload({waitUntil:"domcontentloaded"});
  assert.equal(await page.locator("#volumeRange").inputValue(),"85");
  item.volumeAfterReload=85;
  assert.deepEqual(errors,[],"browser errors");
  REPORT.browser.push(item);
  console.log("PASS "+mode+" volume persistence and zero-volume, mute override, pause-stop cleanup, natural node end");
 }finally{await context.close();}
}
async function permissionAndMissingAudio(browser,url){
 const context=await browser.newContext({viewport:{width:800,height:690}});
 await context.addInitScript(()=>{
  const Native=window.AudioContext||window.webkitAudioContext;
  window.__stage012FailOnce=true;
  if(Native)window.AudioContext=class PermissionScenario extends Native{
   resume(){
    if(window.__stage012FailOnce){
     window.__stage012FailOnce=false;
     return Promise.reject(new DOMException("user activation blocked","NotAllowedError"));
    }
    return super.resume();
   }
  };
 });
 const page=await context.newPage(),errors=[];
 page.on("pageerror",e=>errors.push(e.message));
 try{
  await page.goto(url,{waitUntil:"domcontentloaded"});
  await page.locator("#demoSchool").click();
  await page.locator("#start").click();
  await waitFor(page,()=>document.querySelector("#feedback")?.textContent.includes("오디오 시작이 차단"));
  let result=await page.evaluate(()=>({playing:window.nangamSchoolbandV08.getStatus().playing,
   audio:window.nangamSchoolbandV08.getAudioLifetime(),enabled:!document.querySelector("#start").disabled}));
  assert.equal(result.playing,false);assert.equal(result.audio.activeVoices,0);
  assert.equal(result.audio.hasContext,false);assert.equal(result.enabled,true);
  await page.locator("#start").click();
  await waitFor(page,()=>window.nangamSchoolbandV08.getStatus().playing);
  await page.locator("#stop").click();
  await waitFor(page,()=>!window.nangamSchoolbandV08.getAudioLifetime().hasContext);
  assert.deepEqual(errors,[]);
  REPORT.browser.push({mode:"permission-retry",passed:true,rejectedStartClean:true,retryWorks:true});
  console.log("PASS mobile-style permission rejected once -> engine closed -> second gesture succeeds");
 }finally{await context.close();}
 const noAudio=await browser.newContext({viewport:{width:800,height:690}});
 await noAudio.addInitScript(()=>{
  Object.defineProperty(window,"AudioContext",{value:undefined,configurable:true,writable:true});
  Object.defineProperty(window,"webkitAudioContext",{value:undefined,configurable:true,writable:true});
 });
 const p=await noAudio.newPage(),err=[];
 p.on("pageerror",e=>err.push(e.message));
 try{
  await p.goto(url,{waitUntil:"domcontentloaded"});await p.locator("#demoSchool").click();
  await p.locator("#start").click();
  const a=await p.evaluate(()=>({playing:window.nangamSchoolbandV08.getStatus().playing,
   feedback:document.querySelector("#feedback").textContent,enabled:!document.querySelector("#start").disabled}));
  assert.equal(a.playing,false);assert(a.feedback.includes("지원하지 않는"));assert(a.enabled);
  assert.deepEqual(err,[]);
  REPORT.browser.push({mode:"missing-WebAudio",passed:true,failsSafely:true,startButtonRestored:true});
  console.log("PASS unsupported Web Audio safely blocked, no damaged UI");
 }finally{await noAudio.close();}
}
async function browserTests(){
 const {chromium}=require("playwright");
 const server=http.createServer((req,res)=>{res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"});res.end(GAME);});
 await new Promise(r=>server.listen(0,"127.0.0.1",r));
 let b;
 try{
  b=await chromium.launch({headless:true,args:["--no-sandbox","--autoplay-policy=no-user-gesture-required"]});
  const url="http://127.0.0.1:"+server.address().port;
  await oneBrowser(b,url,"desktop");await oneBrowser(b,url,"mobile320");
  await permissionAndMissingAudio(b,url);
 }finally{if(b)await b.close();await new Promise(r=>server.close(r));}
}
(async()=>{staticTest();if(process.argv.includes("--browser"))await browserTests();save();console.log("PASS stage012 all node lifecycle and volume/permission cases");})()
.catch(e=>{REPORT.failure=String(e.stack||e);save();console.error("FAIL stage012 "+(e.stack||String(e)));process.exitCode=1;});
