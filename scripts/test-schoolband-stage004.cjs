#!/usr/bin/env node
"use strict";
const fs=require("node:fs");
const path=require("node:path");
const http=require("node:http");
const vm=require("node:vm");
const assert=require("node:assert/strict");
const {performance}=require("node:perf_hooks");

const ROOT=path.resolve(__dirname,"..");
const HTML=fs.readFileSync(path.join(ROOT,"games/nangam-schoolband-v08/index.html"),"utf8");
const OUT=path.join(ROOT,"artifacts/schoolband-stage004");
fs.mkdirSync(OUT,{recursive:true});
const evidence={stage:"004/030",environment:"Chromium Playwright simulated mobile/desktop; not physical devices",checks:[],scenarios:{},limitations:[
  "Browser automation cannot prove actual speaker audio or a physical handset vibration motor.",
  "System prefers-reduced-motion is emulated; hardware accessibility settings need physical-device confirmation.",
  "School data is mocked; no production Supabase data writes or live privileged queries.",
  "Input latency calibration and chart-boundary precision are covered in stages 005–007."
]};
function save(){fs.writeFileSync(path.join(OUT,"results.json"),JSON.stringify(evidence,null,2)+"\n")}
function checkStatic(){
  const js=HTML.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert(js,"inline game JavaScript");
  new vm.Script(js,{filename:"schoolband004.js"});
  for(const id of ['id="reduceFx"','id="vibrationFx"','id="laneFx"','id="comboFx"'])assert(HTML.includes(id),id+" not found");
  assert(HTML.includes('prefers-reduced-motion:reduce'),"CSS reduced-motion query");
  assert(HTML.includes('html[data-reduced-fx="true"]'),"manual reduced motion selectors");
  assert(HTML.includes("function laneFeedback(lane,type)"),"per lane feedback logic");
  assert(HTML.includes('laneFeedback(n.lane,"miss")'),"miss feedback");
  assert(HTML.includes('laneFeedback(lane,"empty")'),"empty lane distinguishability");
  assert(HTML.includes('combo<3||!(combo===3||combo%5===0)'),"combo milestone guard");
  assert(HTML.includes("vibrationEnabled&&!motionReduced()"),"vibration must be opt in and off during reduction");
  assert(HTML.includes('clearFxFeedback();'),"cleanup on start/stop");
  assert(HTML.includes("setTimeout(()=>{el.className=kind},holdMs)"),"reduced effects must disappear");
  evidence.checks.push({name:"JS syntax, UI controls, low-motion styles, distinct hit/miss/empty events",passed:true});
  console.log("PASS stage004 static syntax and animation/accessibility contracts");
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function waitUntilAudio(page,target,timeoutMs=4500){
  return page.evaluate(async({target,timeoutMs})=>{
    const api=window.nangamSchoolbandV08,deadline=performance.now()+timeoutMs;
    while(api.getPlayhead()<target&&performance.now()<deadline)await new Promise(r=>setTimeout(r,2));
    if(api.getPlayhead()<target)throw Error("audio playhead did not advance to "+target);
    return api.getPlayhead();
  },{target,timeoutMs});
}
async function createSession(browser,origin,{name,tier="extreme",viewport={width:390,height:844},reducedMotion="no-preference",mobile=true}){
  const context=await browser.newContext({viewport,reducedMotion,hasTouch:mobile,isMobile:mobile,deviceScaleFactor:1});
  await context.addInitScript(()=>{
    window.__vibrationCalls=[];
    try{Object.defineProperty(navigator,"vibrate",{configurable:true,value:(duration)=>{window.__vibrationCalls.push(duration);return true}})}catch(_){}
  });
  let apiCalls=0;
  await context.route("**/functions/v1/schoolband-school-read-v1*",async route=>{
    apiCalls++;
    const url=new URL(route.request().url());
    const data=url.searchParams.has("schools")?
      {schools:[{school_id:"schoolband-004",school_name:"효과검증학교",sido_standard:"가상지역"}]}:
      {school:{school_id:"schoolband-004",school_name:"효과검증학교",region:"가상",eligible:true,difficulty:tier,source_year:2025}};
    await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(data)});
  });
  const page=await context.newPage();
  const errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  const response=await page.goto(origin,{waitUntil:"domcontentloaded"});
  assert(response.ok(),"HTML status must be 200");
  await page.locator("#schoolSearch").fill("효과검증");
  await page.locator("#searchResults button").first().click();
  const label={easy:"EASY",normal:"NORMAL",hard:"HARD",very_hard:"VERY HARD",extreme:"EXTREME"}[tier];
  await page.waitForFunction(exp=>document.querySelector("#schoolTier")?.textContent?.includes(exp),label);
  const noOverflow=await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+2);
  assert(noOverflow,name+" horizontal overflow");
  await page.locator('[data-inst="drums"]').click();
  assert.equal(await page.locator("#pads .taphit").count(),4);
  return {name,context,page,errors,getCalls:()=>apiCalls};
}
const padSelector=lane=>"#pads .taphit[data-lane=\""+lane+"\"]";
async function tapNow(page,lane){
  return page.evaluate(lane=>{
    const api=window.nangamSchoolbandV08;
    const before=api.getStatus();
    document.querySelector('#pads .taphit[data-lane="'+lane+'"]').dispatchEvent(new PointerEvent("pointerdown",{bubbles:true,cancelable:true}));
    return {before,after:api.getStatus(),fx:api.getEffectState(),playhead:api.getPlayhead()};
  },lane);
}
async function main(){
  checkStatic();
  let chromium;
  try{({chromium}=require("playwright"))}catch(e){throw Error("Install Playwright Chromium first: "+e.message)}
  const server=http.createServer((_,res)=>{
    res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"});
    res.end(HTML);
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const origin="http://127.0.0.1:"+server.address().port+"/";
  let browser;
  try{
    browser=await chromium.launch({headless:true,args:["--no-sandbox","--autoplay-policy=no-user-gesture-required"]});
    // Rhythm: 3 eighth/16th hi-hat hits, a same-time 2-lane chord, and a wrong-lane tap.
    {
      const x=await createSession(browser,origin,{name:"combo-simultaneous"});
      const {page,context}=x;
      assert.equal(await page.locator("#vibrationFx").isChecked(),false,"vibration defaults off");
      assert.equal(await page.locator("#reduceFx").isChecked(),false,"animations enabled by default when OS does not reduce");
      await page.locator("#start").click();
      const chart=await page.evaluate(()=>window.nangamSchoolbandV08.getChart());
      const solo=chart.filter(n=>n.lane===2&&n.t>.10&&n.t<.48).slice(0,3);
      assert.equal(solo.length,3,"three consecutive hi-hats");
      const results=[];
      for(const note of solo){
        await waitUntilAudio(page,note.t-.006);
        const hit=await tapNow(page,2);
        assert.equal(hit.after.hits,hit.before.hits+1,"expected a successful hit");
        assert(hit.fx.laneMessages[2].visible,"per-lane badge not visible");
        assert(hit.fx.laneMessages[2].message==="PERFECT"||hit.fx.laneMessages[2].message==="GOOD");
        results.push({t:note.t,playhead:hit.playhead,combo:hit.after.combo,score:hit.after.score,lanes:hit.fx.laneMessages.map(z=>z.message)});
      }
      const third=await page.evaluate(()=>({status:window.nangamSchoolbandV08.getStatus(),fx:window.nangamSchoolbandV08.getEffectState()}));
      assert.equal(third.status.combo,3,"3 combo expected");
      assert.equal(third.fx.comboMessage,"3 COMBO");
      assert.equal(third.fx.comboVisible,true);
      assert.equal(await page.evaluate(()=>window.__vibrationCalls.length),0,"default off should not vibrate");
      const step4=(60/108);
      const pair=chart.filter(n=>Math.abs(n.t-step4)<1e-6&&[1,2].includes(n.lane));
      assert.equal(pair.length,2,"two simultaneous drum notes");
      await waitUntilAudio(page,step4-.005);
      const pairHit=await page.evaluate(()=>{
        const api=window.nangamSchoolbandV08;
        const before=api.getStatus();
        for(const lane of [1,2])document.querySelector('#pads .taphit[data-lane="'+lane+'"]').dispatchEvent(new PointerEvent("pointerdown",{bubbles:true,cancelable:true}));
        const after=api.getStatus(),fx=api.getEffectState();
        const rects=[1,2].map(lane=>{
          const b=document.querySelector('#laneFx [data-lane="'+lane+'"] .lane-event').getBoundingClientRect();
          return {x:b.x,right:b.right,width:b.width};
        });
        return {before,after,fx,rects};
      });
      assert.equal(pairHit.after.hits,pairHit.before.hits+2,"two simultaneous notes must both score");
      assert.equal(pairHit.after.combo,5,"simultaneous notes must increment combo independently");
      assert.equal(pairHit.fx.comboMessage,"5 COMBO");
      for(const lane of [1,2]){
        assert(pairHit.fx.laneMessages[lane].visible,"lane "+lane+" lost overlay");
        assert(/PERFECT|GOOD/.test(pairHit.fx.laneMessages[lane].message));
      }
      assert(pairHit.rects[0].right<=pairHit.rects[1].x,"per-lane effects overlap in horizontal axis");
      assert.equal(await page.locator("#laneFx").evaluate(el=>getComputedStyle(el).pointerEvents),"none","overlays must not block taps");
      await page.locator(".stage-wrap").screenshot({path:path.join(OUT,"simultaneous-lanes.png")});
      const wrong=await tapNow(page,0);
      assert.equal(wrong.after.emptyPresses,wrong.before.emptyPresses+1,"empty lane must be counted separately");
      assert.equal(wrong.after.miss,wrong.before.miss,"wrong lane must not count as a missed chart note");
      assert.equal(wrong.after.combo,wrong.before.combo,"empty lane should not reset combo");
      assert.equal(wrong.fx.laneMessages[0].message,"NO NOTE");
      assert.equal(wrong.fx.laneMessages[0].visible,true);
      evidence.scenarios.combo_same_time_and_empty={
        passed:true,solo:results,simultaneous:{combo:pairHit.after.combo,hit_delta:pairHit.after.hits-pairHit.before.hits,lane_events:[pairHit.fx.laneMessages[1].message,pairHit.fx.laneMessages[2].message],bounds:pairHit.rects},
        wrong:{emptyPresses:wrong.after.emptyPresses,missUnchanged:true,comboUnchanged:true},
        vibrationCalls:await page.evaluate(()=>window.__vibrationCalls.length),mockedSchoolApiCalls:x.getCalls()
      };
      console.log("PASS combo 3→5 and simultaneous 2 lanes; WRONG NO NOTE distinct from MISS; no unsolicited vibration");
      await page.locator("#stop").click();
      assert.deepEqual(x.errors,[]);
      await context.close();
    }
    // MISS only: wait until real audio clock passes the note's allowed late boundary.
    {
      const x=await createSession(browser,origin,{name:"miss-auto"});
      const {page,context}=x;
      await page.locator("#start").click();
      await page.waitForFunction(()=>{
        const api=window.nangamSchoolbandV08,s=api.getStatus(),fx=api.getEffectState();
        return s.miss>0&&fx.laneMessages.some(x=>x.visible&&x.message==="MISS");
      },null,{timeout:5500});
      const snapshot=await page.evaluate(()=>({status:window.nangamSchoolbandV08.getStatus(),fx:window.nangamSchoolbandV08.getEffectState()}));
      assert.equal(snapshot.status.emptyPresses,0);
      assert(snapshot.status.miss>0);
      assert(snapshot.fx.laneMessages.some(x=>x.message==="MISS"&&x.visible));
      await page.screenshot({path:path.join(OUT,"miss-badge.png")});
      evidence.scenarios.miss={passed:true,missedNotes:snapshot.status.miss,emptyPresses:snapshot.status.emptyPresses,visibleLane: snapshot.fx.laneMessages.findIndex(x=>x.message==="MISS"&&x.visible)};
      console.log("PASS true MISS event visible, without empty lane input");
      await page.locator("#stop").click();await context.close();
      assert.deepEqual(x.errors,[]);
    }
    // Genuine GOOD (within 200ms easy window, outside 90ms PERFECT window).
    {
      const x=await createSession(browser,origin,{name:"good-window",tier:"easy"});
      const {page,context}=x;
      await page.locator("#start").click();
      await waitUntilAudio(page,.125);
      const input=await tapNow(page,0);
      assert.equal(input.after.hits,input.before.hits+1,"easy first note needs GOOD hit");
      assert.equal(input.fx.laneMessages[0].message,"GOOD","GOOD visual must differ from PERFECT");
      evidence.scenarios.good={passed:true,actualPlayhead:input.playhead,laneText:input.fx.laneMessages[0].message};
      console.log("PASS GOOD vs PERFECT judgement is visibly distinct");
      await page.locator("#stop").click();await context.close();
      assert.deepEqual(x.errors,[]);
    }
    // OS-level prefers-reduced-motion: no particles or vibrating, no stuck text.
    {
      const x=await createSession(browser,origin,{name:"system-reduced",reducedMotion:"reduce",viewport:{width:320,height:640}});
      const {page,context}=x;
      assert.equal(await page.locator("#reduceFx").isChecked(),true);
      assert.equal(await page.locator("#reduceFx").isDisabled(),true,"OS reduction cannot be overridden");
      assert.equal(await page.locator("#vibrationFx").isDisabled(),true);
      await page.locator("#start").click();
      await waitUntilAudio(page,.132);
      const input=await tapNow(page,2);
      assert.equal(input.after.hits,input.before.hits+1);
      assert.equal(input.fx.reducedMotion,true);
      assert.equal(input.fx.particleCount,0);
      assert.equal(input.fx.vibrationEnabled,false);
      assert.equal(await page.locator("#judgeFx").evaluate(el=>getComputedStyle(el).animationName),"none");
      assert.equal(await page.locator("#impactRing").evaluate(el=>getComputedStyle(el).display),"none");
      await page.locator(".stage-wrap").screenshot({path:path.join(OUT,"system-reduced-hit.png")});
      await page.waitForTimeout(310);
      const ended=await page.evaluate(()=>({cls:document.querySelector("#judgeFx").className,opacity:getComputedStyle(document.querySelector("#judgeFx")).opacity,lanes:window.nangamSchoolbandV08.getEffectState().laneMessages,vibrations:window.__vibrationCalls.length}));
      assert(!ended.cls.includes("animate"),"reduced-motion judgement must clear");
      assert.equal(ended.opacity,"0","reduced-motion judgement must not remain stuck");
      assert.equal(ended.vibrations,0);
      evidence.scenarios.system_reduced={passed:true,particleCount:input.fx.particleCount,judgeHiddenAfterMs:310,vibrationCount:ended.vibrations,canvasWidth:await page.locator("#track").evaluate(el=>el.getBoundingClientRect().width)};
      console.log("PASS OS reduced-motion: no particles, shake/ring disabled, judgement auto-clears, no vibration");
      await page.locator("#stop").click();await context.close();
      assert.deepEqual(x.errors,[]);
    }
    // Manual settings persist; opt-in vibration is the only way to vibrate.
    {
      const x=await createSession(browser,origin,{name:"manual-effects"});
      const {page,context}=x;
      await page.locator("#reduceFx").check();
      assert.equal(await page.locator("#vibrationFx").isDisabled(),true);
      assert.equal(await page.evaluate(()=>document.documentElement.dataset.reducedFx),"true");
      const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem("nangam-band-fx-v1")));
      assert.equal(stored.reduce,true,"manual reduce persists");
      await page.reload({waitUntil:"domcontentloaded"});
      assert.equal(await page.locator("#reduceFx").isChecked(),true,"manual reduction restored after reload");
      await page.locator("#reduceFx").uncheck();
      assert.equal(await page.locator("#vibrationFx").isDisabled(),false);
      await page.locator("#vibrationFx").check();
      assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem("nangam-band-fx-v1")).vibration),true,"vibration opt in stored");
      await page.locator("#schoolSearch").fill("효과검증");
      await page.locator("#searchResults button").first().click();
      await page.waitForFunction(()=>document.querySelector("#schoolTier")?.textContent?.includes("EXTREME"));
      await page.locator('[data-inst="drums"]').click();
      await page.locator("#start").click();
      await waitUntilAudio(page,.132);
      const input=await tapNow(page,2);
      assert.equal(input.after.hits,input.before.hits+1);
      const calls=await page.evaluate(()=>window.__vibrationCalls);
      assert(calls.length>=1,"opt-in vibration must issue a vibrate call");
      assert.equal(input.fx.reducedMotion,false);
      evidence.scenarios.manual_controls={passed:true,preferencesPersisted:true,vibrationOptInCallCount:calls.length};
      console.log("PASS user reduction persistence and vibration opt-in gating");
      await page.locator("#stop").click();await context.close();
      assert.deepEqual(x.errors,[]);
    }
    evidence.checks.push({name:"Chromium hit/per-lane combo/miss/no-note/GOOD, OS and manual low-motion, vibration opt-in",passed:true});
  }finally{
    if(browser)await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
}
(async()=>{const started=performance.now();await main();evidence.runtime_ms=Math.round(performance.now()-started);save();console.log("PASS stage 004 all automated scenarios; artifacts/schoolband-stage004/results.json");})()
.catch(error=>{evidence.failure=String(error.stack||error);save();console.error("FAIL stage004",error.stack||String(error));process.exitCode=1});
