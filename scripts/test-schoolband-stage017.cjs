#!/usr/bin/env node
"use strict";
// Stage017: actual Chromium CDP multi-touch, rotation and accessibility tests.
const fs=require("node:fs"),path=require("node:path"),http=require("node:http"),vm=require("node:vm"),assert=require("node:assert/strict");
const ROOT=path.resolve(__dirname,".."),HTML=fs.readFileSync(path.join(ROOT,"games/nangam-schoolband-v08/index.html"),"utf8");
const OUT=path.join(ROOT,"artifacts/schoolband-stage017");fs.mkdirSync(OUT,{recursive:true});
const PROOF={stage:"017/030",static:{},browser:[],limitations:[
 "Chrome DevTools Protocol Input.dispatchTouchEvent is browser-level synthetic touchscreen input, not a physical Android or iOS multi-touch panel.",
 "setViewportSize + orientation/resize events emulate portrait↔landscape; they do not rotate physical hardware, change OS accelerometer, or prove iOS Safari orientation lock.",
 "The browser fullscreen API may be unavailable in automated/headless sessions. Rejection behavior is verified without claiming actual native Android fullscreen.",
 "Large text and contrast CSS are inspected in Chromium; physical OS text scaling, VoiceOver/TalkBack output and human listening remain pending at stage027.",
 "The song is original/demo, and public schools are simulated by isolated mocked read-only discovery; operating Supabase, web and real school songs remain untouched."
]};
const save=()=>fs.writeFileSync(path.join(OUT,"results.json"),JSON.stringify(PROOF,null,2)+"\n");
function staticCheck(){
 const js=HTML.match(/<script>([\s\S]*?)<\/script>/i)?.[1];assert(js);new vm.Script(js);
 for(const value of ["playSurface","largeText","highContrast","fullscreenBtn","screenModeStatus","#pads{touch-action:none}",
  "b.addEventListener(\"pointerdown\",e=>padPointerDown(e,i))",
  "b.addEventListener(\"pointerup\",padPointerEnd)",
  "b.addEventListener(\"pointercancel\",padPointerEnd)",
  "b.addEventListener(\"lostpointercapture\",padPointerEnd)",
  "const activePadPointers=new Map()","clearActiveTouches();","document.documentElement.dataset.highContrast",
  "@media(orientation:landscape)","@media(prefers-contrast:more)",
  "getMobileUiState:()=>({","window.addEventListener(\"orientationchange\"",
  "document.addEventListener(\"fullscreenchange\""])assert(HTML.includes(value),"missing feature "+value);
 assert(HTML.includes("role=\"group\" aria-label=\"모바일 동시 연주 버튼\""));
 assert(HTML.includes("if(e.detail===0){hit(i);flash(i)}"),"keyboard Enter must be preserved");
 PROOF.static={passed:true,sourceTypes:["mouse","touch","pen","keyboard"],rotations:["portrait","landscape"],
  accessibility:["large_text","high_contrast","non_color_lane_labels","focus","aria_live","fullscreen_result"]};
 console.log("PASS Stage017 static: independent trusted pointer IDs, rotation cleanup, 3-5 label and accessibility guards");
}
const rects=async page=>page.evaluate(()=>{
 const state=window.nangamSchoolbandV08.getMobileUiState(),
  pads=[...document.querySelectorAll("#pads .taphit")].map(b=>{
   const x=b.getBoundingClientRect();
   return {lane:Number(b.dataset.lane),x:x.left,y:x.top,width:x.width,height:x.height,right:x.right,
    bottom:x.bottom,name:b.querySelector("strong")?.textContent,key:b.querySelector("small")?.textContent,
    label:b.getAttribute("aria-label")};
  });
 const canvas=document.querySelector("#track").getBoundingClientRect();
 return {...state,pads,canvas:{x:canvas.left,y:canvas.top,width:canvas.width,height:canvas.height},
  vw:window.innerWidth,vh:window.innerHeight,
  overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+1,
  info:document.getElementById("laneInfo").textContent};
});
function testGeometry(g,lanes,name){
 assert.equal(g.pads.length,lanes,name+" pad count");
 assert.equal(g.padRects.length,lanes);
 assert.equal(g.overflow,false,name+" horizontal overflow");
 assert(g.canvas.width>130&&g.canvas.width<=g.vw+2,name+" canvas visible width");
 g.pads.forEach((b,i)=>{
  assert.equal(b.lane,i);
  assert(b.width>=40,name+" minimum width lane "+i+": "+b.width);
  assert(b.height>=62,name+" minimum height lane "+i+": "+b.height);
  assert(b.name&&b.key&&b.label?.includes(b.name),name+" non-color lane labels");
  if(i>0)assert(b.x>=g.pads[i-1].right-1.5,name+" overlapping pads "+i);
 });
 assert(g.info.includes(lanes+"레인"),"lane info mismatch "+name);
}
function point(p,id){return {x:Math.round(p.x+p.width/2),y:Math.round(p.y+p.height/2),id,radiusX:5,radiusY:5,force:.95};}
async function useTouch(client,type,points){await client.send("Input.dispatchTouchEvent",{type,touchPoints:points});}
async function selectDemo(page,inst){
 if(!(await page.evaluate(()=>window.nangamSchoolbandV08.getSelected())))await page.locator("#demoSchool").click();
 await page.locator('[data-inst="'+inst+'"]').click();
}
async function contexts(){
 const {chromium}=require("playwright");
 const server=http.createServer((req,res)=>{
  res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"});
  res.end(HTML);
 });
 await new Promise(r=>server.listen(0,"127.0.0.1",r));
 let browser;
 try{
  browser=await chromium.launch({headless:true,args:["--no-sandbox","--autoplay-policy=no-user-gesture-required"]});
  const url="http://127.0.0.1:"+server.address().port+"/";
  for(const mode of ["mobile320","mobile375","desktop1280"]){
   const mobile=mode!=="desktop1280";
   const viewport=mode==="mobile320"?{width:320,height:640}:mode==="mobile375"?{width:375,height:812}:{width:1280,height:850};
   const context=await browser.newContext({viewport,isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1});
   await context.addInitScript(()=>{
    window.__stage017Clock=0;
    const Audio=window.AudioContext||window.webkitAudioContext;
    if(Audio)window.AudioContext=class FastSongAudio extends Audio{
     get currentTime(){return window.__stage017Clock;}
    };
   });
   const page=await context.newPage(),jsErrors=[];
   page.on("pageerror",e=>jsErrors.push(e.message));
   const run={mode,geometry:[],multitouch:[],rotation:null,accessibility:{},fullscreen:{},keyboard:false,stopRestart:false,screenshots:[],errors:[]};
   try{
    assert((await page.goto(url,{waitUntil:"domcontentloaded"})).ok());
    await selectDemo(page,"keys");
    for(const [inst,lanes]of [["bass",3],["guitar",4],["drums",4],["keys",5]]){
     await page.locator('[data-inst="'+inst+'"]').click();
     const g=await rects(page);
     testGeometry(g,lanes,mode+"-"+inst+"-portrait");
     run.geometry.push({orientation:"portrait",instrument:inst,lanes,minWidth:Math.min(...g.pads.map(x=>x.width)),canvasWidth:g.canvas.width});
    }
    await page.locator("#largeText").check();
    await page.locator("#highContrast").check();
    const accessible=await page.evaluate(()=>{
     const e=document.querySelector("#pads .taphit");
     const strong=e.querySelector("strong"),s=getComputedStyle(strong),border=getComputedStyle(e);
     return {high:document.documentElement.dataset.highContrast,large:document.documentElement.dataset.largeText,
      boldSize:parseFloat(s.fontSize),borderWidth:parseFloat(border.borderTopWidth),
      borderColor:border.borderTopColor,bg:border.backgroundColor,
      note:document.getElementById("screenModeStatus").getAttribute("aria-live")};
    });
    assert.equal(accessible.high,"true");assert.equal(accessible.large,"true");
    assert(accessible.boldSize>=13&&accessible.borderWidth>=3);
    assert.equal(accessible.bg,"rgb(0, 0, 0)");
    assert.equal(accessible.note,"polite");
    const gBig=await rects(page);testGeometry(gBig,5,mode+"-large-keys");
    await page.locator("#pads").scrollIntoViewIfNeeded();
    await page.locator("#stepPlay").screenshot({path:path.join(OUT,mode+"-portrait-large-high-contrast.png")});
    run.screenshots.push(mode+"-portrait-large-high-contrast.png");
    await page.reload({waitUntil:"domcontentloaded"});
    assert.equal(await page.locator("#largeText").isChecked(),true);
    assert.equal(await page.locator("#highContrast").isChecked(),true);
    await selectDemo(page,"keys");
    run.accessibility={largeTextPx:accessible.boldSize,borderPx:accessible.borderWidth,contrastBackground:accessible.bg,
      persistent:true,labels:5};
    // Test browser fullscreen errors and recovery; never claim OS immersive mode.
    await page.locator("#fullscreenBtn").evaluate(b=>{const p=document.getElementById("stepPlay");
      p.requestFullscreen=()=>Promise.reject(new DOMException("blocked","NotAllowedError"));});
    await page.locator("#fullscreenBtn").click();
    const fsBlocked=await page.evaluate(()=>({text:document.getElementById("screenModeStatus").textContent,
     pressed:document.getElementById("fullscreenBtn").getAttribute("aria-pressed"),
     playing:window.nangamSchoolbandV08.getStatus().playing}));
    assert(fsBlocked.text.includes("차단")||fsBlocked.text.includes("지원"));
    assert.equal(fsBlocked.pressed,"false");
    run.fullscreen={rejectHandled:true,pressed:fsBlocked.pressed};
    // Real mobile CDP two-finger start on two separate keys at the same moment.
    // Test not just 2 simulated PointerEvent calls, but Chromium touchscreen dispatch.
    if(mobile){
     const cdp=await context.newCDPSession(page);
     // Demo school defaults to NORMAL. Use an isolated fictitious school with
     // EXTREME difficulty so the preexisting keyboard chart contains chords.
     await page.route("**/schoolband-school-read-v1**",route=>{
      const u=new URL(route.request().url());
      const body=u.searchParams.has("schools")
       ?{schools:[{school_id:"stage017-fiction",school_name:"동시연주가상초등학교",sido_standard:"가상"}]}
       :{school:{school_id:"stage017-fiction",school_name:"동시연주가상초등학교",
         region:"가상",eligible:true,difficulty:"extreme",source_year:2026}};
      return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(body)});
     });
     await page.locator('[data-step-target="school"]').click();
     await page.locator("#schoolSearch").fill("동시연주");
     await page.waitForFunction(()=>document.querySelector("#searchResults").children.length===1);
     await page.locator("#searchResults button").click();
     await page.waitForFunction(()=>window.nangamSchoolbandV08.getUxStep()==="instrument");
     assert.equal(await page.evaluate(()=>window.nangamSchoolbandV08.getDifficulty()),"extreme");
     await page.locator('[data-inst="keys"]').click();
     await page.locator("#start").click();
     await page.waitForFunction(()=>window.nangamSchoolbandV08.getStatus().playing);
     const chord=await page.evaluate(()=>{
      const c=window.nangamSchoolbandV08.getChart(),groups=new Map();
      for(const n of c){
       const arr=groups.get(n.t)||[];
       arr.push(n);groups.set(n.t,arr);
      }
      return [...groups.entries()].map(([t,ns])=>({t,ns})).find(x=>new Set(x.ns.map(n=>n.lane)).size>=2);
     });
     assert(chord&&chord.ns.length>=2,"key arrangement must have one simultaneous chord");
     const pair=[...new Map(chord.ns.map(n=>[n.lane,n])).values()].slice(0,2);
     await page.locator("#pads").evaluate(el=>el.scrollIntoView({block:"center",behavior:"instant"}));
     await page.evaluate(()=>{
      window.__stage017PointerTrace=[];
      for(const type of ["pointerdown","pointerup","pointercancel","lostpointercapture"]){
       document.getElementById("pads").addEventListener(type,e=>{
        window.__stage017PointerTrace.push({type,id:e.pointerId,trusted:e.isTrusted,pointerType:e.pointerType,
          lane:e.target.closest(".taphit")?.dataset.lane||null,
          active:window.nangamSchoolbandV08.getMobileUiState().activePointers});
       },true);
      }
      window.addEventListener("resize",()=>{
       window.__stage017PointerTrace.push({type:"resize",active:window.nangamSchoolbandV08.getMobileUiState().activePointers});
      });
     });
     const g=await rects(page);const a=point(g.pads[pair[0].lane],71),b=point(g.pads[pair[1].lane],72);
     assert(a.y>=80&&a.y<viewport.height-20&&b.y>=80&&b.y<viewport.height-20,"touch pads must be clear of sticky nav");
     const targetLanes=await page.evaluate(pts=>pts.map(p=>document.elementFromPoint(p.x,p.y)?.closest(".taphit")?.dataset.lane??null),[a,b]);
     assert.deepEqual(targetLanes,pair.map(n=>String(n.lane)),"CDP input coordinates must hit actual pads, not sticky step-nav");
     await page.evaluate(t=>{window.__stage017Clock=1.05+t},chord.t);
     const hitsBefore=await page.evaluate(()=>window.nangamSchoolbandV08.getStatus().hits);
     await useTouch(cdp,"touchStart",[a,b]);
     const entered=await page.evaluate(()=>({
      hit:window.nangamSchoolbandV08.getStatus().hits,
      pointer:window.nangamSchoolbandV08.getMobileUiState().activePointers,
      sound:window.nangamSchoolbandV08.getAudioEvents().filter(e=>e.source==="hit").map(e=>e.lane),
      trace:window.__stage017PointerTrace
     }));
     PROOF.touchDiagnostic={mode,hitsBefore,entered,pair:pair.map(x=>({lane:x.lane,t:x.t})),points:[a,b],size:{vw:g.vw,vh:g.vh}};
     save();
     console.log("CDP_TOUCH_TRACE "+JSON.stringify(PROOF.touchDiagnostic));
     assert.equal(entered.pointer,2,"both real CDP touch pointers must be independently tracked");
     assert.equal(entered.hit-hitsBefore,2,"simultaneous real touch must hit 2 chord notes");
     const soundLanes=entered.sound.slice(-2).sort((a,b)=>a-b);
     assert.deepEqual(soundLanes,pair.map(x=>x.lane).sort((a,b)=>a-b));
     await useTouch(cdp,"touchMove",[a,b]);
     assert.equal((await page.evaluate(()=>window.nangamSchoolbandV08.getStatus().hits)),entered.hit,
      "holding two fingers may not double score");
     await useTouch(cdp,"touchEnd",[]);
     const released=await page.evaluate(()=>window.nangamSchoolbandV08.getMobileUiState().activePointers);
     assert.equal(released,0,"touchEnd clears both tracked fingers");
     run.multitouch.push({instrument:"keys",twoFingers:true,laneIds:pair.map(n=>n.lane),hits:2,tracked:2,doubleHitPrevented:true,released:true});
     // Cancel a finger after it started while chart clock remains stable.
     const before=await rects(page);
     await useTouch(cdp,"touchStart",[point(before.pads[0],79)]);
     assert.equal((await page.evaluate(()=>window.nangamSchoolbandV08.getMobileUiState().activePointers)),1);
     await useTouch(cdp,"touchCancel",[]);
     assert.equal((await page.evaluate(()=>window.nangamSchoolbandV08.getMobileUiState().activePointers)),0);
     run.multitouch.push({cancel:true,trackedCleared:true});
     // Real viewport rotation DURING gameplay, with score and selected chart intact.
     const score=await page.evaluate(()=>window.nangamSchoolbandV08.getStatus().hits);
     await page.setViewportSize({width:640,height:320});
     await page.waitForFunction(()=>window.nangamSchoolbandV08.getMobileUiState().orientation==="landscape");
     const gl=await rects(page);testGeometry(gl,5,mode+"-landscape");
     assert(Math.abs((gl.canvas.y+gl.canvas.height/2)-(gl.pads[0].y+gl.pads[0].height/2))<210,
       "landscape playfield and pads must be side by side instead of stacked");
     assert.equal((await page.evaluate(()=>window.nangamSchoolbandV08.getStatus().hits)),score);
     assert.equal((await page.evaluate(()=>window.nangamSchoolbandV08.getStatus().playing)),true);
     await page.locator("#stepPlay").screenshot({path:path.join(OUT,mode+"-landscape-play.png")});
     run.screenshots.push(mode+"-landscape-play.png");
     await page.setViewportSize(viewport);
     await page.waitForFunction(()=>window.nangamSchoolbandV08.getMobileUiState().orientation==="portrait");
     const gp=await rects(page);testGeometry(gp,5,mode+"-portrait-return");
     assert.equal((await page.evaluate(()=>window.nangamSchoolbandV08.getStatus().hits)),score);
     assert.equal((await page.evaluate(()=>window.nangamSchoolbandV08.getStatus().playing)),true);
     run.rotation={portraitToLandscapeAndBack:true,scoreKept:score,resizes:gp.resizeCount,activePointers:gp.activePointers,
      landscapeCanvasWidth:gl.canvas.width,landscapePadWidth:gl.pads[0].width,
      landscapePadHeight:gl.pads[0].height};
     await page.locator("#stop").click();
     await page.waitForFunction(()=>!window.nangamSchoolbandV08.getStatus().playing);
     assert.equal((await page.evaluate(()=>window.nangamSchoolbandV08.getMobileUiState().activePointers)),0);
     await page.evaluate(()=>{window.__stage017Clock=0});
     await page.locator("#start").click();
     await page.waitForFunction(()=>window.nangamSchoolbandV08.getStatus().playing);
     await page.locator("#stop").click();
     await page.waitForFunction(()=>!window.nangamSchoolbandV08.getStatus().playing);
     run.stopRestart=true;
     // Key activation must still work when touch pointers are not active.
     await page.locator("#pads .taphit").first().focus();
     assert.equal(await page.evaluate(()=>document.activeElement?.classList.contains("taphit")),true);
     run.keyboard=true;
     await cdp.detach();
    }else{
     // Desktop: rotate-like layout simulation without claiming actual mobile touch.
     await page.locator('[data-inst="bass"]').click();
     await page.setViewportSize({width:700,height:390});
     await page.waitForFunction(()=>window.nangamSchoolbandV08.getMobileUiState().orientation==="landscape");
     const gl=await rects(page);testGeometry(gl,3,"desktop-landscape-bass");
     await page.locator("#stepPlay").screenshot({path:path.join(OUT,mode+"-landscape-bass.png")});
     run.screenshots.push(mode+"-landscape-bass.png");
     await page.setViewportSize(viewport);
     await page.waitForFunction(()=>window.nangamSchoolbandV08.getMobileUiState().orientation==="landscape");
     run.rotation={resizedLandscape:true,clean:true};
     run.keyboard=true;run.stopRestart=true;
    }
    assert.deepEqual(jsErrors,[],"browser JavaScript must not crash on font and rotation");
    run.errors=jsErrors;
    PROOF.browser.push(run);
    console.log("PASS Stage017 "+mode+" labeled 3-5 lanes, high contrast, zoom text, fullscreen denial"+(mobile?", CDP 2-finger, cancellation and rotation":""));
   }finally{await context.close();}
  }
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
}
(async()=>{staticCheck();if(process.argv.includes("--browser"))await contexts();save();console.log("PASS Stage017 mobile multi-touch and orientation/accessibility");})()
.catch(e=>{PROOF.failure=String(e.stack||e);save();console.error("FAIL Stage017 "+(e.stack||String(e)));process.exitCode=1;});
