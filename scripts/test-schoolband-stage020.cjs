#!/usr/bin/env node
"use strict";
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),assert=require("node:assert/strict"),http=require("node:http");
const GAME=fs.readFileSync(path.resolve(__dirname,"../games/nangam-schoolband-v08/index.html"),"utf8");
const js=GAME.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert(js);new vm.Script(js);
for(const id of ["songChoices","songAnthem","songVolleyball","anthemAvailability","songState","currentSongName","retrySchool"]){
 assert(GAME.includes('id="'+id+'"'),"missing "+id);
}
assert(GAME.includes('const REGISTERED_ANTHEMS=Object.freeze({});'),"anthem must be disabled without an approved licensed catalog");
assert(GAME.includes('item.publicApproved===true&&item.rightsApproved===true'),"rights and registration checks required");
assert(GAME.includes('selectedSong+":"+instrument+":"+tier'),"song-specific score keys required");
assert(GAME.includes('if(selectedSong==="anthem"&&!songAvailability(school).anthem)'),"start gate required");
assert(GAME.includes('signal:AbortSignal.timeout(9000)'),"network timeout required");
console.log("PASS stage020 static: song choices, rights gate, score isolation, retry and JS syntax");
if(process.argv.includes("--browser"))(async()=>{
 const {chromium}=require("playwright");
 const server=http.createServer((request,response)=>{response.writeHead(200,{"content-type":"text/html; charset=utf-8"});response.end(GAME);});
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 let browser;
 try{
  browser=await chromium.launch({headless:true,args:["--no-sandbox","--autoplay-policy=no-user-gesture-required"]});
  for(const [width,height] of [[1280,850],[320,640]]){
   const context=await browser.newContext({viewport:{width,height},isMobile:width===320,hasTouch:width===320});
   const page=await context.newPage(),errors=[];page.on("pageerror",e=>errors.push(e.message));
   let fail=false;
   await page.route("**/schoolband-school-read-v1**",async route=>{
    const u=new URL(route.request().url());
    if(fail)return route.fulfill({status:502,contentType:"application/json",body:'{"error":"temporarily_unavailable"}'});
    const body=u.searchParams.has("schools")?
     {schools:[{school_id:"mock-s001",school_name:"별빛초등학교",sido_standard:"부산"}]}:
     {school:{school_id:"mock-s001",school_name:"별빛초등학교",region:"부산",eligible:true,difficulty:"hard",source_year:2026}};
    await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(body)});
   });
   await page.goto("http://127.0.0.1:"+server.address().port);
   await page.locator("#demoSchool").click();
   assert.equal(await page.locator("#songVolleyball").getAttribute("aria-pressed"),"true");
   assert.equal(await page.locator("#songAnthem").isDisabled(),true);
   const initial=await page.evaluate(()=>({song:window.nangamSchoolbandV08.getSong(),available:window.nangamSchoolbandV08.getSongAvailability(),attempt:window.nangamSchoolbandV08.chooseSong("anthem")}));
   assert.equal(initial.song,"volleyball");assert.equal(initial.attempt,false);assert.equal(initial.available.anthem,false);
   assert.match(await page.locator("#anthemAvailability").textContent(),/미등록/);
   assert.equal(await page.locator("#start").isEnabled(),true);
   await page.locator("#schoolSearch").fill("별빛");
   await page.waitForFunction(()=>document.querySelector("#searchResults").children.length===1);
   await page.locator("#searchResults button").click();
   await page.waitForFunction(()=>window.nangamSchoolbandV08.getSelected()?.school_id==="mock-s001");
   assert.equal(await page.locator("#songAnthem").isDisabled(),true);
   assert.equal(await page.locator("#songVolleyball").getAttribute("aria-pressed"),"true");
   fail=true;await page.locator("#schoolSearch").fill("없는학교");
   await page.waitForFunction(()=>document.getElementById("retrySchool").hidden===false,null,{timeout:4500});
   assert.match(await page.locator("#schoolStatus").textContent(),/재시도/);
   await page.locator("#demoSchool").click();
   assert.equal(await page.locator("#songVolleyball").isEnabled(),true);
   assert.equal(await page.locator("#start").isEnabled(),true);
   assert.deepEqual(errors,[],"browser errors");
   console.log("PASS stage020 browser:",width,"px demo, real school, unregistered anthem, unavailable API fallback");
   await context.close();
  }
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
