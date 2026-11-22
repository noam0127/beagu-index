#!/usr/bin/env node
"use strict";
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),http=require("node:http"),assert=require("node:assert/strict");
const ROOT=path.resolve(__dirname,".."),DIR=path.join(ROOT,"games/nangam-schoolband-v08"),OUT=path.join(ROOT,"artifacts/schoolband-stage009");
const HTML=fs.readFileSync(path.join(DIR,"index.html"),"utf8"),M=JSON.parse(fs.readFileSync(path.join(DIR,"charts/creative-school-anthem.chart.v1.json"),"utf8")),SCHEMA=JSON.parse(fs.readFileSync(path.join(DIR,"charts/schoolband-chart.schema.json"),"utf8"));
const COUNTS={guitar:[5,7,9,11,18],drums:[4,6,9,14,21],bass:[4,6,8,10,16],keys:[5,7,8,10,18]},IDS=Object.keys(COUNTS),TIERS=["easy","normal","hard","very_hard","extreme"];
const result={stage:"009/030",schema:{},unit:{},browser:[],limitations:["Oscillator/noise event traces are not a human listening test or a measure of acoustic output quality.","Hold notes intentionally disabled until hold/release scoring is implemented.","The single-file app retains an embedded chart copy; schema + exact JSON parity are CI gated.","No real school anthem is downloaded or published."]};
fs.mkdirSync(OUT,{recursive:true});
const save=()=>fs.writeFileSync(path.join(OUT,"results.json"),JSON.stringify(result,null,2)+"\n");
const copy=x=>JSON.parse(JSON.stringify(x));
function gameModel(){
 const js=HTML.match(/<script>([\s\S]*?)<\/script>/i)?.[1];assert(js);new vm.Script(js);
 const i=HTML.match(/const INST=(\{[\s\S]*?\});\s*\/\/ \[한 마디/);
 const p=HTML.match(/const PARTS=(\{[\s\S]*?\});\s*\/\/ BEGIN SCHOOLBAND_TIMING_MODEL_V1/);
 assert(i&&p,"game INST/PARTS");
 const s=HTML.indexOf("// BEGIN SCHOOLBAND_CHART_VALIDATION_V1"),e=HTML.indexOf("// END SCHOOLBAND_CHART_VALIDATION_V1");
 assert(s>=0&&e>s,"pure chart validator");
 return {inst:copy(vm.runInNewContext("("+i[1]+")",{}, {timeout:1000})),patterns:JSON.parse(p[1]),
 validate:vm.runInNewContext(HTML.slice(HTML.indexOf("\n",s)+1,e)+"\nvalidateChartCatalog",{}, {timeout:1000}),rawPart:p[1]};
}
function schemaProof(){
 let Ajv;try{Ajv=require("ajv/dist/2020");}catch(e){throw Error("Install ajv@8 before stage009: "+e.message)}
 const check=new Ajv({strict:true,allErrors:true}).compile(SCHEMA);
 assert(check(M),"original chart must satisfy JSON Schema 2020-12: "+JSON.stringify(check.errors));
 const faults=[
 ["schema-version",m=>m.schemaVersion=2],["chart-version",m=>m.chartVersion="invalid"],["extra-root",m=>m.secret="x"],
 ["unsupported-hold-note",m=>m.noteTypes=["tap","hold"]],["hold-duration",m=>m.patterns.guitar[0]=[0,0,0,4]],
 ["invalid-16th",m=>m.patterns.drums[0]=[16,0,0]],["negative-lane",m=>m.patterns.keys[0]=[0,-1,0]],
 ["extra-lane-property",m=>m.instruments.guitar.lanes[0].secret="x"],["missing-bass",m=>delete m.instruments.bass],
 ["bad-tempo",m=>m.bpm=240],["hold-enabled",m=>m.longNotesEnabled=true],
 ["unknown-part",m=>m.patterns.saxophone=[[0,0,0]]]
 ];
 for(const [name,alter] of faults){const item=copy(M);alter(item);assert.equal(check(item),false,"schema failed to reject "+name)}
 result.schema={passed:true,draft:"2020-12",negativeCases:faults.map(x=>x[0])};
 console.log("PASS JSON Schema: 1 chart and "+faults.length+" malformed manifests rejected");
}
function staticProof(){
 const {inst,patterns,validate}=gameModel();
 assert.deepEqual(patterns,M.patterns,"embedded PARTS must equal versioned external JSON");
 assert.deepEqual(Object.fromEntries(Object.entries(inst).map(([id,x])=>[id,{name:x.name,lanes:x.lanes}])),Object.fromEntries(Object.entries(M.instruments).map(([id,x])=>[id,{name:x.name,lanes:x.lanes.map(y=>[y.label,y.displayKey,y.code])}])), "lane metadata parity");
 assert.equal(M.schemaVersion,1);assert.equal(M.chartVersion,"creative-anthem-rhythm-v1.0.0");
 assert.deepEqual(M.noteTypes,["tap"]);assert.equal(M.longNotesEnabled,false);
 assert.equal(M.bpm,108);assert.equal(M.barCount,8);assert.deepEqual(M.supportedTiers,TIERS);
 assert(HTML.includes('const CHART_VERSION="'+M.chartVersion+'";'));
 const audit=copy(validate(patterns,inst,M.chartVersion));
 assert.equal(audit.valid,true,"original chart invalid: "+JSON.stringify(audit.errors));
 const stats={};
 for(const id of IDS){
  const tiers=audit.metrics[id].tiers,counts=tiers.map(t=>t.noteCountPerBar);
  assert.deepEqual(counts,COUNTS[id],id+" per-tier density");
  assert(tiers.every(t=>t.perLane.every(n=>n>=1)),"empty lane "+id);
  assert(tiers.every(t=>t.maxSimultaneous<=2),"triple chord "+id);
  assert(tiers[4].sixteenthCount>0);
  for(let i=1;i<5;i++){
   assert(counts[i]>counts[i-1],"density not increasing "+id);
   assert(tiers[i].offbeatCount>=tiers[i-1].offbeatCount,"offbeat complexity decreased "+id);
  }
  stats[id]={notesPerBar:counts,totalNotes:tiers.map(t=>t.totalNotes),chordMoments:tiers.map(t=>t.chordMoments),
   extreme16th:tiers[4].sixteenthCount,extremeLanes:tiers[4].perLane};
 }
 assert(stats.guitar.chordMoments[2]>0);
 assert(stats.drums.chordMoments[3]>=4);
 assert(stats.keys.chordMoments[3]>=2);
 assert(stats.bass.chordMoments.every(n=>n===0));
 const corrupt=[
  ["wrong-version",x=>x.ver="creative-anthem-rhythm-v0.0.0","chart_version_mismatch"],
  ["out-of-range-drum",x=>x.part.drums.push([5,4,4]),"drums:invalid_note"],
  ["duplicate-guitar",x=>x.part.guitar.push([0,0,4]),"guitar:duplicate_lane_step"],
  ["missing-easy-lane",x=>x.part.keys=x.part.keys.filter(row=>!(row[0]===12&&row[1]===4&&row[2]===0)),"keys:empty_lane_tier_0"],
  ["flat-density",x=>x.part.guitar=x.part.guitar.filter(row=>row[2]!==1),"guitar:density_not_increasing_tier_1"],
  ["hold-note-row",x=>x.part.bass.push([3,0,4,3]),"bass:invalid_note"],
  ["bass-chord",x=>x.part.bass.push([0,1,4]),"bass:chord_not_supported"],
  ["triple-guitar-chord",x=>x.part.guitar.push([0,2,4]),"guitar:unplayable_multi_chord_tier_4"],
  ["unknown-part",x=>x.part.harp=[[0,0,0]],"instrument_set"],
  ["invalid-tier",x=>x.part.keys.push([5,0,6]),"keys:invalid_note"]
 ];
 for(const [name,alter,expected]of corrupt){
  const x={part:copy(patterns),ver:M.chartVersion};alter(x);
  const a=copy(validate(x.part,inst,x.ver));
  assert.equal(a.valid,false,"validator accepted "+name);
  assert(a.errors.some(e=>e.includes(expected)),name+" did not return "+expected+": "+a.errors);
 }
 result.unit={passed:true,stats,chartCombinations:20,laneTierPairs:80,semanticNegativeCases:corrupt.map(x=>x[0])};
 console.log("PASS semantic rhythm chart: all 20 tiers, 80 lane pairs, 10 invalid charts rejected");
}
async function browserProof(){
 const {chromium}=require("playwright");
 const raw=gameModel().rawPart;
 const server=http.createServer((req,res)=>{
  const route=(req.url||"/").split("?")[0];
  let html=HTML;
  if(route==="/bad-version")html=html.replace('const CHART_VERSION="creative-anthem-rhythm-v1.0.0";','const CHART_VERSION="creative-anthem-rhythm-v0.0.0";');
  if(route==="/bad-notes"){
   const part=copy(M.patterns);part.guitar.push([0,0,4]);
   html=html.replace("const PARTS="+raw+";","const PARTS="+JSON.stringify(part)+";");
  }
  res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"});res.end(html);
 });
 await new Promise(r=>server.listen(0,"127.0.0.1",r));
 let b;
 try{
  b=await chromium.launch({headless:true,args:["--no-sandbox","--autoplay-policy=no-user-gesture-required"]});
  const origin="http://127.0.0.1:"+server.address().port;
  for(const mode of ["desktop","mobile320"]){
   const mobile=mode==="mobile320";
   const context=await b.newContext({viewport:mobile?{width:320,height:640}:{width:1280,height:850},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1});
   await context.addInitScript(()=>{
    window.__stage009Sources=[];
    const Native=window.AudioContext||window.webkitAudioContext;
    if(Native)window.AudioContext=class TracedContext extends Native{
      createOscillator(){
       const o=super.createOscillator(),start=o.start.bind(o);
       o.start=(when)=>{window.__stage009Sources.push({type:o.type,frequency:o.frequency.value,when,kind:"oscillator"});return start(when)};
       return o;
      }
      createBufferSource(){
       const o=super.createBufferSource(),start=o.start.bind(o);
       o.start=(when)=>{window.__stage009Sources.push({kind:"noise",when});return start(when)};
       return o;
      }
    };
   });
   let reqCount=0;
   await context.route("**/functions/v1/schoolband-school-read-v1*",route=>{
    reqCount++;
    const params=new URL(route.request().url()).searchParams;
    const payload=params.has("schools")?
      {schools:[{school_id:"fake-009",school_name:"리듬검증가상학교",sido_standard:"가상"}]}:
      {school:{school_id:"fake-009",school_name:"리듬검증가상학교",region:"가상",eligible:true,difficulty:"normal",source_year:2026}};
    return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(payload)});
   });
   const page=await context.newPage(),errors=[];
   page.on("pageerror",e=>errors.push(e.message));
   try{
    assert((await page.goto(origin,{waitUntil:"domcontentloaded"})).ok());
    const instruments=[];
    for(const [i,id] of IDS.entries()){
     await page.locator('[data-inst="'+id+'"]').click();
     const info=await page.evaluate(()=>{
      const api=window.nangamSchoolbandV08;
      return {version:api.getChartVersion(),metadata:api.getChartMetadata(),audit:api.getChartAudit(),
       instrument:api.getInstrument(),widthOk:document.documentElement.scrollWidth<=document.documentElement.clientWidth+2};
     });
     assert.equal(info.version,M.chartVersion);assert.equal(info.metadata.schemaVersion,1);
     assert.deepEqual(info.metadata.noteTypes,["tap"]);assert.equal(info.metadata.longNotesEnabled,false);
     assert.equal(info.audit.valid,true);assert.equal(info.instrument,id);assert.equal(info.widthOk,true);
     assert.deepEqual(info.audit.metrics[id].tiers.map(x=>x.noteCountPerBar),COUNTS[id]);
     if(mode==="desktop")await page.locator(".stage-wrap").screenshot({path:path.join(OUT,id+"-chart.png")});
     if(i===0)await page.locator("#demoSchool").click();
     await page.locator("#start").click();
     await page.waitForFunction(()=>window.nangamSchoolbandV08.getPlayhead()>=-.02,null,{timeout:3000});
     const lane=id==="keys"?1:0;
     const trace=await page.evaluate(lane=>{
      const api=window.nangamSchoolbandV08;
      const prior=window.__stage009Sources.length;
      const e=new PointerEvent("pointerdown",{bubbles:true,cancelable:true,pointerType:"touch"});
      document.querySelector('#pads .taphit[data-lane="'+lane+'"]').dispatchEvent(e);
      return {events:window.__stage009Sources.slice(prior),hits:api.getStatus().hits};
     },lane);
     assert.equal(trace.hits,1,"charted "+id+" note must hit");
     const shapes=trace.events.map(x=>x.kind==="noise"?"noise":x.type).sort();
     assert(shapes.length>0,"no audio output nodes on hit "+id);
     assert(shapes.includes({guitar:"sawtooth",drums:"sine",bass:"triangle",keys:"sine"}[id]),"wrong timbre "+id+" "+shapes);
     instruments.push({id,notesPerBar:COUNTS[id],soundSources:trace.events,sourceShapes:shapes,hit:true});
     await page.locator("#stop").click();
    }
    for(const route of ["/bad-version","/bad-notes"]){
     await page.goto(origin+route,{waitUntil:"domcontentloaded"});
     await page.locator("#demoSchool").click();
     await page.locator("#start").click();
     const bad=await page.evaluate(()=>({status:window.nangamSchoolbandV08.getStatus(),label:document.querySelector("#feedback").textContent,results:document.querySelector("#result").textContent}));
     assert.equal(bad.status.playing,false,"bad chart was played");
     assert(bad.label.includes("차트 데이터 검증에 실패"),"invalid chart must show fail-closed notice");
     assert(bad.results.includes("차트 오류"),"invalid chart error in result required");
    }
    assert.deepEqual(errors,[],"page errors");
    result.browser.push({mode,passed:true,instruments,malformedStartsBlocked:2,mockedSchoolApiRequests:reqCount,errors});
    console.log("PASS stage009 "+mode+": four visible chart signatures + four audible-node patterns + two invalid chart start blocks");
   }finally{await context.close();}
  }
 }finally{if(b)await b.close();await new Promise(r=>server.close(r));}
}
(async()=>{schemaProof();staticProof();if(process.argv.includes("--browser"))await browserProof();save();console.log("PASS Stage009 schema, runtime, rhythm chart and browser proof");})()
.catch(e=>{result.failure=String(e.stack||e);save();console.error("FAIL Stage009 "+(e.stack||String(e)));process.exitCode=1});
