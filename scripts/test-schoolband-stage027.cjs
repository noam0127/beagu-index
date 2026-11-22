#!/usr/bin/env node
"use strict";
// 027: browser/keyboard/pointer UI mechanics. NEVER START AUDIO OR TEST SOUND.
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict"),vm=require("node:vm"),http=require("node:http");
const ROOT=path.resolve(__dirname,"..");
const GAME=fs.readFileSync(path.join(ROOT,"games/nangam-schoolband-v08/index.html"),"utf8");
const source=GAME.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert(source);new vm.Script(source);
const EXPECTED={guitar:4,drums:4,bass:3,keys:5};
assert.match(GAME,/\.taphit\{[^}]*touch-action:none/,"pads must not be captured by scroll gestures");
assert(GAME.includes('b.addEventListener("pointerdown",e=>padPointerDown(e,i))'));
for(const kind of ["pointerup","pointercancel","lostpointercapture"])
 assert(GAME.includes('b.addEventListener("'+kind+'",padPointerEnd)'));
assert(GAME.includes('if(e.detail===0){hit(i);flash(i)}'),"keyboard activation must be supported");
assert(GAME.includes('if(e.repeat||!playing||e.isComposing)return;'),"keyboard repeat gated");
assert(GAME.includes("clearActiveTouches();"),"orientation must not retain stale fingers");
assert(GAME.includes('window.addEventListener("orientationchange",scheduleResponsiveDraw'));
assert(GAME.includes('b.setAttribute("aria-label",lane[0]+" 연주, 키보드 "+lane[1])'));
assert(GAME.includes('getMobileUiState:()=>({activePointers:activePadPointers.size'));
assert(GAME.includes('getLaneCount:()=>INST[instrument].lanes.length'));
console.log("PASS stage027 static mobile/keyboard event wiring and JS parse (no sound)");
if(process.argv.includes("--browser"))(async()=>{
 const {chromium,webkit}=require("playwright");
 const site=http.createServer((req,res)=>{
  if(req.url?.startsWith("/charts/school-homepages.v1.json")){
   res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify({
    schema_version:1,count:1,homepages:{"mock-device-027":"https://school.example.org/"}
   }));return;
  }
  res.writeHead(200,{"content-type":"text/html; charset=utf-8"});res.end(GAME);
 });
 await new Promise(done=>site.listen(0,"127.0.0.1",done));
 let chrome=null,safari=null;
 const cases=[
  {label:"PC Chromium keyboard (not physical Chrome/Edge)",engine:"chromium",width:1280,height:800,isMobile:false,hasTouch:false},
  {label:"Android Chrome emulated touchscreen (not physical Android)",engine:"chromium",width:393,height:851,isMobile:true,hasTouch:true},
  {label:"iPhone Safari-equivalent WebKit emulation (not physical iPhone)",engine:"webkit",width:390,height:844,isMobile:true,hasTouch:true}
 ];
 try{
  chrome=await chromium.launch({headless:true,args:["--no-sandbox"]});
  safari=await webkit.launch({headless:true});
  for(const sample of cases){
   const browser=sample.engine==="chromium"?chrome:safari;
   const context=await browser.newContext({
    viewport:{width:sample.width,height:sample.height},
    isMobile:sample.isMobile,hasTouch:sample.hasTouch,
    deviceScaleFactor:sample.isMobile?2:1
   });
   const page=await context.newPage(),errors=[],writes=[];
   page.on("pageerror",e=>errors.push(e.message));
   page.on("request",req=>{if(!["GET","HEAD","OPTIONS"].includes(req.method()))writes.push(req.method())});
   await page.addInitScript(()=>{
    window.AudioContext=class ForbiddenAudio{constructor(){throw Error("NO_AUDIO_027")}};
    window.webkitAudioContext=window.AudioContext;
    window.__audioCheckMark="no-audio-allowed";
   });
   await page.route("**/schoolband-school-read-v1**",route=>{
    const url=new URL(route.request().url());
    const item={school_id:"mock-device-027",school_name:"검증모의초등학교",region:"부산",
      eligible:false,difficulty:null,source_year:null};
    return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(
      url.searchParams.has("schools")?{schools:[item]}:{school:item}
    )});
   });
   await page.goto("http://127.0.0.1:"+site.address().port);
   assert.equal(await page.locator("#songAnthem").isDisabled(),true);
   await page.locator("#schoolSearch").fill("검증모의");
   await page.waitForFunction(()=>document.querySelectorAll("#searchResults button").length===1);
   await page.locator("#searchResults button").click();
   await page.waitForFunction(()=>window.nangamSchoolbandV08.getSelected()?.school_id==="mock-device-027");
   assert.match(await page.locator("#schoolTier").innerText(),/NORMAL/);
   for(const [instrument,n] of Object.entries(EXPECTED)){
    await page.locator('[data-inst="'+instrument+'"]').click();
    assert.equal(await page.locator("#pads .taphit").count(),n,instrument+" lane count");
    const ui=await page.evaluate(()=>window.nangamSchoolbandV08.getMobileUiState());
    assert.equal(ui.padRects.length,n,"pad rectangles count");
    assert.equal(await page.locator("#pads").getAttribute("data-instrument"),instrument);
    const pads=page.locator("#pads .taphit");
    for(let i=0;i<n;i++){
     const button=pads.nth(i);
     assert(await button.getAttribute("aria-label"),"pad accessible name");
     assert.equal(await button.evaluate(el=>getComputedStyle(el).touchAction),"none");
    }
    assert.match(await page.locator("#track").getAttribute("aria-label"),new RegExp(n+"레인"));
    await pads.first().focus();
    await page.keyboard.press("Enter"); // focused button click, but playing=false
    assert.equal((await page.evaluate(()=>window.nangamSchoolbandV08.getStatus())).playing,false);
   }
   await page.locator('[data-inst="guitar"]').click();
   if(sample.hasTouch){
    const pad=page.locator("#pads .taphit").first();
    await pad.scrollIntoViewIfNeeded();
    const box=await pad.boundingBox();assert(box);
    await page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);
    assert.equal((await page.evaluate(()=>window.nangamSchoolbandV08.getStatus())).score,0);
   }
   if(sample.engine==="chromium"&&sample.hasTouch){
    const pads=page.locator("#pads .taphit");
    await pads.first().scrollIntoViewIfNeeded();
    const b0=await pads.nth(0).boundingBox(),b1=await pads.nth(1).boundingBox();
    const client=await context.newCDPSession(page);
    await client.send("Input.dispatchTouchEvent",{
      type:"touchStart",touchPoints:[
       {x:b0.x+b0.width/2,y:b0.y+b0.height/2,id:11},
       {x:b1.x+b1.width/2,y:b1.y+b1.height/2,id:12}
      ]
    });
    const active=await page.evaluate(()=>window.nangamSchoolbandV08.getMobileUiState().activePointers);
    assert(active>=1&&active<=2,"emulated multipointer bookkeeping");
    await client.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
    await page.waitForFunction(()=>window.nangamSchoolbandV08.getMobileUiState().activePointers===0);
   }
   const before=await page.evaluate(()=>window.nangamSchoolbandV08.getMobileUiState().resizeCount);
   const newW=sample.isMobile?844:900,newH=sample.isMobile?390:650;
   await page.setViewportSize({width:newW,height:newH});
   await page.waitForFunction(previous=>window.nangamSchoolbandV08.getMobileUiState().resizeCount>previous,before);
   const rotated=await page.evaluate(()=>window.nangamSchoolbandV08.getMobileUiState());
   assert.equal(rotated.orientation,"landscape");
   assert.equal(rotated.activePointers,0,"rotation must clear active touches");
   await page.setViewportSize({width:sample.width,height:sample.height});
   await page.waitForFunction(()=>window.nangamSchoolbandV08.getMobileUiState().orientation==="portrait"||innerWidth===1280);
   await page.locator("#largeText").check();
   await page.locator("#highContrast").check();
   const toggles=await page.evaluate(()=>window.nangamSchoolbandV08.getMobileUiState());
   assert.equal(toggles.largeText,true);assert.equal(toggles.highContrast,true);
   const overflow=await page.evaluate(()=>({
      docWidth:document.documentElement.scrollWidth,viewWidth:innerWidth,
      audio:window.__audioCheckMark
   }));
   assert(overflow.docWidth<=overflow.viewWidth+2,"horizontal overflow "+JSON.stringify(overflow));
   assert.equal(overflow.audio,"no-audio-allowed");
   assert.equal((await page.evaluate(()=>window.nangamSchoolbandV08.getStatus())).playing,false,"no real play started");
   assert.deepEqual(errors,[],"page errors");
   assert.deepEqual(writes,[],"no server POST");
   console.log("PASS stage027 "+sample.label+" 4 instruments; input/rotation/readability; no audio");
   await context.close();
  }
 }finally{
  await chrome?.close();await safari?.close();
  await new Promise(done=>site.close(done));
 }
})().catch(e=>{console.error(e);process.exitCode=1});
