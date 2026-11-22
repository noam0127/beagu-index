#!/usr/bin/env node
"use strict";
/**
 * Stage029 external-preview browser smoke, immutable git SHA.
 * DOM-only; forbidden AudioContext, no Start click, no school/private data writes.
 */
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict");
const {chromium}=require("playwright");
const repo="noam0127/beagu-index";
const sha=process.env.GITHUB_SHA;
if(!/^[a-f0-9]{40}$/.test(sha||""))throw Error("GITHUB_SHA_40_HEX_REQUIRED");
if(process.env.GITHUB_REPOSITORY&&process.env.GITHUB_REPOSITORY!==repo)throw Error("WRONG_REPO");
if(process.env.GITHUB_REF_NAME&&process.env.GITHUB_REF_NAME!=="schoolband-playtest")throw Error("NOT_TEST_BRANCH");
const root="https://raw.githack.com/"+repo+"/"+sha+"/games/nangam-schoolband-v08/";
async function verify(){
 let browser;
 const findings=[];
 const screenshotDir=path.resolve(__dirname,"../artifacts/schoolband-stage029/browser");
 fs.mkdirSync(screenshotDir,{recursive:true});
 try{
  browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
  for(const view of [{label:"pc",width:1280,height:800},{label:"mobile",width:390,height:844}]){
   const context=await browser.newContext({
    viewport:{width:view.width,height:view.height},
    hasTouch:view.label==="mobile",isMobile:view.label==="mobile"
   });
   const page=await context.newPage();
   const errors=[],writes=[];
   page.on("pageerror",e=>errors.push(e.message));
   page.on("request",req=>{if(!["GET","HEAD","OPTIONS"].includes(req.method()))writes.push(req.method()+" "+req.url())});
   await page.addInitScript(()=>{
    window.AudioContext=class AudioForbidden{constructor(){throw Error("STAGE029_NO_AUDIO")}};
    window.webkitAudioContext=window.AudioContext;
   });
   let response=await page.goto(root+"preview/index.html",{waitUntil:"domcontentloaded",timeout:25000});
   assert.equal(response?.status(),200,"preview landing HTTP must be 200");
   assert.match(await page.locator("h1").innerText(),/난감한 스쿨밴드/);
   assert.match(await page.locator(".tag").innerText(),/독립 시험용/);
   const anchor=page.locator("a.launch");
   assert.match(await anchor.getAttribute("href"),/\.\.\/index\.html/);
   await anchor.click();
   await page.waitForURL("**/games/nangam-schoolband-v08/index.html",{timeout:20000});
   assert.match(await page.title(),/난감한 스쿨밴드/);
   await page.waitForFunction(()=>!!window.nangamSchoolbandV08);
   assert.equal(await page.locator("#start").isDisabled(),true,"no selected school");
   assert.equal(await page.locator("#songAnthem").isDisabled(),true,"unverified school anthem disabled");
   await page.locator("#demoSchool").click();
   await page.waitForFunction(()=>window.nangamSchoolbandV08.getSelected()!=null);
   assert.equal(await page.locator("#songVolleyball").getAttribute("aria-pressed"),"true");
   assert.equal(await page.locator("#songAnthem").isDisabled(),true);
   assert.equal(await page.locator("#start").isEnabled(),true,"original creative song selection available");
   const audit=await page.evaluate(()=>window.nangamSchoolbandV08.getChartAudit());
   assert.equal(audit.valid,true,"actual chart model must validate");
   const instrumentLanes={guitar:4,drums:4,bass:3,keys:5};
   for(const [name,count] of Object.entries(instrumentLanes)){
    await page.locator('[data-inst="'+name+'"]').click();
    assert.equal(await page.locator("#pads .taphit").count(),count,name+" lane count");
    const key=await page.evaluate(()=>window.nangamSchoolbandV08.getBestRecordKey());
    assert(key?.includes(":"+name+":"),"versioned record key "+name);
   }
   await page.locator("#largeText").check();
   await page.locator("#highContrast").check();
   const state=await page.evaluate(()=>({
    status:window.nangamSchoolbandV08.getStatus(),
    ui:window.nangamSchoolbandV08.getMobileUiState(),
    docWidth:document.documentElement.scrollWidth,viewWidth:innerWidth
   }));
   assert.equal(state.status.playing,false,"do not run sound or game");
   assert.equal(state.ui.largeText,true);
   assert.equal(state.ui.highContrast,true);
   assert(state.docWidth<=state.viewWidth+2,"mobile horizontal overflow "+JSON.stringify(state));
   assert.deepEqual(errors,[],"browser JS errors: "+errors.join("; "));
   assert.deepEqual(writes,[],"no score/user data POST");
   const shot=path.join(screenshotDir,"schoolband-029-"+view.label+"-"+sha.slice(0,8)+".png");
   await page.screenshot({path:shot,fullPage:true});
   findings.push({viewport:view.label,px:view.width+"x"+view.height,previewHttp:200,sourceCommit:sha,
    schoolDemo:true,instrumentsVerified:4,schoolAnthemPlayable:false,
    realAudioPlayed:false,scoreUpload:false,screenCapture:path.basename(shot)});
   await context.close();
  }
  console.log("PASS 029 immutable external browser DOM smoke:",JSON.stringify(findings));
 }finally{await browser?.close()}
}
verify().catch(e=>{console.error("STAGE029_BROWSER_FAILED:",e.stack||e.message);process.exitCode=1});
