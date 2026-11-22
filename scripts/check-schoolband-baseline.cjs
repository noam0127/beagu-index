#!/usr/bin/env node
"use strict";
const fs=require("node:fs");
const path=require("node:path");
const assert=require("node:assert/strict");
const htmlPath=path.resolve(__dirname,"../games/nangam-schoolband-v08/index.html");
const html=fs.readFileSync(htmlPath,"utf8");
const js=html.match(/<script>([\s\S]*?)<\/script>/i)?.[1];
assert(js,"inline game script must exist");
function extractJson(label,open,close){
  const pos=js.indexOf(label);assert(pos>=0,"Missing "+label);
  const a=js.indexOf(open,pos+label.length);assert(a>=0);
  let depth=0,quote=null;
  for(let i=a;i<js.length;i++){
    const ch=js[i];
    if(quote){if(ch===quote&&js[i-1]!=="\\")quote=null;continue}
    if(ch==='"'||ch==="'"){quote=ch;continue}
    if(ch===open)depth++;
    if(ch===close&&!--depth)return JSON.parse(js.slice(a,i+1));
  }
  throw Error("Unterminated "+label);
}
function staticCheck(){
  const parts=extractJson("const PARTS=","{","}");
  const melody=extractJson("const MELODY=","[","]");
  const roots=extractJson("const CHORD_ROOTS=","[","]");
  const lanes={guitar:4,drums:4,bass:3,keys:5};
  const tiers=["easy","normal","hard","very_hard","extreme"];
  const expectedPerBar={
    guitar:[5,7,9,11,18],drums:[4,6,9,14,21],
    bass:[4,6,8,10,16],keys:[5,7,8,10,18]
  };
  assert.equal(melody.length,28,"original practice melody requires 28 notes");
  assert.equal(roots.length,8,"8 chord roots");
  assert(js.includes("const TIERS=[\"easy\",\"normal\",\"hard\",\"very_hard\",\"extreme\"]"),"tier key names");
  assert(js.includes("const BEAT=60/108,BARS=8,SONG_BEATS=BARS*4"),"108 BPM 8 bars");
  assert(/rounded\(x\+4,y-12,lw-8,24,7\)/.test(js),"24px note geometry");
  for(const [inst,n] of Object.entries(lanes)){
    assert(Array.isArray(parts[inst]),"missing "+inst);
    for(let tier=0;tier<tiers.length;tier++){
      const notes=parts[inst].filter(r=>r[2]<=tier);
      assert.equal(notes.length,expectedPerBar[inst][tier],inst+" "+tiers[tier]+" pattern count");
      for(let lane=0;lane<n;lane++)assert(notes.some(r=>r[1]===lane),inst+" "+tiers[tier]+" lane "+lane);
      for(const r of notes){assert(Number.isInteger(r[0])&&r[0]>=0&&r[0]<16,"grid step");assert(Number.isInteger(r[1])&&r[1]>=0&&r[1]<n,"lane range");}
    }
  }
  console.log("PASS: 28-note melody, 8 bars, 24px notes, and 20/20 instrument×difficulty lane contracts");
}
staticCheck();
if(process.argv.includes("--browser")){
  (async()=>{
    const {chromium}=require("playwright");
    const output=path.resolve(__dirname,"../artifacts/schoolband-stage001");
    fs.mkdirSync(output,{recursive:true});
    const browser=await chromium.launch({headless:true,args:["--no-sandbox","--autoplay-policy=no-user-gesture-required"]});
    async function pageCheck(url,kind,viewport){
      const page=await browser.newPage({viewport,deviceScaleFactor:1});
      const errors=[];page.on("pageerror",e=>errors.push(String(e)));
      const response=await page.goto(url,{waitUntil:"domcontentloaded",timeout:25000});
      assert(response?.ok(),kind+" HTTP status="+response?.status());
      const type=response.headers()["content-type"]||"";
      assert(/text\/html/i.test(type),kind+" must serve HTML, received: "+type);
      const canvasCount=await page.locator("canvas#track").count();
      if(canvasCount!==1){
        const text=await page.locator("body").innerText().catch(()=>"(body unavailable)");
        console.error("HOST_DIAG",JSON.stringify({kind,finalUrl:page.url(),status:response.status(),contentType:type,title:await page.title(),body:text.slice(0,900)}));
        fs.writeFileSync(path.join(output,kind+"-unexpected.html"),(await page.content()).slice(0,30000));
        await page.screenshot({path:path.join(output,kind+"-unexpected.png"),fullPage:true});
      }
      assert.equal(canvasCount,1,kind+" canvas");
      await page.locator("#demoSchool").click();
      assert.equal(await page.locator("#start").isDisabled(),false,"play enabled with demo school");
      for(const [inst,count] of [["guitar",4],["drums",4],["bass",3],["keys",5]]){
        await page.locator('button[data-inst="'+inst+'"]').click();
        assert.equal(await page.locator("#pads .taphit").count(),count,kind+" "+inst+" pads");
        const exposed=await page.evaluate(()=>window.nangamSchoolbandV08);
        assert(exposed,kind+" game test API present");
        assert.equal(await page.evaluate(()=>window.nangamSchoolbandV08.getLaneCount()),count,kind+" lane count");
      }
      await page.screenshot({path:path.join(output,kind+".png"),fullPage:true});
      await page.locator("#start").click();
      assert.equal(await page.evaluate(()=>window.nangamSchoolbandV08.getStatus().playing),true,kind+" playing");
      assert(await page.evaluate(()=>window.nangamSchoolbandV08.getChart().length)>0,kind+" nonempty chart");
      await page.waitForTimeout(1250);
      await page.locator("#stop").click();
      assert.equal(await page.evaluate(()=>window.nangamSchoolbandV08.getStatus().playing),false,kind+" stopped");
      assert.deepEqual(errors,[],kind+" JS page errors");
      console.log("PASS browser: "+kind+", 4 instruments, 3–5 pads, HTML, start/stop, screenshot");
      await page.close();
    }
    try{
      await pageCheck("http://127.0.0.1:8123/games/nangam-schoolband-v08/index.html","local-desktop",{width:1280,height:900});
      await pageCheck("http://127.0.0.1:8123/games/nangam-schoolband-v08/index.html","local-mobile320",{width:320,height:640});
      const failures=[];
      for(const [url,kind] of [
        ["https://raw.githack.com/noam0127/beagu-index/schoolband-playtest/games/nangam-schoolband-v08/index.html","rawgithack"],
        ["https://snvzwrexuqavnfvzgxqj.supabase.co/functions/v1/schoolband-playtest-v02","supabase-redirect"]
      ]){try{await pageCheck(url,kind,{width:390,height:844});}
        catch(e){console.error("HOST_FAIL",kind,String(e));failures.push(kind+" "+String(e.message||e));}}
      if(failures.length)throw Error("Hosted baseline not verified: "+failures.join("; "));
    }finally{await browser.close()}
  })().catch(e=>{console.error("FAIL browser:",e.stack||String(e));process.exitCode=1});
}
