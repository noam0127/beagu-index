#!/usr/bin/env node
"use strict";
const fs=require("node:fs");
const path=require("node:path");
const http=require("node:http");
const cp=require("node:child_process");
const assert=require("node:assert/strict");
const vm=require("node:vm");
const {performance}=require("node:perf_hooks");
const ROOT=path.resolve(__dirname,"..");
const GAME="games/nangam-schoolband-v08/index.html";
const current=fs.readFileSync(path.join(ROOT,GAME),"utf8");
const baselineSha="582fc4fb3f92e93c6841209a864dfb3377b0b73f";
const baseline=cp.execFileSync("git",["show",baselineSha+":"+GAME],{cwd:ROOT,encoding:"utf8"});
const out=path.join(ROOT,"artifacts/schoolband-stage003");
fs.mkdirSync(out,{recursive:true});
const report={baseline_sha:baselineSha,stage:"003/030",generated_by:"Chromium headless, Playwright; no physical device",static:{},browser:{},risks:[]};
function save(){fs.writeFileSync(path.join(out,"results.json"),JSON.stringify(report,null,2)+"\n")}
function assertStatic(){
  const script=current.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert(script);
  new vm.Script(script);
  assert(current.includes("rounded(x+4,y-12,lw-8,24,7)"),"24px note retained");
  assert(current.includes("NOTE_PREVIEW_SECONDS=1.16"),"preview increased fall speed");
  assert(current.includes("PARTICLE_LIMIT=60"),"particle hard cap");
  assert(current.includes("performance.now()-lastImpactAt"),"monotonic FX clock");
  assert(current.includes('getEffectState:()=>'),"FX test instrumentation");
  assert(current.includes("g.createLinearGradient"),"note gloss");
  const stepSec=60/108/4;
  const old=240/1.40*stepSec;
  const next=240/1.16*stepSec;
  assert(old<24,"baseline overlap must be reproducible");
  assert(next-24>=4,"target gap below 4 internal pixels");
  report.static={bpm:108,sixteenth_seconds:stepSec,note_height_canvas_px:24,original_step_spacing_px:old,new_step_spacing_px:next,original_gap_px:old-24,new_gap_px:next-24,max_particle_count:60,css_reduced_motion:current.includes("prefers-reduced-motion")};
  console.log("PASS static 24px note, 108 BPM, 16th spacing "+old.toFixed(2)+"→"+next.toFixed(2)+"px, "+(next-24).toFixed(2)+"px gap");
}
function json(data){return JSON.stringify(data)}
async function smoke(){
  let chromium;
  try{({chromium}=require("playwright"));}catch(e){throw Error("Missing Playwright: "+e.message)}
  const server=http.createServer((req,res)=>{
    const b=req.url?.split("?")[0]==="/before"?baseline:current;
    res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"});res.end(b);
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const origin="http://127.0.0.1:"+server.address().port;
  let browser;
  try{
    browser=await chromium.launch({headless:true,args:["--no-sandbox","--autoplay-policy=no-user-gesture-required"]});
    for(const [name,viewport,mobile] of [["desktop",{width:1280,height:850},false],["mobile320",{width:320,height:640},true]]){
      report.browser[name]={};
      for(const variant of ["before","after"]){
        const context=await browser.newContext({viewport,isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1});
        let apiCount=0;await context.route("**/functions/v1/schoolband-school-read-v1*",route=>{
          apiCount++;
          const u=new URL(route.request().url());
          const body=u.searchParams.has("schools")?{schools:[{school_id:"schoolband-003-fixture",school_name:"가상연습학교",sido_standard:"가상"}]}:
            {school:{school_id:"schoolband-003-fixture",school_name:"가상연습학교",region:"가상",eligible:true,difficulty:"extreme",source_year:2025}};
          return route.fulfill({status:200,contentType:"application/json",body:json(body)});
        });
        const page=await context.newPage(),errors=[];
        page.on("pageerror",e=>errors.push(e.message));
        const response=await page.goto(origin+"/"+variant,{waitUntil:"domcontentloaded"});
        assert(response.ok()&&/text\/html/.test(response.headers()["content-type"]));
        await page.locator("#schoolSearch").fill("가상연습");
        await page.locator("#searchResults button").first().click();
        await page.waitForFunction(()=>document.querySelector("#schoolTier")?.textContent?.includes("EXTREME"));
        await page.locator('[data-inst="keys"]').click();
        assert.equal(await page.locator("#pads .taphit").count(),5);
        const padBounds=await page.locator("#pads .taphit").evaluateAll(els=>els.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,right:r.right,width:r.width,height:r.height}}));
        for(let i=0;i<padBounds.length;i++){
          assert(padBounds[i].width>32&&padBounds[i].height>=68,"usable pad box");
          if(i>0)assert(padBounds[i].x>=padBounds[i-1].right,"pad hit areas must not overlap");
        }
        const edge=await page.evaluate(()=>({viewport:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
        assert(edge.scroll<=edge.viewport+2,"horizontal overflow: "+json(edge));
        await page.locator("#start").click();
        await page.waitForTimeout(1450);
        const shot=path.join(out,name+"-"+variant+".png");
        await page.locator(".stage-wrap").screenshot({path:shot});
        const canvasMetrics=await page.evaluate(()=>{
          const c=document.getElementById("track"),ctx=c.getContext("2d");
          const w=c.getBoundingClientRect().width;
          const api=window.nangamSchoolbandV08;
          const playhead=api?.getPlayhead?.();
          const m=api?.getVisualMetrics?.();
          let sample=null;
          if(m){
            const ahead=api.getChart().filter(n=>!n.done && (n.t-playhead)>.25 && (n.t-playhead)<1.0);
            const a=ahead.find(n=>n.lane<5);
            if(a){
              const gap=4,margin=9,N=5,lw=(c.width-2*margin-gap*(N-1))/N;
              const x=Math.round(margin+a.lane*(lw+gap)+lw/2),y=Math.round(c.height-72-(a.t-playhead)/m.previewSeconds*240);
              const pixel=ctx.getImageData(x,y,1,1).data;
              sample={x,y,pixel:Array.from(pixel),lane:a.lane};
            }
          }
          return {cssWidth:w,cssHeight:c.getBoundingClientRect().height,apiMetrics:m,sample};
        });
        if(variant==="after"){
          assert(canvasMetrics.apiMetrics,"visual metrics required");
          const m=canvasMetrics.apiMetrics;
          assert.equal(m.noteHeight,24);
          assert(m.gapPx>=4&&m.stepSpacingPx>=28);
          assert(m.cssWidth>=200);
          assert(m.cssWidth/380*24>=16,"effective mobile note thickness below 16 CSS px");
          assert(canvasMetrics.sample&&Math.max(...canvasMetrics.sample.pixel.slice(0,3))>=140,"visible note pixel contrast missing");
        }
        assert.deepEqual(errors,[],"browser errors "+name+" "+variant);
        report.browser[name][variant]={screenshot:path.basename(shot),padBounds,edge,apiCalls:apiCount,canvas:canvasMetrics};
        await page.locator("#stop").click();await context.close();
        console.log("PASS visual "+name+" "+variant+" (stage canvas screenshot)");
      }
    }
    // Actual accepted hits, three successive 16th-step hi-hat notes at extreme
    const context=await browser.newContext({viewport:{width:390,height:800},hasTouch:true,isMobile:true});
    await context.route("**/functions/v1/schoolband-school-read-v1*",route=>{
      const u=new URL(route.request().url());
      return route.fulfill({status:200,contentType:"application/json",body:json(u.searchParams.has("schools")?
        {schools:[{school_id:"stage003",school_name:"난이도검증학교",sido_standard:"가상"}]}:
        {school:{school_id:"stage003",school_name:"난이도검증학교",region:"가상",eligible:true,difficulty:"extreme",source_year:2025}})});
    });
    const page=await context.newPage();
    const errors=[];page.on("pageerror",e=>errors.push(e.message));
    await page.goto(origin+"/after");
    await page.locator("#schoolSearch").fill("난이도검증");
    await page.locator("#searchResults button").first().click();
    await page.waitForFunction(()=>document.querySelector("#schoolTier")?.textContent?.includes("EXTREME"));
    await page.locator('[data-inst="drums"]').click();
    await page.locator("#start").click();
    const hits=await page.evaluate(async()=>{
      const api=window.nangamSchoolbandV08,chart=api.getChart();
      const targets=chart.filter(x=>x.lane===2&&x.t>0&&x.t<.5).slice(0,3);
      const results=[];
      let lastAnimation=null;
      for(const note of targets){
        const deadline=performance.now()+4000;
        while(api.getPlayhead()<note.t-.003&&performance.now()<deadline)await new Promise(r=>setTimeout(r,2));
        const before=api.getStatus().hits;
        document.querySelector('#pads .taphit[data-lane="2"]').dispatchEvent(new PointerEvent("pointerdown",{bubbles:true,cancelable:true}));
        const after=api.getStatus().hits,fx=api.getEffectState();
        // A newly created CSS animation receives its startTime on the next animation frame.
        await new Promise(requestAnimationFrame);
        const animation=document.getElementById("judgeFx").getAnimations()[0];
        const newAnimation=Boolean(animation)&&animation!==lastAnimation;
        lastAnimation=animation;
        results.push({t:note.t,playhead:api.getPlayhead(),before,after,
          fx:fx.particleCount,glow:fx.pulseRemainingMs[2],judgement:fx.judgement,animated:fx.judgeAnimate,
          newAnimation,animationPlayState:animation?.playState??null,animationCurrentTime:animation?.currentTime??null});
      }
      return {targets:targets.length,results,score:api.getStatus().score};
    });
    assert.equal(hits.targets,3,"3 consecutive hi-hat notes expected");
    assert(hits.results.every(x=>x.after===x.before+1),"consecutive notes missed: "+json(hits));
    assert(hits.results.every(x=>x.glow>0&&x.glow<=175),"glow failed: "+json(hits));
    assert(hits.results.every(x=>x.fx>=1&&x.fx<=60),"particle cap: "+json(hits));
    assert(hits.results.every(x=>x.animated&&x.judgement==="PERFECT!"),"judge restart: "+json(hits));
    console.log("HIT_TRACE",json(hits));
    assert(hits.results.every(x=>x.newAnimation),"CSS animation object was not recreated per hit: "+json(hits));
    report.browser.rapidHit={...hits,passed:true};
    console.log("PASS rapid-hit: 3 successive 16th hi-hats with PERFECT and animation restart, glow, particles<=60");
    await page.locator(".stage-wrap").screenshot({path:path.join(out,"rapid-hit-stage.png")});
    await page.locator("#stop").click();await context.close();
    assert.deepEqual(errors,[]);
  }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
}
(async()=>{const started=performance.now();assertStatic();await smoke();report.duration_ms=Math.round(performance.now()-started);save();console.log("PASS stage003 measured visuals and rapid hits; report artifacts/schoolband-stage003/results.json");})().catch(e=>{report.failure=String(e.stack||e);save();console.error("FAIL stage003",e.stack||String(e));process.exitCode=1;});
