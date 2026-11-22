#!/usr/bin/env node
"use strict";
// Stage024 test: scoring and storage/identity only. No audio playback or playfeel tests.
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict"),vm=require("node:vm"),http=require("node:http");
const ROOT=path.resolve(__dirname,"..");
const HTML=fs.readFileSync(path.join(ROOT,"games/nangam-schoolband-v08/index.html"),"utf8");
const JS=HTML.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert(JS);new vm.Script(JS);
const first=JS.indexOf("// BEGIN SCHOOLBAND_SCORE_V2");
const last=JS.indexOf("// END SCHOOLBAND_SCORE_V2");
assert(first>=0&&last>first);
const pure=JS.slice(first,last);
const sandbox=vm.createContext({});
new vm.Script(pure+";globalThis.scoreApi={scoreRecordKey,parseStoredScore,scoreAccuracy,validScoringResult,scoreForHit};").runInContext(sandbox);
const M=sandbox.scoreApi;let checked=0;
function eq(a,b,label){assert.equal(a,b,label);checked++;}
const id={schoolId:"7004971",songId:"original-shining-our-school",chartVersion:"creative-anthem-rhythm-v1.0.0",instrument:"guitar",difficulty:"normal"};
const key=M.scoreRecordKey(id);
eq(key,"nangam-schoolband-best-v2:7004971:original-shining-our-school:creative-anthem-rhythm-v1.0.0:guitar:normal","full identity");
for(const field of Object.keys(id)){
 eq(M.scoreRecordKey({...id,[field]:"other"})===key,false,"isolate "+field);
}
eq(M.scoreRecordKey({...id,chartVersion:"v1.0.0+sha256abcd"})!==null,true,"generated chart versions accepted");
eq(M.scoreRecordKey({...id,schoolId:"../other"}),null,"pathlike school rejected");
eq(M.scoreRecordKey({...id,schoolId:""}),null,"blank ID rejected");
eq(M.scoreRecordKey(null),null,"empty identity rejected");
eq(M.scoreAccuracy(4,5),80,"accuracy");
eq(M.scoreAccuracy(0,5),0,"all misses");
eq(M.scoreAccuracy(1,0),null,"zero notes");
eq(M.scoreAccuracy(6,5),null,"invalid counts");
eq(M.scoreForHit("perfect",1),1005,"perfect combo1");
eq(M.scoreForHit("good",1),603,"good combo1");
eq(M.scoreForHit("perfect",100),1500,"perfect combo100 cap");
eq(M.scoreForHit("perfect",200),1500,"perfect combo200 cap");
eq(M.scoreForHit("good",200),900,"good combo200 cap");
eq(M.scoreForHit("miss",1),null,"miss no points");
eq(M.scoreForHit("good",0),null,"combo0 rejected");
eq(M.parseStoredScore("1500"),1500,"score readable");
eq(M.parseStoredScore("0"),0,"zero readable");
for(const invalid of ["",null,"null","NaN","Infinity","1.5","1e8","00123","-10","10000001","99999999999999999999999"," 1","1 "])
 eq(M.parseStoredScore(invalid),null,"reject saved "+String(invalid));
const complete={interrupted:false,song:"volleyball",total:3,judged:3,hits:2,perfect:1,good:1,miss:1,score:1611};
eq(M.scoreForHit("perfect",1)+M.scoreForHit("good",2),1611,"expected 2-note combo score");
eq(M.validScoringResult(complete),true,"complete good with miss");
eq(M.validScoringResult({...complete,interrupted:true}),false,"interruption denied");
eq(M.validScoringResult({...complete,song:"anthem"}),false,"unimplemented anthem denied");
eq(M.validScoringResult({...complete,judged:2}),false,"partial denied");
eq(M.validScoringResult({...complete,total:4}),false,"not all judged");
eq(M.validScoringResult({...complete,hits:3}),false,"hits mismatch");
eq(M.validScoringResult({...complete,perfect:2}),false,"perfect mismatch");
eq(M.validScoringResult({...complete,miss:-1}),false,"negative misses");
eq(M.validScoringResult({...complete,score:900000}),false,"implausible inflated score");
eq(M.validScoringResult({...complete,score:1000}),false,"implausibly low score");
eq(M.validScoringResult({...complete,score:1608.5}),false,"decimal denied");
const allmiss={...complete,total:2,judged:2,hits:0,perfect:0,good:0,miss:2,score:0};
eq(M.validScoringResult(allmiss),true,"valid all miss can store zero");
assert(HTML.includes('id="resetBest"'));checked++;
assert(HTML.includes('id="recordStatus"'));checked++;
assert(HTML.includes('getBestRecordKey:()=>currentBestKey()'));checked++;
assert(!HTML.includes('localStorage.setItem("nangam-band-v08:"+school.school_id'),"no old unversioned write");checked++;
const beginSave=JS.indexOf("function saveCompletedBest("),endSave=JS.indexOf("function resetCurrentBest()",beginSave);
assert(beginSave>0&&endSave>beginSave);
function makeStore(throwing=false){
 const data=new Map(),storage={
  getItem:k=>data.has(k)?data.get(k):null,
  setItem:(k,v)=>{if(throwing)throw Error("QuotaExceeded");data.set(k,v)},
  removeItem:k=>data.delete(k)
 };
 const context=vm.createContext({localStorage:storage,currentBestKey:()=>key,validScoringResult:M.validScoringResult,parseStoredScore:M.parseStoredScore});
 const f=vm.runInContext(JS.slice(beginSave,endSave)+";saveCompletedBest",context);
 return {data,storage,save:f};
}
const saved=makeStore();
eq(saved.save(complete).saved,true,"new best stored");
eq(saved.storage.getItem(key),"1611","best value");
eq(saved.save({...complete,score:1608}).reason,"no_improvement","lower never overwrites");
eq(saved.save(complete).saved,false,"ties never overwrite");
eq(saved.save({...complete,interrupted:true,score:1700}).saved,false,"interrupted higher denied");
eq(saved.save({...complete,score:1700}).saved,true,"higher best stored");
eq(saved.storage.getItem(key),"1700","newer record");
const blocked=makeStore(true);
eq(blocked.save(complete).reason,"storage_unavailable","storage denial safe");
console.log("PASS stage024",checked,"pure scoring, isolation, corrupted values, completion and storage denial checks");
if(process.argv.includes("--browser"))(async()=>{
 const {chromium}=require("playwright");
 const catFile=path.join(ROOT,"games/nangam-schoolband-v08/charts/school-homepages.v1.json");
 const catalog=fs.readFileSync(catFile,"utf8");
 const server=http.createServer((req,res)=>{
  if(req.url?.startsWith("/charts/school-homepages.v1.json")){
   res.writeHead(200,{"content-type":"application/json"});res.end(catalog);return;
  }
  res.writeHead(200,{"content-type":"text/html; charset=utf-8"});res.end(HTML);
 });
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 let browser;try{
  browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
  for(const width of [1280,320]){
   const ctx=await browser.newContext({viewport:{width,height:width===320?640:850},isMobile:width===320,hasTouch:width===320});
   const page=await ctx.newPage(),errors=[];page.on("pageerror",e=>errors.push(e.message));
   await page.goto("http://127.0.0.1:"+server.address().port);
   await page.locator("#demoSchool").click();
   const original=await page.evaluate(()=>window.nangamSchoolbandV08.getBestRecordKey());
   assert(original?.startsWith("nangam-schoolband-best-v2:"));
   await page.evaluate(key=>localStorage.setItem(key,"2500"),original);
   assert.equal(await page.evaluate(()=>window.nangamSchoolbandV08.getBest()),2500);
   await page.locator("#resetBest").click();
   assert.equal(await page.evaluate(()=>window.nangamSchoolbandV08.getBest()),null);
   assert.match(await page.locator("#recordStatus").textContent(),/초기화/);
   await page.locator('.instrument[data-inst="bass"]').click();
   const bass=await page.evaluate(()=>window.nangamSchoolbandV08.getBestRecordKey());
   assert(bass!==original&&bass.includes(":bass:"));
   await page.evaluate(key=>localStorage.setItem(key,"not_a_number"),bass);
   assert.equal(await page.evaluate(()=>window.nangamSchoolbandV08.getBest()),null);
   assert.equal(await page.locator("#songAnthem").isDisabled(),true);
   assert.deepEqual(errors,[],"browser errors");
   console.log("PASS stage024 browser",width,"px key isolation, reset, bad storage, anthem locked (no audio)");
   await ctx.close();
  }
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
