#!/usr/bin/env node
"use strict";
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),assert=require("node:assert/strict"),http=require("node:http");
const root=path.resolve(__dirname,"..");
const raw=fs.readFileSync(path.join(root,"games/nangam-schoolband-v08/index.html"),"utf8");
const fixture=JSON.parse(fs.readFileSync(path.join(root,"games/nangam-schoolband-v08/charts/anthem-media-fixture.v1.json"),"utf8"));
const entry=fixture.entries[0];
assert.equal(fixture.production_enabled,false);assert.equal(entry.test_only,true);
assert.equal(entry.game_playback_approved,false);assert.equal(entry.rights_status,"unverified_for_game");
assert.equal(entry.video_id,"fE_bXSBuHB4");
const src=raw.match(/<script>([\s\S]*?)<\/script>/)?.[1];assert(src);new vm.Script(src);
for(const id of ["anthemDiscovery","anthemDiscoveryStatus","anthemOfficialSearch","anthemYoutubeSearch","anthemMediaList","anthemPlayer","closeAnthemPlayer"]){
 assert(raw.includes('id="'+id+'"'),"missing anthem discovery "+id);
}
assert(raw.includes('const VERIFIED_ANTHEM_MEDIA=Object.freeze({});'),"production registry must remain empty");
assert(raw.includes('review_status!=="reviewed"')&&raw.includes('item.school_id!==selectedSchoolId'),"review+identity gate required");
assert(raw.includes('https://www.youtube-nocookie.com/embed/'),"privacy enhanced YouTube player");
assert(!raw.includes('youtube.com/get_video_info'),"must never extract YouTube media");
const start=src.indexOf("function validAnthemMedia("),end=src.indexOf("function closeAnthemMedia()",start);
assert(start>0&&end>start);
const context=vm.createContext({});
new vm.Script(src.slice(start,end)+";globalThis.validate=validAnthemMedia").runInContext(context);
let unit=0;
function check(x,ok){assert.equal(context.validate(x,entry.school_id),ok);unit++;}
check(entry,true);check({...entry,school_id:"another-school"},false);
check({...entry,review_status:"pending"},false);check({...entry,source_type:"mp3"},false);
check({...entry,video_id:"javascript:"},false);check({...entry,checked_at:"not-a-date"},false);
check({...entry,title:""},false);check({...entry,channel:""},false);
check(null,false);
console.log("PASS stage021 static and 9 metadata gates; no real anthem unlocked");
if(process.argv.includes("--browser"))(async()=>{
 const {chromium}=require("playwright");
 const testHtml=raw.replace("const VERIFIED_ANTHEM_MEDIA=Object.freeze({});",
  "const VERIFIED_ANTHEM_MEDIA=Object.freeze("+JSON.stringify({[entry.school_id]:[entry]})+");");
 assert.notEqual(testHtml,raw,"test-only metadata injected");
 const server=http.createServer((_req,res)=>{res.writeHead(200,{"content-type":"text/html; charset=utf-8"});res.end(testHtml)});
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 let browser;
 try{
  browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
  for(const width of [1280,320]){
   const ctx=await browser.newContext({viewport:{width,height:width===320?640:850},isMobile:width===320,hasTouch:width===320});
   const page=await ctx.newPage(),errors=[];page.on("pageerror",e=>errors.push(e.message));
   await page.route("**/schoolband-school-read-v1**",route=>{
    const u=new URL(route.request().url());
    const body=u.searchParams.has("schools")?
      {schools:[{school_id:entry.school_id,school_name:entry.school_name,sido_standard:"서울"}]}:
      {school:{school_id:entry.school_id,school_name:entry.school_name,region:"서울",eligible:false,difficulty:null,source_year:null}};
    return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(body)});
   });
   await page.goto("http://127.0.0.1:"+server.address().port);
   await page.locator("#demoSchool").click();
   assert.equal(await page.locator("#anthemMediaList .anthem-media-card").count(),0);
   await page.locator("#schoolSearch").fill("미동");
   await page.waitForFunction(()=>document.querySelector("#searchResults").children.length===1);
   await page.locator("#searchResults button").click();
   await page.waitForFunction(()=>window.nangamSchoolbandV08.getAnthemMediaCount()===1);
   assert.equal(await page.locator("#songAnthem").isDisabled(),true,"video must not unlock playable anthem");
   assert.equal(await page.locator("#songVolleyball").isEnabled(),true);
   assert.match(await page.locator("#anthemOfficialSearch").getAttribute("href"),/google\.com\/search/);
   assert.match(await page.locator("#anthemYoutubeSearch").getAttribute("href"),/youtube\.com\/results/);
   await page.locator("#anthemMediaList button").click();
   assert.match(await page.locator("#anthemPlayer").getAttribute("src"),/youtube-nocookie\.com\/embed\/fE_bXSBuHB4/);
   assert.equal(await page.locator("#anthemPlayer").isVisible(),true);
   await page.locator("#closeAnthemPlayer").click();
   assert.equal(await page.locator("#anthemPlayer").getAttribute("src"),null);
   assert.equal(await page.locator("#anthemPlayer").isHidden(),true);
   assert.equal(errors.length,0,errors.join(" | "));
   console.log("PASS stage021",width,"px exact school match, approved video preview, close, game anthem locked");
   await ctx.close();
  }
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}
})().catch(e=>{console.error(e);process.exitCode=1;});
