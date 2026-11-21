'use strict';
/* Offline-only visual QA: verify the review map against production's existing engine. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const engine=require('../js/class-diary-male-natural-v2.js');
const base=process.env.DIARY_QA_BASE||'http://127.0.0.1:8127';
const out=path.resolve('artifacts/class-diary-cutout-QA');
fs.mkdirSync(out,{recursive:true});
(async()=>{
const browser=await chromium.launch({headless:true});
try{
for(const screen of [{name:'mobile-320',width:320,height:720},{name:'mobile-390',width:390,height:844},{name:'desktop-1365',width:1365,height:850}]){
 const page=await browser.newPage({viewport:{width:screen.width,height:screen.height},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/preview.html',{waitUntil:'domcontentloaded'});
 assert.equal(await page.locator('#actorPick option').count(),4);
 assert.equal(await page.locator('#chapterPick option').count(),36);
 for(const [person,id] of [['hyunwoo','man'],['dogyeom','man2'],['taeo','man3']]){
  await page.selectOption('#actorPick',person);await page.selectOption('#responsePick','no');
  for(let chapter=1;chapter<=36;chapter++){
   await page.selectOption('#chapterPick',String(chapter));
   assert.equal(Number(await page.inputValue('#posePick')),engine.poseIndex(id,chapter,false,null),person+' chapter '+chapter);
  }
  for(const response of ['1','2','3']){
   await page.selectOption('#responsePick',response);
   assert.equal(Number(await page.inputValue('#posePick')),engine.poseIndex(id,36,true,response),person+' response '+response);
  }
 }
 await page.selectOption('#responsePick','no');
 for(const [person,chapter,pose] of [['hyunwoo','1','neutral'],['dogyeom','3','string-game'],['taeo','6','volleyball'],['jiyoon','36','neutral_existing']]){
  await page.selectOption('#actorPick',person);await page.selectOption('#chapterPick',chapter);
  await page.waitForFunction(()=>{const el=document.getElementById('cutoutActor');return el.complete&&el.naturalWidth>0});
  assert.equal(await page.locator('#cutoutActor').getAttribute('src'),person+'/'+pose+'.webp');
  const state=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,stage:document.getElementById('candidateStage').getBoundingClientRect().width,cutout:document.getElementById('cutoutActor').getBoundingClientRect().width}));
  assert(state.scrollWidth<=state.width+2,'overflow '+JSON.stringify({person,screen,state}));
  assert(state.stage>200&&state.cutout>100,'images too small '+person);
 }
 await page.selectOption('#actorPick','dogyeom');await page.selectOption('#chapterPick','3');
 await page.selectOption('#backPick','alpha');await page.selectOption('#zoomPick','1.2');
 assert.equal(await page.locator('#cutoutActor').evaluate(el=>el.style.transform),'translateX(-50%) scale(1.2)','manual cutout zoom');
 const centers=await page.evaluate(()=>{const portrait=document.getElementById('cutoutActor').getBoundingClientRect(),stage=document.getElementById('candidateStage').getBoundingClientRect();return {portrait:(portrait.left+portrait.right)/2,stage:(stage.left+stage.right)/2}});
 assert(Math.abs(centers.portrait-centers.stage)<=2,'enlarged portrait drifts off center: '+JSON.stringify(centers));
 await page.locator('#screenPick').click();
 assert.equal(await page.locator('#screenPick').getAttribute('aria-pressed'),'true');
 await page.locator('#reviewNote').fill('QA: string and finger edges');
 await page.screenshot({path:path.join(out,screen.name+'-dogyeom.png'),fullPage:true});
 await page.selectOption('#actorPick','hyunwoo');await page.selectOption('#chapterPick','1');
 await page.selectOption('#backPick','dark');
 await page.screenshot({path:path.join(out,screen.name+'-hyunwoo.png'),fullPage:true});
 assert.deepEqual(errors,[],'browser page errors');
 console.log('PASS '+screen.name+': 36-episode mapping, transparent image load, viewports');
 await page.close();
}
}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});