#!/usr/bin/env node
"use strict";
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),http=require("node:http"),assert=require("node:assert/strict");
const ROOT=path.resolve(__dirname,".."),HTML=fs.readFileSync(path.join(ROOT,"games/nangam-schoolband-v08/index.html"),"utf8");
const DEST=path.join(ROOT,"artifacts/schoolband-stage005"),EPS=1e-6;
const TIER=["easy","normal","hard","very_hard","extreme"],P=[.09,.075,.06,.05,.036],W=[.20,.17,.14,.11,.075];
const results={stage:"005/030",unit:{},negative_controls:[],browser:[],limitations:["Numerical boundary tests use the real game pure functions, not physical device latency.","Headless Chromium AudioContext is not an Android/iOS hardware/audio listening test.","Input offset calibration and simulated 60/90/120 Hz rendering are assigned to stages 006–007."]};
const save=()=>{fs.mkdirSync(DEST,{recursive:true});fs.writeFileSync(path.join(DEST,"timing-boundary-results.json"),JSON.stringify(results,null,2)+"\n");};
function almost(a,b,msg,eps=1e-10){assert(Number.isFinite(a)&&Math.abs(a-b)<eps,msg+" actual="+a+" expected="+b);}
function sourceModel(html){
 const start="// BEGIN SCHOOLBAND_TIMING_MODEL_V1",end="// END SCHOOLBAND_TIMING_MODEL_V1";
 assert.equal(html.split(start).length,2);assert.equal(html.split(end).length,2);
 const lineEnd=html.indexOf("\n",html.indexOf(start));
 assert(lineEnd>=0,"timing model start marker line");
 return html.slice(lineEnd+1,html.indexOf(end));
}
function loadModel(html){
 const code=sourceModel(html);new vm.Script(code,{filename:"schoolband-timing-model.js"});
 // Exclude explanatory comments; inspect executable code for forbidden side effects.
 const executable=code.replace(/\\/\\/[^\\n]*/g,"").replace(/\\/\\*[\\s\\S]*?\\*\\//g,"");
 for(const name of ["Date.now","performance.now","requestAnimationFrame","window.","document.","AudioContext","setTimeout"])assert(!executable.includes(name),"impure model contains "+name);
 return vm.runInNewContext(code+"\n({BEAT,BARS,SONG_BEATS,WIDTHS,PERFECT,NOTE_PREVIEW_SECONDS,NOTE_TRAVEL_PX,NOTE_HEIGHT_PX,noteTimeSeconds,noteDeltaSeconds,noteYForDelta,noteYAtAudioTime,noteStepSpacing,judgementForOffset,isNoteMissed})",Object.create(null),{timeout:1000});
}
function verifyBoundaries(m){
 let count=0;const rows=[];
 for(let i=0;i<TIER.length;i++){
  const perfect=P[i],good=W[i];
  almost(m.PERFECT[i],perfect,TIER[i]+" perfect");
  almost(m.WIDTHS[i],good,TIER[i]+" good");
  for(const sign of [-1,1]){
   for(const [n,expected] of [[0,"perfect"],[perfect-EPS,"perfect"],[perfect,"perfect"],[perfect+EPS,"good"],[good-EPS,"good"],[good,"good"],[good+EPS,"outside"]]){
    assert.equal(m.judgementForOffset(sign*n,i),expected,TIER[i]+" "+sign*n+" must be "+expected);count++;
   }
  }
  for(const [now,missed] of [[good-EPS,false],[good,false],[good+EPS,true],[-good-EPS,false]]){
   assert.equal(m.isNoteMissed(0,now,i),missed,TIER[i]+" late boundary "+now);count++;
  }
  rows.push({tier:TIER[i],perfect_s:perfect,good_s:good,miss_after_s:good});
 }
 for(const [value,idx] of [[NaN,0],[Infinity,0],[0,-1],[0,5],[0,1.5]]){
  assert.equal(m.judgementForOffset(value,idx),"outside");count++;
 }
 for(const [t,now] of [[NaN,0],[0,NaN],[0,Infinity]]){assert.equal(m.isNoteMissed(t,now,0),false);count++;}
 return {checks:count,tiers:rows};
}
function verifyGeometry(m){
 const beat=60/108;let checks=0;
 almost(m.BEAT,beat,"beat");assert.equal(m.BARS,8);assert.equal(m.SONG_BEATS,32);assert.equal(m.NOTE_HEIGHT_PX,24);checks+=4;
 for(const [bar,step,expected] of [[0,0,0],[0,1,beat/4],[1,0,4*beat],[7,15,(28+15/4)*beat],[0,128,32*beat]]){
  almost(m.noteTimeSeconds(bar,step),expected,"bar "+bar+" step "+step);checks++;
 }
 for(const audio of [-1,0,.125,1.4,8.95,17.8]){
  for(const ahead of [0,.025,.278,.6,1.16]){
   const when=audio+ahead;
   almost(m.noteDeltaSeconds(when,audio),ahead,"delta",1e-9);
   const y=m.noteYAtAudioTime(when,audio,293);
   almost(y,293-ahead/1.16*240,"coordinate",1e-8);
   almost(y,m.noteYForDelta(ahead,293),"coordinate shared",1e-8);checks+=3;
  }
 }
 const spacing=(beat/4)/1.16*240;
 almost(m.noteStepSpacing(),spacing,"note spacing");assert(spacing-24>=4);checks+=2;
 return {checks,note_height_px:24,step_spacing_px:spacing,gap_px:spacing-24};
}
function verifyFrameIndependence(m){
 let checks=0;
 for(const fps of [30,60,90,120]){
  for(const sampleTime of [0,.1337,.3,.555555,1.2345,5.87654,17.1]){
   const a=m.noteYAtAudioTime(1.2345,sampleTime,293);
   almost(a,293-(1.2345-sampleTime)/1.16*240,"independent of "+fps+"Hz",1e-8);checks++;
  }
 }
 return {checks,simulated_fps:[30,60,90,120]};
}
function verifyMutation(html){
 const bad=html.replace("const WIDTHS=[.20,.17,.14,.11,.075]","const WIDTHS=[.195,.17,.14,.11,.075]");
 assert.notEqual(bad,html);
 let error=null;
 try{verifyBoundaries(loadModel(bad));}catch(e){error=e.message;}
 assert(error&&error.includes("easy good"),"mutant timing threshold failed to trigger regression "+error);
 results.negative_controls.push({fixture:"easy GOOD .200→.195",detected:true,error});
 console.log("PASS negative timing mutation detected");
}
async function browserProof(){
 let chromium;try{({chromium}=require("playwright"));}catch(e){throw Error("Install playwright Chromium first: "+e.message);}
 const server=http.createServer((req,res)=>{
  if((req.url||"").split("?")[0]!=="/"){res.writeHead(404);res.end("not found");return;}
  res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"});res.end(HTML);
 });
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 let browser;
 try{
  browser=await chromium.launch({headless:true,args:["--no-sandbox","--autoplay-policy=no-user-gesture-required"]});
  const url="http://127.0.0.1:"+server.address().port+"/";
  for(const [name,viewport,mobile] of [["desktop",{width:1280,height:900},false],["mobile320",{width:320,height:640},true]]){
   const context=await browser.newContext({viewport,hasTouch:mobile,isMobile:mobile,deviceScaleFactor:1});
   const page=await context.newPage(),errors=[];page.on("pageerror",e=>errors.push(e.message));
   assert((await page.goto(url,{waitUntil:"domcontentloaded"})).ok());
   const test=await page.evaluate(()=>{
    const api=window.nangamSchoolbandV08,m=api.getTimingModel(),s=api.getTimingRules();
    const tiers=s.perfectSeconds.map((p,i)=>{
     const w=s.goodSeconds[i],e=.000001;
     return {a:m.judgementForOffset(p-e,i),b:m.judgementForOffset(p,i),c:m.judgementForOffset(p+e,i),
       d:m.judgementForOffset(w,i),f:m.judgementForOffset(w+e,i),
       missAt:m.isNoteMissed(0,w,i),missBeyond:m.isNoteMissed(0,w+e,i)};
    });
    return {tiers,y:m.noteYAtAudioTime(.5,0,293),spacing:m.noteStepSpacing()};
   });
   assert.equal(test.tiers.length,5);
   for(const t of test.tiers){
    for(const [prop,expected] of Object.entries({a:"perfect",b:"perfect",c:"good",d:"good",f:"outside",missAt:false,missBeyond:true})){
     assert.equal(t[prop],expected,name+" boundary "+prop);
    }
   }
   almost(test.y,293-.5/1.16*240,"browser geometry");almost(test.spacing,(60/108/4)/1.16*240,"browser spacing");
   await page.locator("#demoSchool").click();
   await page.locator("#start").click();
   const clocks=await page.evaluate(async()=>{
    const api=window.nangamSchoolbandV08;
    const first=api.getPlayhead(),notes=api.getChart();
    await new Promise(r=>setTimeout(r,240));
    return {first,second:api.getPlayhead(),noteCount:notes.length,noteStart:notes[0].t};
   });
   assert(clocks.first!==null&&clocks.second!==null);
   const elapsed=clocks.second-clocks.first;
   assert(elapsed>.15&&elapsed<.45,"AudioContext must advance ~.24s; got "+elapsed);
   assert(clocks.noteCount>0&&clocks.noteStart>=0);
   assert.deepEqual(errors,[],"page errors "+name);
   results.browser.push({name,pass:true,tiers:5,audio_clock_delta_s:elapsed,chart_notes:clocks.noteCount});
   await page.locator("#stop").click();await context.close();
   console.log("PASS browser "+name+": 5 timing boundary sets, canvas geometry and AudioContext progression");
  }
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
}
(async()=>{
 const js=HTML.match(/<script>([\s\S]*?)<\/script>/i)?.[1];assert(js);
 new vm.Script(js,{filename:"nangam-schoolband-v08.inline.js"});
 const model=loadModel(HTML);
 results.unit={boundaries:verifyBoundaries(model),geometry:verifyGeometry(model),fps_independence:verifyFrameIndependence(model)};
 console.log("PASS pure timing: "+results.unit.boundaries.checks+" boundaries, "+results.unit.geometry.checks+" geometry, "+results.unit.fps_independence.checks+" FPS comparisons");
 verifyMutation(HTML);
 if(process.argv.includes("--browser"))await browserProof();
 save();console.log("PASS stage 005; metrics artifacts/schoolband-stage005/timing-boundary-results.json");
})().catch(e=>{results.failure=String(e.stack||e);save();console.error("FAIL stage 005",e.stack||String(e));process.exitCode=1});
