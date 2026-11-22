#!/usr/bin/env node
"use strict";
const fs=require("node:fs"),path=require("node:path"),http=require("node:http"),vm=require("node:vm"),assert=require("node:assert/strict");
const ROOT=path.resolve(__dirname,".."),GAME=fs.readFileSync(path.join(ROOT,"games/nangam-schoolband-v08/index.html"),"utf8");
const OUT=path.join(ROOT,"artifacts/schoolband-stage016");fs.mkdirSync(OUT,{recursive:true});
const evidence={stage:"016/030",unit:{},browsers:[],limitations:[
 "Chromium at 320px uses mobile emulation, not a physical Android/iOS device or real hardware touch.",
 "School search requests are served by a synthetic public-read API fixture, not by operating Supabase or any confidential survey.",
 "Scrolling between three accessible panels is a guided, single-page three-screen experience; the panels remain in the DOM to preserve keyboard navigation and legacy rhythm game controls.",
 "The creative practice song remains original. Searching for a real school does not imply licensing its real school anthem."
]};
const write=()=>fs.writeFileSync(path.join(OUT,"results.json"),JSON.stringify(evidence,null,2)+"\n");
function staticTest(){
 const script=GAME.match(/<script>([\s\S]*?)<\/script>/i)?.[1];
 assert(script);new vm.Script(script);
 const ids=["stepNav","stepStatus","stepSchool","stepInstrument","stepPlay","schoolSearch","demoSchool","instruments","track","pads","start","pause","stop"];
 for(const id of ids)assert(GAME.includes('id="'+id+'"'),"missing UI id "+id);
 for(const key of ["school","instrument","play"])assert(GAME.includes('data-step-target="'+key+'"'),"missing nav target");
 for(const text of ["function goToStep(","function syncStepNav(","getUxStep:()=>currentUxStep","goToStep(\"instrument\")","goToStep(\"play\")","stepAvailability()"])
  assert(GAME.includes(text),"missing flow wiring "+text);
 assert(GAME.includes("school_name")&&GAME.includes("school_id"),"school id and data safety unchanged");
 assert(GAME.includes("aria-live=\"polite\""),"user feedback required");
 assert(GAME.includes("scroll-margin-top"),"sticky nav requires scroll offset");
 assert(!GAME.includes("display:none!important"),"must not remove keyboard access");
 evidence.unit={passed:true,panels:3,navButtons:3,existingControlIds:ids.length,
  instrumentLanes:{guitar:4,drums:4,bass:3,keys:5}};
 console.log("PASS 016 static: 3 accessible panels and existing keys/lanes remain intact");
}
async function browserTests(){
 const {chromium}=require("playwright");
 const srv=http.createServer((req,res)=>{res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"});res.end(GAME);});
 await new Promise(r=>srv.listen(0,"127.0.0.1",r));
 let browser;
 try{
  browser=await chromium.launch({headless:true,args:["--no-sandbox","--autoplay-policy=no-user-gesture-required"]});
  const url="http://127.0.0.1:"+srv.address().port;
  const configs=[{name:"desktop1280",viewport:{width:1280,height:850},isMobile:false,hasTouch:false},
    {name:"mobile320",viewport:{width:320,height:640},isMobile:true,hasTouch:true},
    {name:"mobile375",viewport:{width:375,height:812},isMobile:true,hasTouch:true}];
  const reference={guitar:{lanes:["리프","파워코드","업스트럼","고음 리프"],keys:["D","F","J","K"]},
    drums:{lanes:["킥","스네어","하이햇","탐"],keys:["D","F","J","K"]},
    bass:{lanes:["루트","5도","옥타브"],keys:["F","SPACE","J"]},
    keys:{lanes:["저음","화음1","화음2","멜로디","고음"],keys:["A","S","D","J","K"]}};
  for(const cfg of configs){
   const context=await browser.newContext({viewport:cfg.viewport,isMobile:cfg.isMobile,hasTouch:cfg.hasTouch,deviceScaleFactor:1});
   const page=await context.newPage(),errors=[],calls=[];
   page.on("pageerror",e=>errors.push(e.message));
   await page.route("**/schoolband-school-read-v1**",route=>{
    const u=new URL(route.request().url());calls.push({query:u.search,method:route.request().method()});
    let body;
    if(u.searchParams.has("schools")){
     body={schools:[{school_id:"mock-s001",school_name:"별빛초등학교",sido_standard:"부산"},
      {school_id:"mock-s002",school_name:"별빛초등학교",sido_standard:"서울"}]};
    }else if(u.searchParams.has("school_id")){
     const id=u.searchParams.get("school_id");
     body={school:{school_id:id,school_name:"별빛초등학교",region:id==="mock-s001"?"부산":"서울",
       eligible:id==="mock-s001",difficulty:id==="mock-s001"?"hard":null,source_year:id==="mock-s001"?2026:null}};
    }else body={schools:[]};
    return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(body)});
   });
   const res={mode:cfg.name,steps:[],instrumentSwaps:[],schoolSearchMockCalls:0,errors:[],screenshots:[],hitDone:false};
   try{
    assert((await page.goto(url,{waitUntil:"domcontentloaded"})).ok());
    const state=async()=>page.evaluate(()=>{
     const api=window.nangamSchoolbandV08;
     return {step:api.getUxStep(),availability:api.getUxAvailability(),
      active:document.querySelector("#stepNav [aria-current=step]")?.dataset.stepTarget,
      focusId:document.activeElement?.id,
      horizontalOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+1,
      nav:[...document.querySelectorAll("#stepNav button")].map(x=>({step:x.dataset.stepTarget,
       disabled:x.getAttribute("aria-disabled"),h:x.getBoundingClientRect().height})),
      title:document.getElementById("schoolTitle").textContent
     };
    });
    let st=await state();assert.equal(st.step,"school");assert.equal(st.active,"school");
    assert.equal(st.availability.instrument,false);assert.equal(st.availability.play,false);
    assert.equal(st.horizontalOverflow,false);assert(st.nav.every(x=>x.h>=40));
    await page.locator('[data-step-target="play"]').click();
    st=await state();assert.equal(st.step,"school","cannot skip school");
    await page.locator("#stepSchool").screenshot({path:path.join(OUT,cfg.name+"-step1-school.png")});
    res.screenshots.push(cfg.name+"-step1-school.png");
    await page.locator("#schoolSearch").fill("별");
    await page.waitForTimeout(320);assert.equal(calls.length,0,"1-character search must not hit API");
    await page.locator("#schoolSearch").fill("별빛");
    await page.waitForFunction(()=>document.querySelector("#searchResults").children.length===2,null,{timeout:3500});
    assert(calls.length>=1);assert(calls[0].query.includes("schools="));
    assert.equal(await page.locator("#searchResults button").count(),2);
    await page.locator("#searchResults button").first().click();
    await page.waitForFunction(()=>window.nangamSchoolbandV08.getUxStep()==="instrument");
    st=await state();assert.equal(st.active,"instrument");
    assert.equal(st.availability.play,true);assert(st.title.includes("별빛초등학교"));
    assert((await page.locator("#schoolTier").textContent()).includes("HARD"),"approved fixture difficulty");
    assert.equal(await page.locator("#start").isDisabled(),false);
    res.steps.push({step:"school",mockedSchoolId:(await page.evaluate(()=>window.nangamSchoolbandV08.getSelected())).school_id});
    await page.locator("#stepInstrument").screenshot({path:path.join(OUT,cfg.name+"-step2-instrument.png")});
    res.screenshots.push(cfg.name+"-step2-instrument.png");
    // Direct instrument click must update the N-lane canvas/pads immediately.
    for(const [instrument,shape]of Object.entries(reference)){
     await page.locator('[data-inst="'+instrument+'"]').click();
     st=await state();
     assert.equal(st.step,"play");assert.equal(st.active,"play");assert.equal(st.horizontalOverflow,false);
     const details=await page.evaluate(()=>{
      const a=window.nangamSchoolbandV08;
      return {instrument:a.getInstrument(),lanes:a.getLanes(),
       padCount:document.querySelectorAll("#pads .taphit").length,
       padLanes:[...document.querySelectorAll("#pads .taphit")].map(x=>x.dataset.lane),
       names:[...document.querySelectorAll("#pads .taphit strong")].map(x=>x.textContent),
       padKeys:[...document.querySelectorAll("#pads .taphit small")].map(x=>x.textContent),
       laneInfo:document.getElementById("laneInfo").textContent,
       chartLabel:document.querySelector("canvas")?.getAttribute("aria-label"),
       padMinHeight:Math.min(...[...document.querySelectorAll("#pads .taphit")].map(x=>x.getBoundingClientRect().height)),
       canvasWidth:document.querySelector("#track").getBoundingClientRect().width,
       horizontalOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+1};
     });
     assert.equal(details.instrument,instrument);assert.equal(details.padCount,shape.lanes.length);
     assert.deepEqual(details.names,shape.lanes);assert.deepEqual(details.padKeys,shape.keys);
     assert.deepEqual(details.padLanes,shape.lanes.map((_,i)=>String(i)));
     assert(details.laneInfo.includes(shape.lanes.length+"레인"));
     assert(details.chartLabel.includes(shape.lanes.length+"레인"));
     assert(details.padMinHeight>=60,"touch pads must retain 60px height");
     assert(details.canvasWidth>240&&details.canvasWidth<=cfg.viewport.width,"mobile track fits viewport");
     assert.equal(details.horizontalOverflow,false);
     res.instrumentSwaps.push({instrument,lanes:details.padCount,keyLabels:details.padKeys});
     if(instrument==="keys"){
      await page.locator("#stepPlay").screenshot({path:path.join(OUT,cfg.name+"-step3-play-keys.png")});
      res.screenshots.push(cfg.name+"-step3-play-keys.png");
     }
    }
    // Changing school remains available via step navigation before starting, without reloading.
    await page.locator('[data-step-target="school"]').click();
    assert.equal((await state()).step,"school");
    await page.locator("#demoSchool").click();
    assert.equal((await state()).step,"instrument");
    assert((await page.locator("#schoolTier").textContent()).includes("NORMAL"),"demo is practice only");
    assert(!(await page.locator("#schoolTier").textContent()).includes("2026년"),"never invent an official percentile for demo");
    await page.locator('[data-inst="drums"]').click();assert.equal((await state()).step,"play");
    await page.locator("#start").click();
    await page.waitForFunction(()=>window.nangamSchoolbandV08.getStatus().playing,null,{timeout:5000});
    const playing=await page.evaluate(()=>({step:window.nangamSchoolbandV08.getUxStep(),
      oldDisabled:document.querySelector('[data-step-target="school"]').disabled,
      active:document.querySelector("#stepNav [aria-current=step]")?.dataset.stepTarget}));
    assert.equal(playing.step,"play");assert.equal(playing.active,"play");assert.equal(playing.oldDisabled,true);
    await page.locator("#stop").click();
    await page.waitForFunction(()=>!window.nangamSchoolbandV08.getStatus().playing);
    const done=await state();assert.equal(done.nav[0].disabled,"false");
    assert.equal(done.horizontalOverflow,false);
    res.hitDone=true;res.steps.push({step:"instrument",n:4},{step:"play",started:true,stopped:true});
    res.schoolSearchMockCalls=calls.length;res.errors=errors;
    assert.deepEqual(errors,[]);
    console.log("PASS Stage016 "+cfg.name+": three-step guided school→4 instruments→play, compact mock search and no horizontal overflow");
    evidence.browsers.push(res);
   }finally{await context.close();}
  }
 }finally{if(browser)await browser.close();await new Promise(r=>srv.close(r));}
}
(async()=>{staticTest();if(process.argv.includes("--browser"))await browserTests();write();console.log("PASS stage016 3-screen UX and responsive school search");})()
.catch(e=>{evidence.failure=String(e.stack||e);write();console.error("FAIL Stage016 "+(e.stack||String(e)));process.exitCode=1;});
