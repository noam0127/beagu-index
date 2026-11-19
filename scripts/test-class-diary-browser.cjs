/* Real browser E2E: public fictional demo only, never touches real school data. */
'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const fs=require('node:fs/promises');
const URL=process.env.DIARY_BASE||'http://127.0.0.1:8123';
(async()=>{
 await fs.mkdir('artifacts/class-diary',{recursive:true});
 const browser=await chromium.launch({headless:true});
 try{
  for(const variant of [
   {name:'desktop',width:1365,height:850,partner:'woman'},
   {name:'mobile',width:390,height:844,partner:'man'}
  ]){
   const page=await browser.newPage({viewport:{width:variant.width,height:variant.height},deviceScaleFactor:1});
   const errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('https://www.scottbuckley.com.au/**',route=>route.abort('blockedbyclient'));
   await page.goto(URL+'/teacher-class-diary-play.html?demo=1',{waitUntil:'domcontentloaded'});
   await page.locator('#setup').waitFor({state:'visible'});
   await page.locator('#age').fill('31');
   await page.locator('#gender').selectOption('undisclosed');
   await page.locator('#mbti').selectOption('INFP');
   await page.locator('#partner').selectOption(variant.partner);
   await page.locator('#profileForm button[type="submit"]').click();
   await page.locator('#novel').waitFor({state:'visible'});
   assert.equal(await page.locator('#musicBtn').getAttribute('aria-pressed'),'true','Game start enables music');
   await page.locator('#musicBtn').click(); // silence background while testing branches
   assert.equal(await page.locator('#musicBtn').getAttribute('aria-pressed'),'false');
   assert((await page.locator('#sceneBackdrop').evaluate(x=>x.style.backgroundImage)).includes('data:image/svg+xml'));
   assert((await page.locator('#scenePortrait').getAttribute('src')).startsWith('data:image/svg+xml'));
   if(variant.name==='desktop')await page.screenshot({path:'artifacts/class-diary/desktop-first-scene.png',fullPage:true});
   else await page.screenshot({path:'artifacts/class-diary/mobile-first-scene.png',fullPage:true});
   let turns=0;
   while(await page.locator('#ending').isHidden()){
    if(turns++>170)throw Error('Scene flow did not finish within 170 interactions');
    const choices=page.locator('#choiceSection .choice:visible');
    const n=await choices.count();
    if(n>0){
     await choices.first().click();
    }else{
     const next=page.locator('#nextBtn');
     if(!await next.isVisible())throw Error('No choice or next button at turn '+turns);
     await next.click();
    }
   }
   assert((await page.locator('#endingTitle').innerText()).startsWith('나의 '));
   assert((await page.locator('#endingText').innerText()).length>100);
   const state=await page.evaluate(()=>({
    stored:[...Object.keys(localStorage)].filter(k=>k.includes('diary')||k.includes('class-diary')),
    width:document.documentElement.scrollWidth,viewport:innerWidth
   }));
   assert.equal(state.stored.length,0,'No saved game state');
   assert(state.width<=state.viewport+8,'Unexpected horizontal overflow '+JSON.stringify(state));
   assert.equal(errors.length,0,'Uncaught browser errors: '+errors.join('; '));
   await page.reload({waitUntil:'domcontentloaded'});
   await page.locator('#setup').waitFor({state:'visible'});
   assert(await page.locator('#ending').isHidden(),'Reload must clear session progress');
   console.log('PASS '+variant.name+': '+turns+' clicks, ending reached, no saved progress, responsive viewport');
   await page.close();
  }
  const page=await browser.newPage();
  await page.goto(URL+'/teacher-class-diary-play.html?schoolId=DEMO001',{waitUntil:'domcontentloaded'});
  await page.locator('#notice').waitFor({state:'visible'});
  assert(await page.locator('#setup').isHidden(),'Fictional school may not bypass Level2 auth');
  await page.close();
  console.log('PASS non-demo Lv2 access gate');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
