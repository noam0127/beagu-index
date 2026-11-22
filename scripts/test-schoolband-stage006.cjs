#!/usr/bin/env node
"use strict";
const fs=require("node:fs");
const path=require("node:path");
const http=require("node:http");
const vm=require("node:vm");
const assert=require("node:assert/strict");
const ROOT=path.resolve(__dirname,"..");
const GAME=fs.readFileSync(path.join(ROOT,"games/nangam-schoolband-v08/index.html"),"utf8");
const OUT=path.join(ROOT,"artifacts/schoolband-stage006");
const RESULTS={stage:"006/030",unit:{},browser:[],risks:[
 "Hardware input and speaker latency are not measured by headless Chromium; the slider is a manual correction, not an automatic measurement.",
 "Real iOS/Android multi-touch and hardware output synchronization remain device-test tasks.",
 "No physical school music is imported; school data is mocked and production APIs are untouched."
]};
fs.mkdirSync(OUT,{recursive:true});
function save(){fs.writeFileSync(path.join(OUT,"results.json"),JSON.stringify(RESULTS,null,2)+"\n");}
function almost(a,b,msg,eps=1e-9){assert(Number.isFinite(a)&&Math.abs(a-b)<eps,msg+" expected="+b+" actual="+a);}
function pure(){
 const js=GAME.match(/<script>([\s\S]*?)<\/script>/i)?.[1];
 assert(js,"Game inline script");
 new vm.Script(js);
 const start="// BEGIN SCHOOLBAND_TIMING_MODEL_V1",end="// END SCHOOLBAND_TIMING_MODEL_V1";
 const a=GAME.indexOf(start),b=GAME.indexOf(end);
 assert(a>0&&b>a,"model markers");
 const first=GAME.indexOf("\n",a)+1;
 const code=GAME.slice(first,b);
 const m=vm.runInNewContext(code+"\n({judgementForOffset,isNoteMissed,correctedInputTime,clampOffsetMs,selectPendingNoteIndex,WIDTHS,PERFECT})",Object.create(null),{timeout:1000});
 let n=0;
 for(const [input,want] of [[-400,-150],[400,150],[-150,-150],[150,150],[0,0],[10,10],[11,10],[12.5,15],["20",20],["bad",0],[Infinity,0],[NaN,0],[-12,-10]]){
  assert.equal(m.clampOffsetMs(input),want,"clamp "+String(input));n++;
 }
 for(const tier of [0,1,2,3,4]){
  const p=m.PERFECT[tier],w=m.WIDTHS[tier];
  for(const correction of [-150,-120,-35,0,35,120,150]){
   const rawLate=2+correction/1000;
   almost(m.correctedInputTime(rawLate,correction),2,"calibrate"+tier+":"+correction);
   assert.equal(m.judgementForOffset(2-m.correctedInputTime(rawLate,correction),tier),"perfect");
   const rawEarly=2+correction/1000-(p+w)/2;
   assert.equal(m.judgementForOffset(2-m.correctedInputTime(rawEarly,correction),tier),"good","corrected GOOD "+tier);
   const rawOutside=2+correction/1000+w+.012;
   assert.equal(m.judgementForOffset(2-m.correctedInputTime(rawOutside,correction),tier),"outside");
   assert.equal(m.isNoteMissed(2,m.correctedInputTime(rawOutside,correction),tier),true);
   n+=5;
  }
 }
 for(const tier of [0,1,2,3,4]){
  const delay=m.WIDTHS[tier];
  assert.equal(m.isNoteMissed(2,2+delay+.001,tier),true);
  assert.equal(m.isNoteMissed(2,m.correctedInputTime(2+delay+.001,.05*1000),tier),false,"calibration must shift miss deadline");
  n+=2;
 }
 almost(m.correctedInputTime(2.12,120),2,"120ms late compensation");
 almost(m.correctedInputTime(1.88,-120),2,"120ms early compensation");
 assert.equal(m.judgementForOffset(2-2.12,4),"outside");
 assert.equal(m.judgementForOffset(2-m.correctedInputTime(2.12,120),4),"perfect");
 assert.equal(m.judgementForOffset(2-1.88,4),"outside");
 assert.equal(m.judgementForOffset(2-m.correctedInputTime(1.88,-120),4),"perfect");
 n+=6;
 const notes=[{t:2,lane:0,done:false},{t:2,lane:2,done:false},{t:2.138889,lane:0,done:false}];
 const before=JSON.stringify(notes);
 assert.equal(m.selectPendingNoteIndex(notes,1,2,4),-1,"wrong lane must not find neighbour note");
 assert.equal(JSON.stringify(notes),before,"selector never mutates notes");
 assert.equal(m.selectPendingNoteIndex(notes,0,2,4),0,"first chord left lane");
 assert.equal(m.selectPendingNoteIndex(notes,2,2,4),1,"first chord right lane");
 notes[0].done=true;
 assert.equal(m.selectPendingNoteIndex(notes,0,2,4),-1,"same lane cannot hit a finished note");
 assert.equal(m.selectPendingNoteIndex(notes,2,2,4),1,"left lane consumed does not consume right");
 notes[1].done=true;
 assert.equal(m.selectPendingNoteIndex(notes,2,2,4),-1,"both chord notes independently consumed");
 const near=[{t:1,lane:0,done:false},{t:1.138889,lane:0,done:false}];
 assert.equal(m.selectPendingNoteIndex(near,0,1.12,0),1,"nearest same-lane note chosen");
 assert.equal(m.selectPendingNoteIndex([{t:1,lane:0,done:false},{t:1,lane:0,done:false}],0,1,0),0,"deterministic tie");
 assert.equal(m.selectPendingNoteIndex(notes,999,2,4),-1);
 assert.equal(m.selectPendingNoteIndex(notes,0,NaN,4),-1);
 n+=10;
 RESULTS.unit={passed:true,checks:n,zero_offset_equivalent:true,calibration_range_ms:[-150,150],step_ms:5,tiers_tested:5,
  chord_lane_nonmutation:true,nearest_same_lane:true,window_and_miss_shift_together:true};
 console.log("PASS Stage006 pure: "+n+" offset and lane-selection contracts, 5 tiers, simultaneous chord, ±120ms shift");
 // Negative control: this mutation must make the test contract fail.
 const broken=GAME.replace("return songTime-offsetMs/1000;","return songTime+offsetMs/1000;");
 assert.notEqual(broken,GAME,"bad offset fixture effective");
 const corruptCode=broken.slice(broken.indexOf(start)+start.length+broken.slice(broken.indexOf(start)).indexOf("\n")+1,broken.indexOf(end));
 const corrupted=vm.runInNewContext(corruptCode+"\n({correctedInputTime})",Object.create(null),{timeout:1000});
 let detected=false;
 try{almost(corrupted.correctedInputTime(2.12,120),2,"bad sign");}catch(_){detected=true;}
 assert(detected,"SIGN REGRESSION NOT DETECTED");
 RESULTS.unit.bad_sign_mutation_detected=true;
 console.log("PASS negative control: flipped latency correction sign detected");
}
async function waitSong(page,t,timeout=6000){
 return page.evaluate(async ({t,timeout})=>{
  const a=window.nangamSchoolbandV08,deadline=performance.now()+timeout;
  while(a.getPlayhead()<t&&performance.now()<deadline){
   await new Promise(r=>setTimeout(r,2));
  }
  const now=a.getPlayhead();
  if(now<t)throw Error("song clock did not reach "+t+", now="+now);
  return now;
 },{t,timeout});
}
async function createPage(browser,url,mode){
 const context=await browser.newContext({viewport:mode==="mobile320"?{width:320,height:640}:{width:1280,height:860},
  isMobile:mode==="mobile320",hasTouch:mode==="mobile320",deviceScaleFactor:1});
 let requests=0;
 await context.route("**/functions/v1/schoolband-school-read-v1*",route=>{
  requests++;
  const q=new URL(route.request().url()).searchParams;
  const body=q.has("schools")?{schools:[{school_id:"stage006-fixture",school_name:"오프셋검증학교",sido_standard:"가상지역"}]}:
  {school:{school_id:"stage006-fixture",school_name:"오프셋검증학교",region:"가상",eligible:true,difficulty:"extreme",source_year:2025}};
  return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(body)});
 });
 const page=await context.newPage(),errors=[];
 page.on("pageerror",e=>errors.push(e.message));
 const resp=await page.goto(url,{waitUntil:"domcontentloaded"});assert(resp.ok());
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+2);
 assert(!overflow,"no horizontal overflow");
 return {page,context,errors,requests:()=>requests};
}
async function setOffset(page,value){
 await page.locator("#offsetRange").evaluate((el,n)=>{
  el.value=String(n);el.dispatchEvent(new Event("input",{bubbles:true}));
 },value);
 return page.evaluate(()=>({range:document.querySelector("#offsetRange").value,
  value:document.querySelector("#offsetValue").textContent,
  stored:localStorage.getItem("nangam-band-input-offset-ms-v1"),
  summary:document.querySelector("#offsetSummary").textContent,
  api:window.nangamSchoolbandV08.getStatus().offsetMs}));
}
async function selectExtremeDrums(page){
 await page.locator("#schoolSearch").fill("오프셋검증");
 await page.locator("#searchResults button").first().click();
 await page.waitForFunction(()=>document.querySelector("#schoolTier")?.textContent?.includes("EXTREME"));
 await page.locator('[data-inst="drums"]').click();
 assert.equal(await page.locator("#pads .taphit").count(),4);
}
async function press(page,lane){
 return page.evaluate(lane=>{
  const a=window.nangamSchoolbandV08,before=a.getStatus();
  document.querySelector('#pads .taphit[data-lane="'+lane+'"]').dispatchEvent(new PointerEvent("pointerdown",{bubbles:true,cancelable:true}));
  return {before,after:a.getStatus(),fx:a.getEffectState(),now:a.getPlayhead(),chart:a.getChart().filter(n=>n.t===0)};
 },lane);
}
async function browser(){
 let chromium;try{({chromium}=require("playwright"))}catch(e){throw Error("Playwright not installed: "+e.message);}
 const server=http.createServer((req,res)=>{
  res.writeHead(200,{"Content-Type":"text/html; charset=utf-8"});res.end(GAME);
 });
 await new Promise(r=>server.listen(0,"127.0.0.1",r));
 const url="http://127.0.0.1:"+server.address().port;
 let b;
 try{
  b=await chromium.launch({headless:true,args:["--no-sandbox","--autoplay-policy=no-user-gesture-required"]});
  for(const mode of ["desktop","mobile320"]){
   const x=await createPage(b,url,mode),{page,context}=x;
   const check=await page.evaluate(()=>({min:document.querySelector("#offsetRange").min,max:document.querySelector("#offsetRange").max,
    step:document.querySelector("#offsetRange").step,type:document.querySelector("#offsetRange").type,
    initial:window.nangamSchoolbandV08.getStatus().offsetMs}));
   assert.deepEqual(check,{min:"-150",max:"150",step:"5",type:"range",initial:0});
   await page.locator("#timingTuner summary").click();
   const testPersist=await setOffset(page,120);
   assert.equal(testPersist.api,120);assert.equal(testPersist.value,"+120 ms");assert.equal(testPersist.stored,"120");
   assert.equal(testPersist.summary,"+120 ms");
   await page.reload({waitUntil:"domcontentloaded"});
   assert.equal(await page.locator("#offsetRange").inputValue(),"120","offset survives reload");
   await page.locator("#timingTuner summary").click();
   await selectExtremeDrums(page);
   await page.locator("#start").click();
   assert.equal(await page.locator("#offsetRange").isDisabled(),true,"locked during game");
   assert.equal(await page.locator("#offsetReset").isDisabled(),true,"reset locked during game");
   const t=await waitSong(page,.114);
   assert(t<.16,"positive offset timing overshoot");
   const wrong=await press(page,3);
   assert.equal(wrong.after.emptyPresses,wrong.before.emptyPresses+1);
   assert.equal(wrong.after.hits,0,"wrong lane cannot score");
   assert.equal(wrong.after.miss,0,"wrong lane does not miss other chord notes");
   assert.equal(wrong.chart.filter(n=>n.done).length,0,"chord preserved after wrong lane");
   const hit0=await press(page,0);
   assert.equal(hit0.after.hits,1);
   assert.equal(hit0.fx.laneMessages[0].message,"PERFECT");
   assert.equal(hit0.chart.find(n=>n.lane===2).done,false,"second chord note not stolen");
   const hit0Again=await press(page,0);
   assert.equal(hit0Again.after.emptyPresses,wrong.after.emptyPresses+1,"repeat hit not accepted");
   const hit2=await press(page,2);
   assert.equal(hit2.after.hits,2,"both chord lanes independently accepted");
   assert.equal(hit2.after.combo,2);
   assert.equal(hit2.chart.filter(n=>n.done).length,2);
   const render=await page.evaluate(()=>window.nangamSchoolbandV08.getTimingModel().noteYAtAudioTime(0,.12,293));
   assert(Number.isFinite(render),"rendering unaffected by calibration");
   const dest=path.join(OUT,mode+"-calibrated.png");
   await page.screenshot({path:dest,fullPage:true});
   await page.locator("#stop").click();
   assert.equal(await page.locator("#offsetRange").isEnabled(),true);
   assert.equal(await page.locator("#offsetReset").isEnabled(),true);
   // The late input at +0.12s without calibration must NOT score note t=0 (EXTREME ±.075s).
   const reset=await page.locator("#offsetReset").click();
   assert.equal(await page.locator("#offsetRange").inputValue(),"0");
   assert.equal(await page.locator("#offsetValue").textContent(),"0 ms");
   assert.equal(await page.evaluate(()=>localStorage.getItem("nangam-band-input-offset-ms-v1")),"0");
   await page.locator("#start").click();
   await waitSong(page,.114);
   const uncorrected=await press(page,0);
   assert.equal(uncorrected.after.hits,0,"uncorrected late hit must be rejected");
   assert.equal(uncorrected.after.emptyPresses,1);
   await page.locator("#stop").click();
   const negative=await setOffset(page,-120);
   assert.equal(negative.value,"-120 ms");
   await page.locator("#start").click();
   await waitSong(page,-.120);
   const early=await press(page,0);
   assert.equal(early.after.hits,1,"early hit must be compensated at -120ms");
   assert.equal(early.fx.laneMessages[0].message,"PERFECT");
   await page.locator("#stop").click();
   await page.locator("#offsetReset").click();
   await page.reload({waitUntil:"domcontentloaded"});
   assert.equal(await page.locator("#offsetRange").inputValue(),"0");
   assert.deepEqual(x.errors,[],"no runtime JS errors");
   RESULTS.browser.push({mode,passed:true,raw_late_song_time:t,positive_offset_ms:120,
     wrong_lane_no_mutation:true,simultaneous_notes_hits:2,repeat_lane_rejected:true,
     default_late_rejected:true,negative_offset_ms:-120,negative_early_accepted:true,
     persisted_and_reset:true,mocked_school_requests:x.requests(),photo:path.basename(dest)});
   await context.close();
   console.log("PASS browser "+mode+": +120ms late compensated, chord lane isolation, zero-offset rejection, -120ms early compensated, persisted/reset");
  }
 }finally{if(b)await b.close();await new Promise(r=>server.close(r));}
}
(async()=>{pure();if(process.argv.includes("--browser"))await browser();save();console.log("PASS stage006 complete; results in artifacts/schoolband-stage006/results.json");})().catch(e=>{
 RESULTS.failure=String(e.stack||e);save();console.error("FAIL stage006 "+(e.stack||String(e)));process.exitCode=1;
});
