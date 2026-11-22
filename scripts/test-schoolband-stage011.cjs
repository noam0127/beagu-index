#!/usr/bin/env node
"use strict";
const fs=require("node:fs"),path=require("node:path"),http=require("node:http"),vm=require("node:vm"),assert=require("node:assert/strict");
const ROOT=path.resolve(__dirname,".."),HTML=fs.readFileSync(path.join(ROOT,"games/nangam-schoolband-v08/index.html"),"utf8");
const OUT=path.join(ROOT,"artifacts/schoolband-stage011");fs.mkdirSync(OUT,{recursive:true});
const DATA={stage:"011/030",unit:{},offline:{full:[],stems:[]},live:[],limits:[
 "OfflineAudioContext measures digital PCM peak, not perceived headphone/speaker loudness.",
 "Physical phone audio output, real-world clipping and human listening remain unverified (stage027).",
 "Peak stress assumes at most 2 simultaneous successful lane hits consistent with stage009.",
 "Only original fictional-school melody, never copyrighted real school audio, is analyzed."
]};
const save=()=>fs.writeFileSync(path.join(OUT,"results.json"),JSON.stringify(DATA,null,2)+"\n");
function source(){
 const js=HTML.match(/<script>([\s\S]*?)<\/script>/i)?.[1];assert(js,"game JS");new vm.Script(js);
 const a=HTML.indexOf("function trackAudioSource("),b=HTML.indexOf("function makeChart(){");
 const inst=HTML.match(/const INST=(\{[\s\S]*?\});\s*\/\/ \[한 마디/);
 const mix=HTML.match(/const MIX_LEVELS=Object.freeze\((\{[^)]*\})\)/);
 assert(a>0&&b>a&&inst&&mix,"source markers for real synthesizer");
 return {sound:HTML.slice(a,b),inst:inst[1],mix:mix[1]};
}
function unit(){
 const src=source();
 const model=vm.runInNewContext(
  "const BEAT=60/108,SONG_BEATS=32,INST="+src.inst+",MIX_LEVELS="+src.mix+";"+
  "let ctx=null,masterBus=null,melodyBus=null,ensembleBus=null,hitBus=null,noiseBuffer=null,muted=false,instrument='guitar';const liveAudioVoices=new Set();const audioLife={created:0,ended:0,cancelled:0,disconnected:0,peakVoices:0};let contextClosePromise=Promise.resolve();\n"+
  src.sound+"\n({harmonyAtBar,chordThirdRatio,rootAt,checkMelodyHarmony,MIX_LEVELS,CHORD_ROOTS,autoPartsAtStep})",
  {},{timeout:1000});
 const expected=["C","C","G","G","Am","Am","F","C"],pcs=[0,0,7,7,9,9,5,0],bars=[];
 for(let bar=0;bar<8;bar++){
  const x=JSON.parse(JSON.stringify(model.harmonyAtBar(bar))),minor=bar===4||bar===5;
  assert.equal(x.symbol,expected[bar]);assert.equal(x.rootPc,pcs[bar]);
  assert.equal(x.thirdPc,(pcs[bar]+(minor?3:4))%12);
  assert.equal(x.fifthPc,(pcs[bar]+7)%12);
  assert.equal(x.minor,minor);
  assert(Math.abs(model.rootAt(bar*4)-model.CHORD_ROOTS[bar])<.0001);
  assert(Math.abs(model.chordThirdRatio(bar*4)-Math.pow(2,(minor?3:4)/12))<.000001);
  bars.push(x);
 }
 assert.equal(model.harmonyAtBar(-1),null);assert.equal(model.harmonyAtBar(8),null);
 const audit=JSON.parse(JSON.stringify(model.checkMelodyHarmony()));
 assert.equal(audit.length,28);
 const consonant=audit.filter(n=>n.chordTone),tension=audit.filter(n=>!n.chordTone);
 assert(consonant.length>=18&&tension.length>=1,"distinguish chord tones from passing melody");
 for(const bar of [4,5]){
  const c=model.rootAt(bar*4)*2*model.chordThirdRatio(bar*4);
  const expectedC=440*Math.pow(2,(60-69)/12);
  assert(Math.abs(c-expectedC)<.04,"Am must produce C natural not C#");
 }
 const levels=JSON.parse(JSON.stringify(model.MIX_LEVELS));
 assert(levels.master>0&&levels.master<=.85);
 assert(levels.melody>levels.ensemble*1.6);
 assert(levels.hit>levels.ensemble);
 for(const selected of ["guitar","drums","bass","keys"]){
  const plan=Array.from(model.autoPartsAtStep(0,selected));
  assert(plan.includes("melody")&&!plan.includes(selected));
  assert.equal(plan.filter(x=>x!=="melody").length,3);
 }
 assert(Math.abs(model.chordThirdRatio(16)-Math.pow(2,4/12))>.05,"fail if Am is A major");
 DATA.unit={passed:true,barChords:bars,melodyNotes:28,chordTones:consonant.length,
   passingOrColorNotes:tension.length,nonChordTones:tension.map(n=>({bar:n.bar,step:n.step,pitch:n.pitch})),
   mixLevels:levels,negativeControl:"Am uses minor third C natural, not C-sharp"};
 console.log("PASS harmony eight chord bars and 28 melody notes; Am C natural, three gain buses + master");
 return src;
}
function offlineHarness(src){
 return [
 "(function(){",
 "const BEAT=60/108,SONG_BEATS=32,INST="+src.inst+",MIX_LEVELS="+src.mix+";",
 "let ctx=null,masterBus=null,melodyBus=null,ensembleBus=null,hitBus=null,noiseBuffer=null,muted=false,instrument='guitar';const liveAudioVoices=new Set();const audioLife={created:0,ended:0,cancelled:0,disconnected:0,peakVoices:0};let contextClosePromise=Promise.resolve();",
 src.sound,
 "async function render(bar,selected,mode){",
 " if(bar<0||bar>=8||!INST[selected])throw new Error('invalid bar or instrument');",
 " const rate=24000,length=Math.ceil(rate*1.65);ctx=new OfflineAudioContext(2,length,rate);",
 " masterBus=ctx.createGain();masterBus.gain.value=MIX_LEVELS.master;",
 " melodyBus=ctx.createGain();ensembleBus=ctx.createGain();hitBus=ctx.createGain();",
 " melodyBus.gain.value=MIX_LEVELS.melody;ensembleBus.gain.value=MIX_LEVELS.ensemble;hitBus.gain.value=MIX_LEVELS.hit;",
 " melodyBus.connect(masterBus);ensembleBus.connect(masterBus);hitBus.connect(masterBus);",
 " const comp=ctx.createDynamicsCompressor();comp.threshold.value=-19;comp.knee.value=14;comp.ratio.value=7;",
 " comp.attack.value=.004;comp.release.value=.20;masterBus.connect(comp);comp.connect(ctx.destination);",
 " noiseBuffer=null;instrument=selected;soundEvents.length=0;",
 " const base=bar*16,at=.09;",
 " for(let n=base;n<base+10;n++){",
 "  const when=at+(n-base)*BEAT/4;",
 "  if(mode==='full')scheduleStep(n,when);",
 "  else if(mode==='melody'){const lead=MELODY_BY_STEP.get(n);if(lead)melodyVoice(lead.pitch,when,lead.duration*BEAT/4)}",
 "  else if(mode==='auto'){for(const part of autoPartsAtStep(n,selected)){",
 "   if(part==='melody')continue;",
 "   if(part==='drums'){const lane=n%4===0?(n%16===0?0:1):2;voice('drums',n/4,when,lane,'auto')}",
 "   else voice(part,n/4,when,0,'auto');",
 "  }}",
 " }",
 " if(mode==='full'){voice(selected,bar*4,at,0,'hit');voice(selected,bar*4,at,1,'hit')}",
 " const events=soundEvents.map(e=>({...e}));",
 " const buff=await ctx.startRendering();let peak=0,sum=0,samples=0,bad=0,clipped=0;",
 " for(let ch=0;ch<buff.numberOfChannels;ch++){const data=buff.getChannelData(ch);",
 "  for(let i=0;i<data.length;i++){const v=data[i];if(!Number.isFinite(v)){bad++;continue}",
 "   const a=Math.abs(v);peak=Math.max(peak,a);sum+=v*v;samples++;if(a>=.999)clipped++;",
 "  }",
 " }",
 " return {bar,selected,mode,peak,rms:Math.sqrt(sum/samples),samples,bad,clipped,",
 "  peakDbfs:peak>0?20*Math.log10(peak):-Infinity,",
 "  hitEvents:events.filter(e=>e.source==='hit').length,",
 "  melodyEvents:events.filter(e=>e.part==='melody').length};",
 "}",
 "window.__stage011Render=render;",
 "})();"
 ].join("\n");
}
async function browser(){
 const src=source(),{chromium}=require("playwright");
 const server=http.createServer((req,res)=>{res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"});res.end(HTML)});
 await new Promise(r=>server.listen(0,"127.0.0.1",r));
 let browser;
 try{
  browser=await chromium.launch({headless:true,args:["--no-sandbox","--autoplay-policy=no-user-gesture-required"]});
  const addr="http://127.0.0.1:"+server.address().port;
  const context=await browser.newContext({viewport:{width:1280,height:850}});
  const page=await context.newPage(),errors=[];page.on("pageerror",e=>errors.push(e.message));
  try{
   assert((await page.goto(addr,{waitUntil:"domcontentloaded"})).ok());
   const stage=await page.evaluate(()=>({
    levels:window.nangamSchoolbandV08.getMixLevels(),
    bars:window.nangamSchoolbandV08.getHarmonyByBar(),
    audit:window.nangamSchoolbandV08.getMelodyHarmonyAudit()
   }));
   assert.deepEqual(stage.levels,DATA.unit.mixLevels);
   assert.deepEqual(stage.bars,DATA.unit.barChords);
   assert.equal(stage.audit.length,28);
   await page.addScriptTag({content:offlineHarness(src)});
   for(const selected of ["guitar","drums","bass","keys"]){
    for(let bar=0;bar<8;bar++){
     const r=await page.evaluate(({bar,selected})=>window.__stage011Render(bar,selected,"full"),{bar,selected});
     assert.equal(r.bad,0,selected+" non-finite samples bar "+bar);
     assert.equal(r.clipped,0,selected+" clipping bar "+bar);
     assert(r.peak>0.005&&r.peak<.96,selected+" peak out-of-range bar "+bar+" value="+r.peak);
     assert(r.rms>.0008,selected+" unexpectedly quiet bar "+bar);
     assert.equal(r.hitEvents,2,"two-hit stress "+selected+" bar "+bar);
     assert(r.melodyEvents>=1,"original melody missing");
     DATA.offline.full.push(r);
    }
   }
   for(let bar=0;bar<8;bar++){
    const mel=await page.evaluate(bar=>window.__stage011Render(bar,"guitar","melody"),bar);
    const auto=await page.evaluate(bar=>window.__stage011Render(bar,"guitar","auto"),bar);
    assert(mel.rms>.0005&&auto.rms>.0005,"missing isolated signal bar "+bar);
    const ratio=mel.rms/auto.rms;
    assert(ratio>.30,"melody masked by backing at bar "+bar+" ratio "+ratio);
    DATA.offline.stems.push({bar,melodyRms:mel.rms,backingRms:auto.rms,ratio});
   }
   assert.deepEqual(errors,[]);
   DATA.live.push({mode:"offline-chromium",passed:true,renderCount:48,peakMaximum:Math.max(...DATA.offline.full.map(x=>x.peak)),
     clippingSamples:DATA.offline.full.reduce((a,x)=>a+x.clipped,0)});
   console.log("PASS OfflineAudioContext 32 full-band renders +16 stems; no clipping and melody audible");
  }finally{await context.close();}
  for(const mode of ["desktop","mobile320"]){
   const context=await browser.newContext({viewport:mode==="mobile320"?{width:320,height:640}:{width:1280,height:850},
    isMobile:mode==="mobile320",hasTouch:mode==="mobile320"});
   await context.addInitScript(()=>{
    window.__stage011Gains=[];
    const Native=window.AudioContext||window.webkitAudioContext;
    if(Native)window.AudioContext=class TracingAudio extends Native{
     createGain(){const node=super.createGain();window.__stage011Gains.push(node);return node}
    };
   });
   const p=await context.newPage(),errs=[];p.on("pageerror",e=>errs.push(e.message));
   try{
    assert((await p.goto(addr,{waitUntil:"domcontentloaded"})).ok());
    await p.locator("#demoSchool").click();await p.locator('[data-inst="keys"]').click();
    await p.locator("#start").click();
    await p.waitForFunction(()=>window.nangamSchoolbandV08.getStatus().playing);
    const r=await p.evaluate(()=>{
     const a=window.nangamSchoolbandV08;
     return {mix:a.getMixLevels(),gains:window.__stage011Gains.slice(0,4).map(x=>x.gain.value),
      chart:a.getChart(),overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2};
    });
    const expectedGains=[r.mix.master,r.mix.melody,r.mix.ensemble,r.mix.hit];
    assert.equal(r.gains.length,expectedGains.length,"four gain buses");
    r.gains.forEach((g,i)=>assert(Math.abs(g-expectedGains[i])<0.00001,
      "actual WebAudio AudioParam Float32 gain "+i+" expected "+expectedGains[i]+" got "+g));
    assert(r.chart.length>0&&!r.overflow,"original chart or mobile layout broken");
    await p.locator(".stage-wrap").screenshot({path:path.join(OUT,mode+"-harmony-mix.png")});
    await p.locator("#stop").click();assert.deepEqual(errs,[]);
    DATA.live.push({mode,passed:true,gainLevels:r.gains,chartNotes:r.chart.length});
    console.log("PASS "+mode+" four gain buses and unchanged original game layout");
   }finally{await context.close();}
  }
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
}
(async()=>{
 unit();if(process.argv.includes("--browser"))await browser();save();
 console.log("PASS Stage011 chord harmony and measured digital mix peak");
})().catch(e=>{DATA.failure=String(e.stack||e);save();console.error("FAIL Stage011 "+(e.stack||String(e)));process.exitCode=1;});
