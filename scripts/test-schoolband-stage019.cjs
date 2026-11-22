#!/usr/bin/env node
"use strict";
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),assert=require("node:assert/strict");
const game=fs.readFileSync(path.resolve(__dirname,"../games/nangam-schoolband-v08/index.html"),"utf8");
const begin=game.indexOf("const SCHOOL_TIER_THRESHOLDS=");
const end=game.indexOf("function showSchool(){",begin);
assert(begin>=0&&end>begin,"school safety functions exist");
const code=game.slice(begin,end)+";globalThis.__school19={tierFromApprovedPercentile,normalizePublicSchool,schoolIdentityText};";
const ctx=vm.createContext({TIERS:["easy","normal","hard","very_hard","extreme"],Date});
new vm.Script(code).runInContext(ctx);const {tierFromApprovedPercentile:t,normalizePublicSchool:n,schoolIdentityText:label}=ctx.__school19;
let total=0;function check(run){run();total++;}
for(const [value,expected] of [[0,"easy"],[19.999,"easy"],[20,"normal"],[39.999,"normal"],[40,"hard"],[59.999,"hard"],[60,"very_hard"],[79.999,"very_hard"],[80,"extreme"],[100,"extreme"],[-1,null],[101,null],[null,null],["80",null],[NaN,null]])check(()=>assert.equal(t(value),expected));
const row={school_id:"S00001",school_name:"같은이름초",region:"부산",district:"연제",school_code:"A12",eligible:true,difficulty:"hard",source_year:2026};
check(()=>assert.equal(n(row,row.school_id).difficulty,"hard"));
check(()=>assert.equal(n({...row,public_approved:false},row.school_id).publication_state,"unapproved"));
check(()=>assert.equal(n({...row,publication_status:"pending"},row.school_id).eligible,false));
check(()=>assert.equal(n({...row,eligible:false},row.school_id).difficulty,null));
check(()=>assert.equal(n({...row,source_year:null},row.school_id).difficulty,null));
check(()=>assert.equal(n({...row,source_year:2026,public_approved:true,percentile:20},row.school_id).difficulty,"normal"));
check(()=>assert.equal(n({...row,public_approved:true,percentile:80},row.school_id).difficulty,"extreme"));
check(()=>assert.equal(n({...row,public_approved:true,percentile:-1},row.school_id).difficulty,"hard"));
check(()=>assert.equal(n({...row,difficulty:"invalid"},row.school_id).difficulty,null));
check(()=>assert.throws(()=>n(row,"OTHER"),/school_identity_mismatch/));
check(()=>assert.throws(()=>n({...row,school_id:""},""),/school_identity_mismatch/));
check(()=>assert.match(label(row),/학교코드 A12 · ID S00001/));
check(()=>assert(game.includes("normalizePublicSchool(d.school,s.school_id)")));
check(()=>assert(game.includes("schoolIdentityText({school_id:String(s.school_id)")));
console.log("PASS schoolband stage019:",total,"isolated boundary, permission, ID, unlisted and UI wiring assertions");
if(process.argv.includes("--browser"))(async()=>{
 const {chromium}=require("playwright"),http=require("node:http");
 const server=http.createServer((req,res)=>{res.writeHead(200,{"content-type":"text/html; charset=utf-8"});res.end(game);});
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 let browser;
 try{
  browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
  for(const width of [1280,320]){
   const context=await browser.newContext({viewport:{width,height:width===320?640:850},isMobile:width===320,hasTouch:width===320});
   const page=await context.newPage(),errors=[];page.on("pageerror",error=>errors.push(error.message));
   let scenario="published",id="ID2026";
   await page.route("**/schoolband-school-read-v1**",route=>{
    const url=new URL(route.request().url());
    const body=url.searchParams.has("schools")?{schools:[
      {school_id:"ID2026",school_name:"동명초등학교",sido_standard:"부산"},
      {school_id:"ID2027",school_name:"동명초등학교",sido_standard:"서울"}]}:
      {school:scenario==="mismatch"?{school_id:"UNEXPECTED",school_name:"동명초등학교",eligible:true,difficulty:"hard",source_year:2026}:
       {school_id:id,school_name:"동명초등학교",region:"부산",eligible:true,difficulty:"hard",source_year:2026,
        ...(scenario==="unapproved"?{public_approved:false}:scenario==="unrated"?{eligible:false,difficulty:null,source_year:null}: {})}};
    return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(body)});
   });
   await page.goto("http://127.0.0.1:"+server.address().port);
   async function choose(){
    await page.locator("#schoolSearch").fill("");
    await page.locator("#schoolSearch").fill("동명");
    await page.waitForFunction(()=>document.querySelectorAll("#searchResults button").length===2);
    assert.match(await page.locator("#searchResults button").first().textContent(),/ID ID2026/);
    await page.locator("#searchResults button").first().click();
   }
   await choose();
   await page.waitForFunction(()=>document.querySelector("#schoolTier").textContent.includes("HARD"));
   assert.equal((await page.evaluate(()=>window.nangamSchoolbandV08.getSelected())).school_id,"ID2026");
   // Restore the search route between scenarios while keeping existing game state intact.
   scenario="unapproved";await choose();
   await page.waitForFunction(()=>document.querySelector("#schoolTier").textContent.includes("공개 미승인"));
   assert.match(await page.locator("#schoolTier").textContent(),/NORMAL 연습용/);
   scenario="unrated";await choose();
   await page.waitForFunction(()=>document.querySelector("#schoolTier").textContent.includes("미산정"));
   scenario="mismatch";await choose();
   await page.waitForFunction(()=>document.querySelector("#schoolStatus").textContent.includes("조회 실패"));
   assert.match(await page.locator("#schoolTier").textContent(),/미산정/);
   assert.deepEqual(errors,[]);
   console.log("PASS browser stage019:",width,"px approved, unapproved, unrated, mismatched ID");
   await context.close();
  }
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
