#!/usr/bin/env node
"use strict";
const fs=require("node:fs"),path=require("node:path"),http=require("node:http"),vm=require("node:vm"),assert=require("node:assert/strict");
const ROOT=path.resolve(__dirname,".."),HTML=fs.readFileSync(path.join(ROOT,"games/nangam-schoolband-v08/index.html"),"utf8");
const OUT=path.join(ROOT,"artifacts/schoolband-stage008");fs.mkdirSync(OUT,{recursive:true});
const INSTRUMENTS=[
 ["guitar",[["리프","D","KeyD"],["파워코드","F","KeyF"],["업스트럼","J","KeyJ"],["고음 리프","K","KeyK"]]],
 ["drums",[["킥","D","KeyD"],["스네어","F","KeyF"],["하이햇","J","KeyJ"],["탐","K","KeyK"]]],
 ["bass",[["루트","F","KeyF"],["5도","SPACE","Space"],["옥타브","J","KeyJ"]]],
 ["keys",[["저음","A","KeyA"],["화음1","S","KeyS"],["화음2","D","KeyD"],["멜로디","J","KeyJ"],["고음","K","KeyK"]]]
];
const TIERS=["easy","normal","hard","very_hard","extreme"],LABELS=["EASY","NORMAL","HARD","VERY HARD","EXTREME"];
const evidence={stage:"008/030",static:{},browser:{matrix:[],modes:[]},limitations:[
 "An accelerated AudioContext.currentTime shim is used to check wiring and full-game completion deterministically, not to claim physical timing or audio-output fidelity.",
 "The 40 browser combinations run muted; sound and ensemble instruments are reviewed in stages 010-012.",
 "Physical multi-touch, screen rotation and real device keyboard behavior remain stages 017/027.",
 "Mock school metadata is not the private school survey."
]};
const save=()=>fs.writeFileSync(path.join(OUT,"results.json"),JSON.stringify(evidence,null,2)+"\n");
function parsed(){
 const js=HTML.match(/<script>([\s\S]*?)<\/script>/i)?.[1];assert(js);new vm.Script(js,{filename:"stage008-inline.js"});
 const a=HTML.match(/const INST=(\{[\s\S]*?\});\s*\/\/ \[한 마디/);
 const b=HTML.match(/const PARTS=(\{[\s\S]*?\});\s*\/\/ BEGIN SCHOOLBAND_TIMING_MODEL_V1/);
 assert(a&&b,"instrument and pattern source");
 return {inst:JSON.parse(JSON.stringify(vm.runInNewContext("("+a[1]+")",Object.create(null)))),parts:JSON.parse(b[1])};
}
function audit(inst,parts){
 assert.deepEqual(Object.keys(inst),INSTRUMENTS.map(x=>x[0]));
 assert.deepEqual(Object.keys(parts),INSTRUMENTS.map(x=>x[0]));
 const combos=[];
 for(const [name,lanes] of INSTRUMENTS){
  assert.deepEqual(inst[name]?.lanes,lanes,name+" physical key and lane names");
  assert.equal(new Set(lanes.map(x=>x[2])).size,lanes.length,"duplicate keyboard code");
  const rows=parts[name];assert(Array.isArray(rows));
  for(const row of rows){
   const [step,lane,tier]=row;
   assert(Number.isInteger(step)&&step>=0&&step<16,name+" invalid sixteenth");
   assert(Number.isInteger(lane)&&lane>=0&&lane<lanes.length,name+" note outside lane count");
   assert(Number.isInteger(tier)&&tier>=0&&tier<5,name+" invalid tier");
  }
  for(let tier=0;tier<5;tier++){
   const counts=lanes.map((_,lane)=>rows.filter(x=>x[1]===lane&&x[2]<=tier).length);
   counts.forEach((num,lane)=>assert(num>=1,name+" "+TIERS[tier]+" lane"+lane+" has zero valid notes"));
   combos.push({instrument:name,tier:TIERS[tier],laneCount:lanes.length,
    firstBarNoteCounts:counts,totalChartNotes:8*counts.reduce((a,b)=>a+b,0)});
  }
 }
 return combos;
}
function staticTest(){
 const {inst,parts}=parsed(),combos=audit(inst,parts);assert.equal(combos.length,20);
 const a=JSON.parse(JSON.stringify(parts));a.keys=a.keys.filter(x=>!(x[1]===4&&x[2]===0));
 assert.throws(()=>audit(inst,a),/keys easy lane4 has zero valid notes/);
 const b=JSON.parse(JSON.stringify(inst));b.bass.lanes[1][2]="KeyF";
 assert.throws(()=>audit(b,parts),/physical key and lane names/);
 const c=JSON.parse(JSON.stringify(parts));c.drums.push([5,4,0]);
 assert.throws(()=>audit(inst,c),/note outside lane count/);
 evidence.static={passed:true,combinations:combos,negative_controls:["missing-easy-lane","duplicate-bass-key","out-of-range-note"],
   tierLanePairs:combos.reduce((a,x)=>a+x.laneCount,0)};
 console.log("PASS static stage008: all 20 charts, "+evidence.static.tierLanePairs+" lane-tier contracts, 3 deliberately invalid fixtures");
}
function keyName(code){return code==="Space"?"Space":code.slice(3).toLowerCase();}
async function browserTests(){
 let chromium;try{({chromium}=require("playwright"));}catch(e){throw Error("Playwright not installed: "+e.message);}
 const server=http.createServer((req,res)=>{
  res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"});res.end(HTML);
 });
 await new Promise(r=>server.listen(0,"127.0.0.1",r));
 let browser;
 try{
  browser=await chromium.launch({headless:true,args:["--no-sandbox","--autoplay-policy=no-user-gesture-required"]});
  const origin="http://127.0.0.1:"+server.address().port+"/";
  for(const mode of ["desktop","mobile320"]){
   const mobile=mode==="mobile320";
   const context=await browser.newContext({viewport:mobile?{width:320,height:640}:{width:1280,height:850},
    isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1});
   let tier="normal",requests=0;
   await context.route("**/functions/v1/schoolband-school-read-v1*",route=>{
    requests++;
    const u=new URL(route.request().url());
    const school={school_id:"stage008-test-only",school_name:"N레인검증가상초",region:"가상",eligible:true,difficulty:tier,source_year:2026};
    const payload=u.searchParams.has("schools")?
     {schools:[{school_id:school.school_id,school_name:school.school_name,sido_standard:"가상"}]}:{school};
    return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(payload)});
   });
   await context.addInitScript(()=>{
    const Native=window.AudioContext||window.webkitAudioContext;
    window.__stage008Clock=0;
    if(Native)window.AudioContext=class AcceleratedChartAudio extends Native{
     get currentTime(){return window.__stage008Clock}
    };
    window.__stage008DrawnTexts=new Set();
    const raw=CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText=function(v,...args){
     window.__stage008DrawnTexts.add(String(v));return raw.call(this,v,...args);
    };
   });
   const page=await context.newPage(),errors=[];
   page.on("pageerror",e=>errors.push(e.message));
   try{
    const response=await page.goto(origin,{waitUntil:"domcontentloaded"});
    assert(response?.ok()&&response.headers()["content-type"].includes("text/html"));
    await page.locator("#mute").click();
    const comboResults=[];
    for(const [instrument,lanes] of INSTRUMENTS){
     for(let j=0;j<5;j++){
      tier=TIERS[j];
      await page.locator("#schoolSearch").fill("계약시험"+instrument+j);
      await page.locator("#searchResults button").first().click();
      await page.waitForFunction(expected=>document.querySelector("#schoolTier")?.textContent?.includes(expected),LABELS[j]);
      await page.locator('[data-inst="'+instrument+'"]').click();
      assert.equal(await page.locator("#pads .taphit").count(),lanes.length);
      assert.equal(await page.locator("#laneFx .lane-fx").count(),lanes.length);
      assert.equal(await page.locator('[data-inst][aria-pressed="true"]').count(),1);
      const ui=await page.evaluate(()=>{
       const api=window.nangamSchoolbandV08,els=[...document.querySelectorAll("#pads .taphit")];
       const sizes=els.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,right:r.right,width:r.width,height:r.height}});
       return {instrument:api.getInstrument(),tier:api.getDifficulty(),lanes:api.getLanes(),
        canvasLabel:document.querySelector("#track").getAttribute("aria-label"),
        pads:els.map(e=>({name:e.querySelector("strong").textContent,key:e.querySelector("small").textContent,
         aria:e.getAttribute("aria-label"),index:Number(e.dataset.lane)})),
        hint:document.querySelector("#keyHint").textContent,
        drawn:[...window.__stage008DrawnTexts],sizes,overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2};
      });
      assert.equal(ui.instrument,instrument);assert.equal(ui.tier,tier);assert.equal(ui.overflow,false);
      assert.deepEqual(ui.lanes.map(x=>[x.label,x.key,x.code]),lanes);
      assert(ui.canvasLabel.includes(lanes.length+"레인"));
      for(let lane=0;lane<lanes.length;lane++){
       const [label,key]=lanes[lane],pad=ui.pads[lane],rect=ui.sizes[lane];
       assert.equal(pad.name,label);assert.equal(pad.key,key);assert.equal(pad.index,lane);
       assert(pad.aria.includes(label)&&pad.aria.includes(key));
       assert(ui.canvasLabel.includes(label+" "+key));
       assert(ui.drawn.includes(label)&&ui.drawn.includes(key));
       assert(ui.hint.includes(key+" "+label));
       assert(rect.width>=32&&rect.height>=68,"touch area too small");
       if(lane>0)assert(rect.x>=ui.sizes[lane-1].right,"adjacent pad hit area overlap");
      }
      if(j===0)await page.locator(".stage-wrap").screenshot({path:path.join(OUT,mode+"-"+instrument+"-stage.png")});
      await page.evaluate(()=>{window.__stage008Clock=0});
      await page.locator("#start").click();
      await page.waitForFunction(()=>window.nangamSchoolbandV08.getStatus().playing);
      const song=await page.evaluate(()=>{
       const a=window.nangamSchoolbandV08,chart=a.getChart(),lanes=a.getLanes(),bar=4*a.getTimingRules().beatSeconds;
       const one=lanes.map((_,l)=>chart.find(n=>n.lane===l&&n.t<bar-.00001));
       const two=lanes.map((_,l)=>chart.find(n=>n.lane===l&&n.t>=bar-.00001&&n.t<bar*2-.00001));
       const three=chart.find(n=>n.lane===0&&n.t>=bar*2-.00001&&n.t<bar*3-.00001);
       return {one,two,three,chartLen:chart.length,lanes};
      });
      assert(song.one.every(Boolean)&&song.two.every(Boolean)&&song.three,
       "two playable chart notes per lane and third-bar Enter note required");
      const expected=evidence.static.combinations.find(x=>x.instrument===instrument&&x.tier===tier);
      assert.equal(song.chartLen,expected.totalChartNotes);
      async function setClock(t){await page.evaluate(t=>{window.__stage008Clock=1.05+t},t);}
      for(const n of song.one.map((x,l)=>({...x,lane:l})).sort((a,b)=>a.t-b.t||a.lane-b.lane)){
       await setClock(n.t);
       const before=await page.evaluate(()=>window.nangamSchoolbandV08.getStatus().hits);
       await page.keyboard.press(keyName(song.lanes[n.lane].code));
       const after=await page.evaluate(lane=>{
        const a=window.nangamSchoolbandV08,clock=window.__stage008Clock-1.05;
        return {hits:a.getStatus().hits,done:a.getChart().find(n=>n.lane===lane&&Math.abs(n.t-clock)<1e-8)?.done,
         feedback:a.getEffectState().laneMessages[lane].message};
       },n.lane);
       assert.equal(after.hits,before+1,instrument+"/"+tier+" keyboard lane "+n.lane);
       // A simulated 2+ second clock leap can concurrently mark earlier notes MISS,
       // replacing the transient lane badge after the hit; stage004 tests real-time FX.
       assert.equal(after.done,true);
      }
      for(const n of song.two.map((x,l)=>({...x,lane:l})).sort((a,b)=>a.t-b.t||a.lane-b.lane)){
       await setClock(n.t);
       const prev=await page.evaluate(()=>window.nangamSchoolbandV08.getStatus().hits);
       const pad=page.locator('#pads .taphit[data-lane="'+n.lane+'"]');
       await pad.dispatchEvent("pointerdown",{bubbles:true,cancelable:true,pointerType:"touch"});
       const mid=await page.evaluate(()=>window.nangamSchoolbandV08.getStatus().hits);
       assert.equal(mid,prev+1,instrument+"/"+tier+" touch lane "+n.lane);
       await pad.dispatchEvent("click",{bubbles:true,detail:1});
       const after=await page.evaluate(lane=>{
        const a=window.nangamSchoolbandV08,clock=window.__stage008Clock-1.05;
        return {hits:a.getStatus().hits,done:a.getChart().find(n=>n.lane===lane&&Math.abs(n.t-clock)<1e-8)?.done,
         feedback:a.getEffectState().laneMessages[lane].message};
       },n.lane);
       assert.equal(after.hits,mid,"pointer click must not score twice");
       // A simulated 2+ second clock leap can concurrently mark earlier notes MISS,
       // replacing the transient lane badge after the hit; stage004 tests real-time FX.
       assert.equal(after.done,true);
      }
      await setClock(song.three.t);
      const preEnter=await page.evaluate(()=>window.nangamSchoolbandV08.getStatus().hits);
      await page.locator('#pads .taphit[data-lane="0"]').focus();
      await page.keyboard.press("Enter");
      const postEnter=await page.evaluate(()=>window.nangamSchoolbandV08.getStatus().hits);
      assert.equal(postEnter,preEnter+1,"Enter must activate focused pad");
      await page.evaluate(()=>{window.__stage008Clock=1.05+32*(60/108)+.45});
      await page.waitForFunction(()=>!window.nangamSchoolbandV08.getStatus().playing,null,{timeout:3500});
      const finish=await page.evaluate(()=>({status:window.nangamSchoolbandV08.getStatus(),
       result:document.querySelector("#result").textContent,progress:document.querySelector("#progress").style.width,
       restart:!document.querySelector("#start").disabled}));
      assert.equal(finish.status.hits,lanes.length*2+1);
      assert(finish.status.score>0&&finish.result.includes("PERFECT"));
      assert.equal(finish.progress,"100%");assert.equal(finish.restart,true);
      const item={mode,instrument,tier,laneCount:lanes.length,keyboardLaneHits:lanes.length,
       touchLaneHits:lanes.length,nativeEnterHits:1,totalHits:finish.status.hits,
       totalNotes:song.chartLen,completed:true,canvasLabelsPassed:true,virtualAudioClock:true};
      comboResults.push(item);evidence.browser.matrix.push(item);
      console.log("PASS "+mode+" "+instrument+"/"+tier+": "+lanes.length+" keys + "+lanes.length+" touch + Enter; finished");
     }
    }
    assert.equal(comboResults.length,20);
    assert.deepEqual(errors,[],"runtime browser errors");
    evidence.browser.modes.push({mode,combos:20,keyboardHits:comboResults.reduce((a,x)=>a+x.keyboardLaneHits,0),
     touchHits:comboResults.reduce((a,x)=>a+x.touchLaneHits,0),enterHits:20,requests,errors});
   }finally{await context.close();}
  }
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
 assert.equal(evidence.browser.matrix.length,40);
 const total={keyboard:evidence.browser.modes.reduce((a,x)=>a+x.keyboardHits,0),
  touch:evidence.browser.modes.reduce((a,x)=>a+x.touchHits,0),enter:evidence.browser.modes.reduce((a,x)=>a+x.enterHits,0)};
 assert.deepEqual(total,{keyboard:160,touch:160,enter:40});
 evidence.browser.totals=total;
 console.log("PASS stage008 browser all 40 games: 160 physical-code keyboard events, 160 pointer events, 40 native Enter activations");
}
(async()=>{staticTest();if(process.argv.includes("--browser"))await browserTests();save();console.log("PASS Stage008; results artifacts/schoolband-stage008/results.json");})()
.catch(e=>{evidence.failure=String(e.stack||e);save();console.error("FAIL Stage008 "+(e.stack||String(e)));process.exitCode=1;});
