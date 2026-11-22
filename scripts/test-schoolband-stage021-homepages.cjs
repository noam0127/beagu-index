#!/usr/bin/env node
"use strict";
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),assert=require("node:assert/strict"),http=require("node:http");
const root=path.resolve(__dirname,".."),base=path.join(root,"games/nangam-schoolband-v08");
const raw=fs.readFileSync(path.join(base,"index.html"),"utf8");
const catalog=JSON.parse(fs.readFileSync(path.join(base,"charts/school-homepages.v1.json"),"utf8"));
assert.equal(catalog.schema_version,1);
assert(catalog.count>=6200&&catalog.count<=6400,"must cover most operating schools");
assert.equal(catalog.count,Object.keys(catalog.homepages).length,"count mismatch");
const ids=Object.keys(catalog.homepages);let accepted=0;
for(const id of ids){
 assert.match(id,/^[0-9]{6,12}$/);
 const link=catalog.homepages[id],u=new URL(link);
 assert(["http:","https:"].includes(u.protocol),"protocol must be HTTP(S)");
 assert(!u.username&&!u.password,"credential URLs forbidden");
 assert(!u.hash&&!u.search,"tracking/query/fragment not retained");
 assert.match(u.hostname,/^[A-Za-z0-9.-]+$/);
 assert(!/^(localhost|127\.|10\.|192\.168\.|169\.254\.)/.test(u.hostname));
 accepted++;
}
const js=raw.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert(js);new vm.Script(js); 
for(const id of ["anthemSchoolHomepage","anthemOfficialSearch","anthemHomepageStatus"])assert(raw.includes('id="'+id+'"'));
assert(raw.includes('fetch("./charts/school-homepages.v1.json"'),"must load static local catalog");
assert(raw.includes("schoolHomepageUrl(school)"),"must use selected school ID");
assert(raw.includes('const VERIFIED_ANTHEM_MEDIA=Object.freeze({});'),"no unauthorized real anthem media playback");
assert(raw.includes('const REGISTERED_ANTHEMS=Object.freeze({});'),"game anthem must remain unavailable");
const start=js.indexOf("let SCHOOL_HOMEPAGE_LINKS=null;"),end=js.indexOf("const VERIFIED_ANTHEM_MEDIA=",start);
assert(start>=0&&end>start);
const ctx=vm.createContext({URL,AbortSignal,console});
new vm.Script(js.slice(start,end)+";globalThis.testHomepage=schoolHomepageUrl;globalThis.installHomepages=x=>{SCHOOL_HOMEPAGE_LINKS=x;}").runInContext(ctx);
const example=ids.find(id=>id==="7004971")||ids[0];
assert(ctx.testHomepage({school_id:example})===null,"must not guess when catalogue unavailable");
ctx.installHomepages(catalog.homepages);
assert.equal(ctx.testHomepage({school_id:example}),catalog.homepages[example]);
assert.equal(ctx.testHomepage({school_id:"99999999"}),null);
ctx.installHomepages({bad:"javascript:alert(1)",cred:"https://user:pass@example.com/",local:"http://127.0.0.1/",ok:"https://school.example.org/anthem"});
for(const id of ["bad","cred","local"])assert.equal(ctx.testHomepage({school_id:id}),null,"untrusted URL "+id);
assert.equal(ctx.testHomepage({school_id:"ok"}),"https://school.example.org/anthem");
console.log("PASS schoolband stage021 static homepage catalog:",accepted,"URLs; safety and fallback gates.");
if(process.argv.includes("--browser"))(async()=>{
 const {chromium}=require("playwright");
 const server=http.createServer((req,res)=>{
  if(req.url?.startsWith("/charts/school-homepages.v1.json")){
   res.writeHead(200,{"content-type":"application/json; charset=utf-8","cache-control":"no-store"});
   res.end(JSON.stringify(catalog));return;
  }
  res.writeHead(200,{"content-type":"text/html; charset=utf-8"});res.end(raw);
 });
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 let browser;
 try{
  browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
  for(const width of [1280,320]){
   const context=await browser.newContext({viewport:{width,height:width===320?640:850},isMobile:width===320,hasTouch:width===320});
   const page=await context.newPage(),errors=[];page.on("pageerror",e=>errors.push(e.message));
   const school={school_id:example,school_name:"부산교육대학교부설초등학교",sido_standard:"부산"};
   await page.route("**/schoolband-school-read-v1**",route=>{
    const url=new URL(route.request().url()),q=url.searchParams.get("schools");
    const id=q==="다른학교"?"99999999":example;
    const obj=url.searchParams.has("schools")?{schools:[{school_id:id,school_name:q==="다른학교"?"다른학교":"부산교육대학교부설초등학교",sido_standard:"부산"}]}:
      {school:{school_id:id,school_name:id===example?school.school_name:"다른학교",region:"부산",eligible:false,difficulty:null,source_year:null}};
    return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(obj)});
   });
   await page.goto("http://127.0.0.1:"+server.address().port);
   await page.locator("#schoolSearch").fill("부산교육");
   await page.waitForFunction(()=>document.querySelectorAll("#searchResults button").length===1);
   await page.locator("#searchResults button").click();
   await page.waitForFunction(()=>document.getElementById("anthemSchoolHomepage").hidden===false);
   const href=await page.locator("#anthemSchoolHomepage").getAttribute("href");
   assert.equal(href,catalog.homepages[example]);
   assert.match(await page.locator("#anthemOfficialSearch").getAttribute("href"),/google\.com\/search\?q=site%3A/);
   assert.equal(await page.locator("#songAnthem").isDisabled(),true);
   assert.equal(await page.locator("#songVolleyball").isEnabled(),true);
   await page.locator("#schoolSearch").fill("다른학교");
   await page.waitForFunction(()=>document.querySelectorAll("#searchResults button").length===1);
   await page.locator("#searchResults button").click();
   await page.waitForFunction(()=>window.nangamSchoolbandV08.getSelected()?.school_id==="99999999");
   assert.equal(await page.locator("#anthemSchoolHomepage").isHidden(),true);
   assert.match(await page.locator("#anthemOfficialSearch").getAttribute("href"),/google\.com\/search/);
   assert.equal(errors.length,0,errors.join("|"));
   console.log("PASS stage021 homepage UI:",width,"px link matches school ID, missing link falls back.");
   await context.close();
  }
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
