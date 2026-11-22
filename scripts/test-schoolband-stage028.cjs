#!/usr/bin/env node
"use strict";
// Stage028: Visual-only performance/accessibility preflight, NEVER audio/playfeel.
// This is NOT a substitute for real-device FPS/CPU/heap measurements during play.
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),assert=require("node:assert/strict"),http=require("node:http");
const ROOT=path.resolve(__dirname,".."),HTML=fs.readFileSync(path.join(ROOT,"games/nangam-schoolband-v08/index.html"),"utf8");
const SRC=HTML.match(/<script>([\s\S]*?)<\/script>/)?.[1];assert(SRC);new vm.Script(SRC);
const begin=SRC.indexOf("// Stage028: rendering-throttle choices are pure"),end=SRC.indexOf("const FX_PERF=",begin);
assert(begin>=0&&end>begin,"actual stage028 visual model must exist");
const sandbox=vm.createContext({});
vm.runInContext(SRC.slice(begin,end)+";globalThis.M={visualFrameEligible,visualSampleStats,recordVisualDraw,visualDrawSamples};",sandbox);
const M=sandbox.M;let checks=0;
function eq(actual,expected,label){assert.equal(actual,expected,label);checks++;}
for(const t of [0,1,10,16,31,32,33,100]){
 eq(M.visualFrameEligible(false,t,0),true,"full always draws "+t);
 eq(M.visualFrameEligible(true,t,0),t>=32,"low-power budget "+t);
}
eq(M.visualFrameEligible(true,100,90),false,"low-power skip inside budget");
eq(M.visualFrameEligible(true,100,60),true,"low-power render outside budget");
eq(M.visualFrameEligible(true,NaN,0),false,"reject invalid wall time");
eq(M.visualFrameEligible(true,30,NaN),false,"reject invalid last frame time");
eq(M.visualSampleStats([]),null,"empty sample");
eq(M.visualSampleStats([NaN,-1]),null,"invalid sample");
const a=M.visualSampleStats([3,1,8,2,4,5,6,7,9,10,NaN,-1]);
eq(a.samples,10,"invalid samples excluded");
eq(a.avgMs,5.5,"average");
eq(a.p95Ms,10,"p95 nearest rank");
eq(a.maxMs,10,"peak");
for(let i=0;i<180;i++)M.recordVisualDraw(i+0.25);
eq(M.visualDrawSamples.length,120,"bounded sample cap");
eq(M.visualDrawSamples[0],60.25,"ring discards oldest");
eq(M.visualDrawSamples.at(-1),179.25,"ring preserves newest");
assert(HTML.includes('.ux-step-card:focus{outline:2px solid #d5c9ff;outline-offset:3px}'));checks++;
assert(HTML.includes('html[data-low-power-fx="true"] .taphit.pressed,html[data-reduced-fx="true"] .taphit.pressed{transform:none}'));checks++;
assert(HTML.includes('@media(prefers-reduced-motion:reduce){.taphit.pressed{transform:none}}'));checks++;
assert(HTML.includes('if(visualFrameEligible(lowPowerFx,frameWall,FX_PERF.lastDrawWall)){'));checks++;
assert(HTML.includes('sampledDraw();FX_PERF.lastDrawWall=frameWall;FX_PERF.renderedFrames++'));checks++;
assert(HTML.includes('FX_PERF.judgementFrames++'));checks++;
assert(HTML.includes('getStaticVisualBenchmark:staticVisualBenchmark'));checks++;
assert(HTML.includes('getVisualTimingStats:()=>visualSampleStats(visualDrawSamples)'));checks++;
assert(HTML.includes('id="largeText"')&&HTML.includes('id="highContrast"')&&HTML.includes('id="reduceFx"')&&HTML.includes('id="lowPowerFx"'));checks++;
assert(HTML.includes('const REGISTERED_ANTHEMS=Object.freeze({});')&&HTML.includes('const PLAYABLE_SCHOOL_CHARTS=Object.freeze({});'));checks++;
assert(!HTML.includes('fetch(API,{method:"POST"'));checks++;
console.log("PASS stage028 static: "+checks+" visual-frame policy, focus ring, reduced effects, school-song locks; no audio.");
if(process.argv.includes("--browser"))(async()=>{
 const {chromium}=require("playwright");
 const server=http.createServer((req,res)=>{
  if(req.url?.startsWith("/charts/school-homepages.v1.json")){
   res.writeHead(200,{"content-type":"application/json"});
   res.end(JSON.stringify({schema_version:1,count:1,homepages:{"mock-028":"https://school.example.org/"}}));
   return;
  }
  res.writeHead(200,{"content-type":"text/html; charset=utf-8"});res.end(HTML);
 });
 await new Promise(done=>server.listen(0,"127.0.0.1",done));
 const report={stage:"028",mode:"no-audio static-canvas-and-DOM",cases:[],limits:{
  physicalDevice:false,activeGameFPS:false,audio:false,poweredCPU:false,realMemoryPeak:false}};
 let browser;
 try{
  browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
  for(const device of [
   {name:"desktop",width:1280,height:800},
   {name:"mobile",width:390,height:844},
   {name:"narrow",width:320,height:640}
  ]){
   const context=await browser.newContext({viewport:{width:device.width,height:device.height},
    isMobile:device.width<=390,hasTouch:device.width<=390,
    reducedMotion:"reduce"});
   const page=await context.newPage(),errors=[],writes=[];
   page.on("pageerror",e=>errors.push(e.message));
   page.on("request",req=>{if(!["GET","HEAD","OPTIONS"].includes(req.method()))writes.push(req.method())});
   await page.addInitScript(()=>{
    window.AudioContext=class ForbiddenAudio{constructor(){throw Error("STAGE028_AUDIO_FORBIDDEN")}};
    window.webkitAudioContext=window.AudioContext;
   });
   await page.goto("http://127.0.0.1:"+server.address().port);
   assert.equal(await page.locator("#start").isDisabled(),true);
   const initial=await page.evaluate(()=>window.nangamSchoolbandV08.getStaticVisualBenchmark(15));
   assert.equal(initial.available,false,"unselected school shouldn't render benchmark");
   await page.locator("#demoSchool").click();
   const heapBefore=await page.evaluate(()=>Number.isFinite(performance.memory?.usedJSHeapSize)?performance.memory.usedJSHeapSize:null);
   const visible=await page.evaluate(()=>({
    selected:window.nangamSchoolbandV08.getSelected(),
    summary:window.nangamSchoolbandV08.getStaticVisualBenchmark(40),
    stats:window.nangamSchoolbandV08.getVisualTimingStats(),
    beforeScore:window.nangamSchoolbandV08.getStatus().score,
    beforeKey:window.nangamSchoolbandV08.getBestRecordKey()
   }));
   assert(visible.selected&&visible.beforeKey);
   assert.equal(visible.summary.available,true);
   assert.equal(visible.summary.kind,"static_canvas_draw_only");
   assert.equal(visible.summary.samples,40);
   assert(visible.summary.avgMs>=0&&visible.summary.p95Ms>=0);
   assert(visible.stats.samples>=40&&visible.stats.samples<=120,"samples bounded");
   await page.locator("#lowPowerFx").check();
   await page.locator("#reduceFx").check({force:true}).catch(async()=>{
    // The OS reduced-motion preference can lock this checkbox as checked.
    assert.equal(await page.locator("#reduceFx").isChecked(),true);
   });
   await page.locator("#highContrast").check();
   await page.locator("#largeText").check();
   const heapAfter=await page.evaluate(()=>Number.isFinite(performance.memory?.usedJSHeapSize)?performance.memory.usedJSHeapSize:null);
   const computed=await page.evaluate(()=>({
    fx:window.nangamSchoolbandV08.getPerformanceFx(),
    ui:window.nangamSchoolbandV08.getMobileUiState(),
    focusCss:getComputedStyle(document.getElementById("stepInstrument")).outlineStyle,
    tapTransform:getComputedStyle(document.querySelector("#pads .taphit")).transform,
    bodyWidth:document.documentElement.scrollWidth,viewWidth:innerWidth,
    score:window.nangamSchoolbandV08.getStatus().score,
    key:window.nangamSchoolbandV08.getBestRecordKey()
   }));
   assert.equal(computed.fx.mode,"reduced");
   assert.equal(computed.fx.vibrationEnabled,false);
   assert.equal(computed.ui.highContrast,true);
   assert.equal(computed.ui.largeText,true);
   assert.equal(computed.score,visible.beforeScore,"visual options must not alter score");
   assert.equal(computed.key,visible.beforeKey,"visual options must not alter best-score identity");
   assert(computed.bodyWidth<=computed.viewWidth+2,"unexpected horizontal overflow");
   await page.locator("#stepInstrument").focus();
   const outline=await page.locator("#stepInstrument").evaluate(el=>getComputedStyle(el).outlineStyle);
   assert.equal(outline,"solid","stage focus indicator must remain visible");
   const firstPad=page.locator("#pads .taphit").first();
   await firstPad.evaluate(el=>el.classList.add("pressed"));
   const old=await firstPad.evaluate(el=>getComputedStyle(el).transform);
   assert(old==="none"||old.startsWith("matrix(1, 0, 0, 1"),"reduced motion pressed transform is off");
   await firstPad.evaluate(el=>el.classList.remove("pressed"));
   assert.equal(await page.locator("#songAnthem").isDisabled(),true);
   assert.equal(await page.locator("#songVolleyball").isEnabled(),true);
   assert.deepEqual(errors,[],"browser JS errors");
   assert.deepEqual(writes,[],"no server score/identity POST");
   report.cases.push({device:device.name,viewport:device.width+"x"+device.height,
    draw:visible.summary,visualBudgetTargetMs:16.7,
    staticDrawP95BudgetMet:visible.summary.p95Ms<=16.7,
    heapSampleAvailable:heapBefore!==null&&heapAfter!==null,
    heapDeltaBytes:heapBefore!==null&&heapAfter!==null?heapAfter-heapBefore:null,
    scrollWidth:computed.bodyWidth,viewportWidth:computed.viewWidth,
    highContrast:true,largeText:true,reducedMotion:true,lowPower:true,scoreUnchanged:true,
    noAudioStarted:true});
   await context.close();
  }
  const output=path.join(ROOT,"artifacts/schoolband-stage028");
  fs.mkdirSync(output,{recursive:true});
  fs.writeFileSync(path.join(output,"visual-preflight-report.json"),JSON.stringify(report,null,2)+"\n");
  console.log("PASS stage028 visual-only DOM and static canvas:",JSON.stringify(report.cases));
 }finally{
  await browser?.close();await new Promise(done=>server.close(done));
 }
})().catch(e=>{console.error(e);process.exitCode=1});
