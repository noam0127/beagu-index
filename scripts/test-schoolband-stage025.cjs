#!/usr/bin/env node
"use strict";
// Stage025: privacy and result UI only. Do NOT start music or do subjective sound/playfeel QA.
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict"),vm=require("node:vm"),http=require("node:http");
const ROOT=path.resolve(__dirname,"..");
const HTML=fs.readFileSync(path.join(ROOT,"games/nangam-schoolband-v08/index.html"),"utf8");
const source=HTML.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert(source);new vm.Script(source);
const start=source.indexOf("// BEGIN SCHOOLBAND_SCORE_V2"),stop=source.indexOf("// END SCHOOLBAND_SCORE_V2");
assert(start>0&&stop>start);
const context=vm.createContext({});
vm.runInContext(source.slice(start,stop)+";globalThis.api={concertSummaryModel,validScoringResult,scoreAccuracy};",context);
const M=context.api;
let tests=0;
function eq(actual,expected,label){assert.equal(actual,expected,label);tests++;}
const base={interrupted:false,song:"volleyball",total:3,judged:3,hits:2,perfect:1,good:1,miss:1,score:1611,bestCombo:2};
const complete=M.concertSummaryModel(base);
eq(complete.state,"complete","finished");
eq(complete.score,1611,"result score");
eq(complete.accuracy,67,"accuracy");
eq(complete.bestCombo,2,"best combo");
eq(complete.persistable,true,"finished may be saved separately");
assert.match(complete.breakdown,/PERFECT 1/);tests++;
const interrupted={...base,interrupted:true,judged:1,hits:1,perfect:1,good:0,miss:0,score:1005,bestCombo:1};
eq(M.concertSummaryModel(interrupted).state,"interrupted","paused/aborted distinction");
eq(M.concertSummaryModel(interrupted).persistable,false,"aborted never stored");
eq(M.concertSummaryModel(interrupted).accuracy,100,"partial accuracy is judged denominator");
eq(M.concertSummaryModel({...interrupted,score:900000}).state,"invalid","abnormal partial score rejected");
eq(M.concertSummaryModel({...interrupted,song:"anthem"}).state,"invalid","fake school anthem denied");
const mutations=[
 ["negative",{score:-1}],["float",{score:2.5}],["too many hits",{hits:4}],
 ["too many combo",{bestCombo:3}],["negative combo",{bestCombo:-1}],
 ["wrong counters",{miss:2}],["false points",{score:900000}],
 ["low points",{score:800}],["unfinished",{total:4}],
 ["missing judgement",{judged:2}],["invalid song",{song:"other"}],
 ["unexpected interrupt",{interrupted:"false"}],["zero total",{total:0}],
 ["wrong perfect",{perfect:3}],["negative misses",{miss:-1}],
 ["NaN score",{score:NaN}],["Infinity score",{score:Infinity}]];
for(const [label,patch] of mutations){
 const item=M.concertSummaryModel({...base,...patch});
 eq(item.state,"invalid","reject "+label);
 eq(item.persistable,false,"never persist "+label);
}
eq(M.concertSummaryModel(null).state,"invalid","null result invalid");
eq(M.concertSummaryModel({}).state,"invalid","missing result invalid");
eq(M.validScoringResult(base),true,"score model parity");
for(const id of ["concertSummary","summaryHeading","summaryScore","summaryAccuracy",
 "summaryCombo","summaryBreakdown","summaryNotice","summaryPrivacy"]){
 assert(HTML.includes('id="'+id+'"'),"summary DOM missing: "+id);tests++;
}
assert(HTML.includes('function renderConcertSummary(result,saved){'));tests++;
assert(HTML.includes('renderConcertSummary(outcome,saved)'));tests++;
assert(HTML.includes('renderConcertSummary(outcome,{saved:false,reason:"interrupted"})'));tests++;
assert(HTML.includes('function clearConcertSummary()'));tests++;
assert(HTML.includes('const saved=saveCompletedBest(outcome)'));tests++;
assert(HTML.includes('전국 순위표 미사용'));tests++;
assert(!/sendBeacon\s*\(|WebSocket\s*\(|fetch\s*\(\s*[^)]*method\s*:\s*["']POST/i.test(HTML),"no score posting");tests++;
console.log("PASS Stage025 local result summary and privacy: "+tests+" checks");
if(process.argv.includes("--browser"))(async()=>{
 const {chromium}=require("playwright");
 const hook='window.__stage025QA={render:(r,s)=>renderConcertSummary(r,s),clear:clearConcertSummary};';
 const marker="void loadHomepageCatalog();\n})();";
 assert(HTML.includes(marker),"test hook injection marker missing");
 const fixture=HTML.replace(marker,"void loadHomepageCatalog();\n"+hook+"\n})();");
 const server=http.createServer((req,res)=>{
  if(req.url?.startsWith("/charts/school-homepages.v1.json")){
   res.writeHead(200,{"content-type":"application/json"});
   res.end(JSON.stringify({schema_version:1,count:1,homepages:{"demo-school":"https://example.edu/"}}));return;
  }
  res.writeHead(200,{"content-type":"text/html; charset=utf-8"});res.end(fixture);
 });
 await new Promise(done=>server.listen(0,"127.0.0.1",done));let browser;
 try{
  browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
  for(const width of [1280,320]){
   const ctx=await browser.newContext({viewport:{width,height:width===320?640:850},isMobile:width===320,hasTouch:width===320});
   const page=await ctx.newPage(),errors=[],writes=[];
   page.on("pageerror",err=>errors.push(err.message));
   page.on("request",req=>{if(!["GET","HEAD","OPTIONS"].includes(req.method()))writes.push(req.method())});
   await page.goto("http://127.0.0.1:"+server.address().port);
   assert.equal(await page.locator("#concertSummary").isHidden(),true,"summary hidden at first");
   await page.locator("#demoSchool").click();
   await page.evaluate(r=>window.__stage025QA.render(r,{saved:true,reason:"new_best"}),base);
   assert.equal(await page.locator("#concertSummary").isVisible(),true);
   assert.match(await page.locator("#summaryHeading").innerText(),/공연 완료/);
   assert.equal(await page.locator("#summaryScore").innerText(),"1,611");
   assert.equal(await page.locator("#summaryAccuracy").innerText(),"67%");
   assert.equal(await page.locator("#summaryCombo").innerText(),"2");
   assert.match(await page.locator("#summaryNotice").innerText(),/새 최고 기록/);
   assert.match(await page.locator("#summaryPrivacy").innerText(),/순위표 미사용/);
   const key=await page.evaluate(()=>window.nangamSchoolbandV08.getBestRecordKey());
   assert(key,"versioned record key present");
   await page.evaluate(key=>localStorage.setItem(key,"2100"),key);
   await page.evaluate(r=>window.__stage025QA.render(r,{saved:false,reason:"no_improvement"}),interrupted);
   assert.match(await page.locator("#summaryHeading").innerText(),/연주 중단/);
   assert.match(await page.locator("#summaryNotice").innerText(),/저장하지 않습니다/);
   assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),"2100","summary must not save");
   await page.evaluate(r=>window.__stage025QA.render(r,{saved:false,reason:"incomplete_or_invalid"}),{...base,score:900000});
   assert.match(await page.locator("#summaryHeading").innerText(),/검증 실패/);
   assert.equal(await page.locator("#summaryScore").innerText(),"—");
   await page.locator("#demoSchool").click();
   assert.equal(await page.locator("#concertSummary").isHidden(),true,"new school selection clears summary");
   assert.deepEqual(errors,[],"no JS page errors");
   assert.deepEqual(writes,[],"no score or identity data written to server");
   console.log("PASS Stage025 browser "+width+"px summary complete/interrupted/invalid, reset, no POST; NO audio");
   await ctx.close();
  }
 }finally{await browser?.close();await new Promise(done=>server.close(done));}
})().catch(e=>{console.error(e);process.exitCode=1});
