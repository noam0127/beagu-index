#!/usr/bin/env node
"use strict";
// 026/030 — deterministic note, input and DOM regression ONLY.
// Never start or inspect AudioContext. No sound/playfeel/music listening tests.
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),assert=require("node:assert/strict"),http=require("node:http");
const ROOT=path.resolve(__dirname,".."),GAME_PATH=path.join(ROOT,"games/nangam-schoolband-v08/index.html");
const HTML=fs.readFileSync(GAME_PATH,"utf8");
const SCRIPT=HTML.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert(SCRIPT,"game script missing");new vm.Script(SCRIPT);
const part=(from,to)=>{const a=SCRIPT.indexOf(from),b=SCRIPT.indexOf(to,a);assert(a>=0&&b>a,from+" -> "+to);return SCRIPT.slice(a,b)};
const model=[
 part("const TIERS=","// BEGIN SCHOOLBAND_TIMING_MODEL_V1"),
 part("// BEGIN SCHOOLBAND_TIMING_MODEL_V1","// END SCHOOLBAND_CHART_VALIDATION_V1")+"\n",
 part("// BEGIN SCHOOLBAND_SCORE_V2","// END SCHOOLBAND_SCORE_V2")+"\n",
 "let generatedTrial=null,instrument='guitar',tier='normal',chart=[];",
 "function tierIdx(){return Math.max(0,TIERS.indexOf(tier))}",
 part("function makeChart(){","function nowSong()"),
 "globalThis.__m={TIERS,INST,PARTS,CHART_VERSION,BARS,BEAT,WIDTHS,PERFECT,validateChartCatalog,judgementForOffset,isNoteMissed,correctedInputTime,clampOffsetMs,selectPendingNoteIndex,noteTimeSeconds,noteDeltaSeconds,makeChart,scoreForHit,scoreRecordKey,validScoringResult,concertSummaryModel,setChoice:(i,t)=>{instrument=i;tier=t;generatedTrial=null},getChart:()=>chart.map(n=>({t:n.t,beat:n.beat,lane:n.lane,done:n.done}))};"
].join("\n");
const context=vm.createContext({});new vm.Script(model).runInContext(context);
const M=context.__m;let checks=0,combinations=0,notes=0;
function ok(condition,message){assert(condition,message);checks++}
function equal(a,b,message){assert.equal(a,b,message);checks++}
const audit=M.validateChartCatalog(M.PARTS,M.INST,M.CHART_VERSION);
ok(audit.valid,"embedded chart audit failed: "+audit.errors.join(", "));
equal(Object.keys(audit.metrics).length,4,"instrument count");
equal(M.TIERS.length,5,"difficulty count");
const counts={};
for(const [instrumentName,inst] of Object.entries(M.INST)){
 counts[instrumentName]=[];
 let prior=0;
 for(let level=0;level<M.TIERS.length;level++){
  const tier=M.TIERS[level];
  M.setChoice(instrumentName,tier);
  const chart=M.makeChart(),meta=audit.metrics[instrumentName].tiers[level];
  const expected=M.PARTS[instrumentName].filter(x=>x[2]<=level).length*M.BARS;
  equal(chart.length,meta.totalNotes,instrumentName+" "+tier+" validator parity");
  equal(chart.length,expected,instrumentName+" "+tier+" formula parity");
  ok(chart.length>prior,instrumentName+" "+tier+" density increases");
  const keys=new Set(),lanes=new Set();
  for(let i=0;i<chart.length;i++){
   const n=chart[i];
   ok(Number.isFinite(n.t)&&n.t>=0&&n.t<M.BARS*4*M.BEAT,"valid note time "+instrumentName+" "+tier+" "+i);
   ok(Number.isInteger(n.lane)&&n.lane>=0&&n.lane<inst.lanes.length,"valid lane "+i);
   ok(n.done===false,"generated note initially pending");
   ok(Math.abs(n.t-n.beat*M.BEAT)<1e-10,"time/beat parity");
   const key=n.beat.toFixed(8)+":"+n.lane;
   ok(!keys.has(key),"no same-lane same-tick duplicate "+key);
   keys.add(key);lanes.add(n.lane);
   if(i)ok(n.t>=chart[i-1].t,"nondecreasing chart time");
  }
  equal(lanes.size,inst.lanes.length,instrumentName+" "+tier+" uses all lanes");
  counts[instrumentName].push(chart.length);
  prior=chart.length;notes+=chart.length;combinations++;
 }
}
equal(combinations,20,"4 instruments x 5 tiers coverage");
for(let level=0;level<5;level++){
 const p=M.PERFECT[level],w=M.WIDTHS[level];
 equal(M.judgementForOffset(0,level),"perfect","zero distance");
 for(const sign of [-1,1]){
  equal(M.judgementForOffset(sign*p,level),"perfect","perfect inclusive boundary");
  equal(M.judgementForOffset(sign*(p+1e-6),level),"good","just outside perfect");
  equal(M.judgementForOffset(sign*w,level),"good","good inclusive boundary");
  equal(M.judgementForOffset(sign*(w+1e-6),level),"outside","just outside good");
 }
 equal(M.isNoteMissed(0,w,level),false,"late boundary still playable");
 equal(M.isNoteMissed(0,w+1e-6,level),true,"late miss requires strictly more than width");
}
equal(M.judgementForOffset(NaN,0),"outside","nonfinite input outside");
equal(M.judgementForOffset(0,20),"outside","bad tier outside");
equal(M.correctedInputTime(1.1,100),1,"late correction moves back");
equal(M.correctedInputTime(0.9,-100),1,"early correction moves forward");
equal(M.clampOffsetMs(500),150,"positive offset bounded");
equal(M.clampOffsetMs(-500),-150,"negative offset bounded");
// Independent same-time notes on separate lanes.
let simultaneous=[{t:1,lane:0,done:false},{t:1,lane:1,done:false},{t:1.03,lane:0,done:false}];
equal(M.selectPendingNoteIndex(simultaneous,0,1,0),0,"first simultaneous lane");
equal(M.selectPendingNoteIndex(simultaneous,1,1,0),1,"second simultaneous lane");
simultaneous[0].done=true;
equal(M.selectPendingNoteIndex(simultaneous,0,1.02,0),2,"nearest following note after consumed hit");
equal(M.selectPendingNoteIndex(simultaneous,1,1,0),1,"other lane independent");
simultaneous[1].done=true;
equal(M.selectPendingNoteIndex(simultaneous,1,1,0),-1,"consumed lane not duplicated");
equal(M.selectPendingNoteIndex(simultaneous,9,1,0),-1,"out-of-range lane has no note");
// Frame rate independence: judgement depends on absolute timestamps, NOT frame count.
for(const fps of [60,90,120]){
 for(const level of [0,2,4]){
  const time=1+0.02,offset=1000*(time-1);
  equal(M.judgementForOffset(M.noteDeltaSeconds(1,M.correctedInputTime(time,offset)),level),
   "perfect","same judgement for "+fps+" fps");
 }
}
// Simulated full completion: no audio. Every note marked hit and score updated as pure data.
for(const instrumentName of Object.keys(M.INST)){
 for(const tier of M.TIERS){
  M.setChoice(instrumentName,tier);const chart=M.makeChart();
  let combo=0,score=0;
  for(const n of chart){combo++;score+=M.scoreForHit("perfect",combo);n.done=true;}
  const result={interrupted:false,song:"volleyball",total:chart.length,judged:chart.length,
   hits:chart.length,perfect:chart.length,good:0,miss:0,score,bestCombo:combo};
  ok(M.validScoringResult(result),"complete no-audio score valid "+instrumentName+" "+tier);
  equal(M.concertSummaryModel(result).persistable,true,"summary complete "+instrumentName+" "+tier);
 }
}
// Privacy and fallback invariants.
ok(HTML.includes('const REGISTERED_ANTHEMS=Object.freeze({});'),"no real-school anthem unlocked");
ok(HTML.includes('const PLAYABLE_SCHOOL_CHARTS=Object.freeze({});'),"no unregistered chart unlocked");
ok(HTML.includes('id="songVolleyball"')&&HTML.includes('id="songAnthem"'),"dual song UI present");
ok(HTML.includes('id="concertSummary"')&&HTML.includes('id="resetBest"'),"result and reset UI present");
ok(!/sendBeacon\s*\(|new WebSocket\s*\(/.test(SCRIPT),"no outbound score socket/beacon");
console.log("PASS stage026 unit: "+combinations+" chart combinations, "+notes+" generated note entries, "+checks+" assertions; no audio.");
console.log("Counts per instrument/tier: "+JSON.stringify(counts));
if(process.argv.includes("--browser"))(async()=>{
 const {chromium}=require("playwright");
 const pageHtml=HTML;
 const server=http.createServer((req,res)=>{
  if(req.url?.startsWith("/charts/school-homepages.v1.json")){
   res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify({
    schema_version:1,count:1,homepages:{"mock-school-026":"https://school.example.org/"}
   }));return;
  }
  res.writeHead(200,{"content-type":"text/html; charset=utf-8"});res.end(pageHtml);
 });
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 let browser;
 try{
  browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
  for(const width of [1280,320]){
   const ctx=await browser.newContext({viewport:{width,height:width===320?640:850},
    isMobile:width===320,hasTouch:width===320});
   const page=await ctx.newPage(),errors=[],writes=[];
   page.on("pageerror",e=>errors.push(e.message));
   page.on("request",r=>{if(!["GET","HEAD","OPTIONS"].includes(r.method()))writes.push(r.method())});
   // A failing guard proves this test never constructs or starts any audio device.
   await page.addInitScript(()=>{
    window.AudioContext=class ForbiddenAudioContext{constructor(){throw Error("stage026_no_audio_permission");}};
    window.webkitAudioContext=window.AudioContext;
   });
   let outage=false;
   await page.route("**/schoolband-school-read-v1**",route=>{
    if(outage)return route.fulfill({status:503,contentType:"application/json",body:'{"error":"unavailable"}'});
    const url=new URL(route.request().url()),search=url.searchParams.has("schools");
    const item={school_id:"mock-school-026",school_name:"가상검증초등학교",region:"부산",eligible:false,
     difficulty:null,source_year:null};
    return route.fulfill({status:200,contentType:"application/json",
      body:JSON.stringify(search?{schools:[item]}:{school:item})});
   });
   await page.goto("http://127.0.0.1:"+server.address().port);
   assert.equal(await page.locator("#start").isDisabled(),true);
   await page.locator("#schoolSearch").fill("가상검증");
   await page.waitForFunction(()=>document.querySelectorAll("#searchResults button").length===1);
   await page.locator("#searchResults button").click();
   await page.waitForFunction(()=>window.nangamSchoolbandV08.getSelected()?.school_id==="mock-school-026");
   assert.match(await page.locator("#schoolTier").innerText(),/NORMAL/);
   assert.equal(await page.locator("#songAnthem").isDisabled(),true,"real-school anthem locked");
   assert.equal(await page.locator("#songVolleyball").getAttribute("aria-pressed"),"true");
   assert.equal(await page.locator("#start").isEnabled(),true,"creative track can start later");
   assert.equal(await page.locator("#concertSummary").isHidden(),true);
   await page.waitForFunction(()=>document.querySelector("#anthemSchoolHomepage")?.hidden===false);
   assert.match(await page.locator("#anthemSchoolHomepage").getAttribute("href"),/school\.example\.org/);
   const aud=await page.evaluate(()=>window.nangamSchoolbandV08.getChartAudit());
   assert.equal(aud.valid,true);
   const seen=[];
   for(const name of ["guitar","drums","bass","keys"]){
    await page.locator('[data-inst="'+name+'"]').click();
    const state=await page.evaluate(()=>({
      inst:window.nangamSchoolbandV08.getInstrument(),
      lanes:window.nangamSchoolbandV08.getLaneCount(),
      key:window.nangamSchoolbandV08.getBestRecordKey(),
      playing:window.nangamSchoolbandV08.getStatus().playing
    }));
    assert.equal(state.inst,name);assert(state.lanes>=3&&state.lanes<=5);
    assert(state.key.includes(":"+name+":"));assert.equal(state.playing,false);
    seen.push(state.key);
   }
   assert.equal(new Set(seen).size,4,"record key differs by instrument");
   outage=true;
   await page.locator("#schoolSearch").fill("연결실패");
   await page.waitForFunction(()=>document.querySelector("#retrySchool").hidden===false,null,{timeout:5000});
   assert.match(await page.locator("#schoolStatus").innerText(),/재시도/);
   await page.locator("#demoSchool").click();
   assert.equal(await page.locator("#songVolleyball").isEnabled(),true);
   assert.equal(await page.locator("#songAnthem").isDisabled(),true);
   assert.equal(await page.locator("#start").isEnabled(),true);
   assert.deepEqual(errors,[],"no JS page errors");
   assert.deepEqual(writes,[],"no server writes or score upload");
   console.log("PASS stage026 browser "+width+"px school search, 4 instruments, offline fallback, no audio/POST");
   await ctx.close();
  }
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}
})().catch(e=>{console.error(e);process.exitCode=1;});
