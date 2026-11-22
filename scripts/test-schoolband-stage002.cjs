#!/usr/bin/env node
"use strict";

/**
 * Stage 002: one-command JavaScript syntax + chart contracts + negative controls +
 * real Chromium DOM/interaction + measured browser timing baseline.
 *
 * npm install --no-save --no-package-lock playwright && npx playwright install chromium
 * node scripts/test-schoolband-stage002.cjs
 *
 * All browser school API calls are intercepted with explicitly fake PUBLIC fixtures.
 * This script DOES NOT call or mutate production APIs/database.
 */
const fs=require("node:fs");
const path=require("node:path");
const assert=require("node:assert/strict");
const vm=require("node:vm");
const http=require("node:http");
const {performance}=require("node:perf_hooks");
const htmlPath=path.resolve(__dirname,"../games/nangam-schoolband-v08/index.html");
const html=fs.readFileSync(htmlPath,"utf8");
const outputDir=path.resolve(__dirname,"../artifacts/schoolband-stage002");
const TIERS=["easy","normal","hard","very_hard","extreme"];
const LANES={guitar:4,drums:4,bass:3,keys:5};
const PER_BAR={
  guitar:[5,7,9,11,18],drums:[4,6,9,14,21],
  bass:[4,6,8,10,16],keys:[5,7,8,10,18]
};
const records={source_sha:null,static_checks:[],negative_controls:[],browser_checks:[],performance:{},privacy_checks:[],limitations:[]};

function scriptOf(source){
  const m=source.match(/<script>([\s\S]*?)<\/script>/i);
  assert(m,"inline game script missing");
  return m[1];
}
function extractBlock(source,label,begin,end){
  const p=source.indexOf(label);
  assert(p>=0,"missing "+label);
  const start=source.indexOf(begin,p+label.length);
  assert(start>=0,"no "+begin+" for "+label);
  let depth=0,quote=null;
  for(let i=start;i<source.length;i++){
    const c=source[i];
    if(quote){if(c===quote&&source[i-1]!=="\\")quote=null;continue;}
    if(c==='"'||c==="'"){quote=c;continue;}
    if(c===begin)depth++;
    if(c===end&&!--depth)return source.slice(start,i+1);
  }
  throw new Error("unbalanced "+label);
}
function extractValue(source,label,begin,end){
  return JSON.parse(extractBlock(source,label,begin,end));
}
function verify(source){
  const js=scriptOf(source);
  new vm.Script(js,{filename:"nangam-schoolband-v08.inline.js"});
  const parts=extractValue(js,"const PARTS=","{","}");
  const melody=extractValue(js,"const MELODY=","[","]");
  const chords=extractValue(js,"const CHORD_ROOTS=","[","]");
  assert.equal(melody.length,28,"28 original melody events required");
  assert.equal(chords.length,8,"8 chord roots required");
  assert(/rounded\(x\+4,y-12,lw-8,24,7\)/.test(js),"24px note thickness");
  assert(js.includes("AudioContext")&&js.includes("ctx.currentTime"),"shared audio clock");
  assert(/const TIERS=\["easy","normal","hard","very_hard","extreme"\]/.test(js),"5 public tiers");
  let combos=0;
  for(const [instrument,numLanes] of Object.entries(LANES)){
    const events=parts[instrument];assert(Array.isArray(events),instrument+" part exists");
    for(let diff=0;diff<TIERS.length;diff++){
      const picked=events.filter(e=>e[2]<=diff);
      assert.equal(picked.length,PER_BAR[instrument][diff],instrument+" "+TIERS[diff]+" expected density");
      for(const [at,lane,minTier] of picked){
        assert(Number.isInteger(at)&&at>=0&&at<16,"step bounds");
        assert(Number.isInteger(lane)&&lane>=0&&lane<numLanes,instrument+" invalid lane");
        assert(Number.isInteger(minTier)&&minTier>=0&&minTier<=4,"tier bounds");
      }
      for(let lane=0;lane<numLanes;lane++){
        assert(picked.some(e=>e[1]===lane),instrument+" "+TIERS[diff]+" missing lane "+lane);
      }
      combos++;
    }
  }
  assert.equal(combos,20);
  return {script:js,parts,melody,chords,combos};
}
function detected(label,source){
  let caught=null;
  try{verify(source);}catch(e){caught=String(e.message||e);}
  assert(caught,"NEGATIVE CONTROL MISSED: "+label);
  records.negative_controls.push({test:label,detected:true,reason:caught});
  console.log("PASS negative-control "+label+": "+caught.slice(0,120));
}
function percentile(sorted,p){return sorted[Math.min(sorted.length-1,Math.max(0,Math.ceil(sorted.length*p)-1))]||0;}
function stats(v){
  const a=v.filter(Number.isFinite).sort((x,y)=>x-y);
  if(!a.length)return {n:0};
  return {n:a.length,median_ms:+percentile(a,.5).toFixed(3),p95_ms:+percentile(a,.95).toFixed(3),max_ms:+a[a.length-1].toFixed(3)};
}
function persist(){fs.mkdirSync(outputDir,{recursive:true});fs.writeFileSync(path.join(outputDir,"metrics.json"),JSON.stringify(records,null,2)+"\n");}
async function browserSuite(){
  let chromium;
  try{({chromium}=require("playwright"));}catch(e){throw new Error("Playwright not installed; run npm install --no-save --no-package-lock playwright and npx playwright install chromium");}
  const server=http.createServer((req,res)=>{
    if(req.url==="/"||req.url==="/games/nangam-schoolband-v08/index.html"){
      res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"});
      res.end(html);
    }else{res.writeHead(404,{"Content-Type":"text/plain"});res.end("Not Found");}
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const origin="http://127.0.0.1:"+server.address().port;
  let browser;
  try{
    browser=await chromium.launch({headless:true,args:["--no-sandbox","--autoplay-policy=no-user-gesture-required"]});
    for(const [name,viewport,touch] of [
      ["desktop",{width:1280,height:900},false],
      ["mobile320",{width:320,height:640},true]
    ]){
      const context=await browser.newContext({viewport,hasTouch:touch,isMobile:touch,deviceScaleFactor:1});
      let currentTier="normal",observedRequests=0,unmockedApi=0;
      await context.route("**/functions/v1/schoolband-school-read-v1*",async route=>{
        observedRequests++;
        const url=new URL(route.request().url());
        if(url.searchParams.has("schools")){
          return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({schools:[{school_id:"schoolband-test-002",school_name:"검증초등학교",sido_standard:"가상지역"}]})});
        }
        if(url.searchParams.has("school_id")){
          assert.equal(url.searchParams.get("school_id"),"schoolband-test-002");
          return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({school:{
            school_id:"schoolband-test-002",school_name:"검증초등학교",region:"가상지역",
            eligible:true,difficulty:currentTier,source_year:2025,
            private_survey_answer:"NEVER_PRINT_PRIVATE_002",secret_contact:"NEVER_PRINT_PRIVATE_002"
          }})});
        }
        unmockedApi++;
        return route.fulfill({status:400,contentType:"application/json",body:'{"error":"unknown_query"}'});
      });
      const page=await context.newPage();
      const errors=[];page.on("pageerror",e=>errors.push(String(e)));
      const loaded=await page.goto(origin+"/games/nangam-schoolband-v08/index.html",{waitUntil:"domcontentloaded",timeout:20000});
      assert(loaded.ok());assert(/text\/html/i.test(loaded.headers()["content-type"]));
      assert.equal(await page.locator("#track").count(),1,"game canvas");
      const clickSamples=[];
      let totalCombos=0,privateUiCount=0;
      for(const [diff,tier] of TIERS.entries()){
        currentTier=tier;
        await page.locator("#schoolSearch").fill("");
        await page.locator("#schoolSearch").fill("검증초");
        await page.locator("#searchResults button").first().waitFor({state:"visible",timeout:10000});
        await page.locator("#searchResults button").first().click();
        await page.waitForFunction(()=>document.querySelector("#schoolTitle")?.textContent?.includes("검증초등학교"),null,{timeout:10000});
        assert((await page.locator("#schoolTier").innerText()).includes(["EASY","NORMAL","HARD","VERY HARD","EXTREME"][diff]),"tier label");
        for(const [inst,numLanes] of Object.entries(LANES)){
          const ms=await page.evaluate(key=>{
            const start=performance.now();
            document.querySelector('[data-inst="'+key+'"]').click();
            return performance.now()-start;
          },inst);
          clickSamples.push(ms);
          assert.equal(await page.locator("#pads .taphit").count(),numLanes,inst+" pad count");
          const lanes=await page.evaluate(()=>window.nangamSchoolbandV08.getLanes());
          assert.equal(lanes.length,numLanes,inst+" lane public contract");
          await page.locator("#start").click();
          const chart=await page.evaluate(()=>window.nangamSchoolbandV08.getChart());
          assert.equal(chart.length,PER_BAR[inst][diff]*8,inst+" "+tier+" chart count");
          for(let i=0;i<numLanes;i++)assert(chart.some(n=>n.lane===i),inst+" "+tier+" chart lane "+i);
          const scoreStatus=await page.evaluate(()=>window.nangamSchoolbandV08.getStatus());
          assert.equal(scoreStatus.playing,true,inst+" "+tier+" should be playing");
          if(tier==="normal"&&inst==="drums"){
            const measurements=await page.evaluate(async()=>{
              const p=document.querySelector("#pads .taphit");
              const delays=[],paint=[];
              for(let i=0;i<12;i++){
                const start=performance.now();
                p.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true,cancelable:true}));
                delays.push(performance.now()-start);
                const at=performance.now();
                await new Promise(requestAnimationFrame);
                paint.push(performance.now()-at);
              }
              const stamps=[];
              for(let i=0;i<45;i++)stamps.push(await new Promise(r=>requestAnimationFrame(t=>r(t))));
              return {input_dispatch_ms:delays,first_raf_ms:paint,frame_interval_ms:stamps.slice(1).map((t,i)=>t-stamps[i])};
            });
            records.performance[name]={input_dispatch_to_handler_ms:stats(measurements.input_dispatch_ms),dispatch_to_next_raf_ms:stats(measurements.first_raf_ms),frame_interval_ms:stats(measurements.frame_interval_ms)};
            // This is synthetic DOM dispatch timing, NOT real human touch-to-audio latency.
            if(touch){
              await page.locator("#pads .taphit").first().tap();
              assert((await page.locator("#pads .taphit").first().getAttribute("class")).includes("pressed"),"mobile browser touch class");
            }
          }
          await page.locator("#stop").click();
          assert.equal(await page.evaluate(()=>window.nangamSchoolbandV08.getStatus().playing),false);
          totalCombos++;
        }
        const text=(await page.locator("body").innerText());
        if(text.includes("NEVER_PRINT_PRIVATE_002"))privateUiCount++;
      }
      assert.equal(totalCombos,20);assert.equal(privateUiCount,0,"server fixture secret must not render");
      assert.equal(unmockedApi,0);
      assert(observedRequests>=10,"school search/detail must both occur for 5 tiers");
      assert.deepEqual(errors,[],name+" page errors");
      await page.screenshot({path:path.join(outputDir,name+"-final.png"),fullPage:true});
      records.browser_checks.push({name,viewport,play_count:totalCombos,api_mocked:true,search_requests:observedRequests,unmocked_requests:unmockedApi,pass:true});
      records.privacy_checks.push({name,canary:"NEVER_PRINT_PRIVATE_002",rendered:false});
      records.performance[name].instrument_switch_ms=stats(clickSamples);
      console.log("PASS browser "+name+": "+totalCombos+"/20 charts, mocked search/detail, 3-5 touch pads, start/stop, privacy canary");
      await context.close();
    }
  }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
}
(async()=>{
  const t0=performance.now();
  const game=verify(html);
  records.static_checks.push({name:"vm.Script syntax and 20/20 chart invariants",pass:true,melody_count:game.melody.length});
  console.log("PASS static: JS syntax, 28 melody notes, 20/20 chart contracts");
  detected("invalid-JS-syntax",html.replace("</script>","function broken( {</script>"));
  detected("notes-24-to-20px",html.replace("rounded(x+4,y-12,lw-8,24,7)","rounded(x+4,y-12,lw-8,20,7)"));
  const damaged=structuredClone(game.parts);damaged.keys[0][1]=100;
  const changedScript=game.script.replace(extractBlock(game.script,"const PARTS=","{","}"),JSON.stringify(damaged));
  detected("chart-lane-out-of-range",html.replace(game.script,changedScript));
  records.performance.static_validation_ms=+(performance.now()-t0).toFixed(3);
  records.limitations=[
    "Mocked school data is synthetic; no production database, RLS or real private response accessed.",
    "Browser input latency measures JS dispatch→handler and next rAF, not physical input hardware or audio output latency.",
    "Chromium responsive emulation is not Android/iOS physical-device verification.",
    "RawGitHack first-visit notice SB-007 remains a separate trial-hosting defect.",
    "Sound cancellation, visibility handling, scoring fairness and real-device timing are future stages."
  ];
  persist();
  await browserSuite();
  persist();
  console.log("PASS stage 002 all contracts; metrics="+path.relative(process.cwd(),path.join(outputDir,"metrics.json")));
})().catch(e=>{records.failure=String(e.stack||e);persist();console.error("FAIL stage 002",e.stack||String(e));process.exitCode=1;});
