/* Class Diary maintenance UI browser smoke (synthetic tickets only).
 * No real identity codes, participants, or school records are used.
 */
'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const base=process.env.DIARY_BASE||'http://127.0.0.1:8123';
const endpoint='https://snvzwrexuqavnfvzgxqj.supabase.co/functions/v1/class-diary-guest-access-v1';

(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  for(const device of [{name:'mobile',width:390,height:844},{name:'desktop',width:1365,height:850}]){
   const page=await browser.newPage({viewport:{width:device.width,height:device.height},deviceScaleFactor:1});
   const errors=[];let apiCalls=0;
   page.on('pageerror',error=>errors.push(error.message));
   await page.route(endpoint,route=>{
    apiCalls++;
    return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'CLASS_DIARY_PREPARING'})});
   });
   await page.route('https://www.scottbuckley.com.au/**',route=>route.abort('blockedbyclient'));
   await page.goto(base+'/index.html',{waitUntil:'domcontentloaded'});
   await page.locator('#teacher-diary-feature').waitFor({state:'visible'});
   assert.equal(await page.locator('#teacher-diary-lock-title').innerText(),'준비 중');
   assert.equal(await page.locator('#homeDiaryGuestForm').count(),0,'Home must not expose guest code form');
   assert.equal(await page.locator('#homeDiaryCode').count(),0,'Home must not expose guest input');
   assert.equal(await page.locator('#homeDiarySubmit').count(),0,'Home must not expose guest start button');
   assert.equal(await page.locator('#teacher-diary-feature a[href*="guest"]').count(),0,'No guest link');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+3),true,'Home must fit horizontally');
   await page.evaluate(()=>sessionStorage.setItem('beagu-class-diary-guest-handoff-v1','v1.synthetic.synthetic'));
   await page.goto(base+'/teacher-class-diary-play.html?guest=1',{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>document.getElementById('noticeText')?.textContent?.includes('준비 중'),null,{timeout:12000});
   assert.equal(await page.locator('#notice').isVisible(),true,'Direct guest entry must show maintenance');
   assert.equal(await page.locator('#opening').isVisible(),false,'Direct guest entry must not open the game');
   assert.equal(await page.locator('#guestAccess').isVisible(),false,'Guest ticket flow must not run');
   assert.equal(await page.evaluate(()=>sessionStorage.getItem('beagu-class-diary-guest-handoff-v1')),null,
    'Previously stored handoffs must be cleared');
   assert.equal(apiCalls,0,'Game must reject guest entry before contacting guest endpoint');
   await page.goto(base+'/teacher-class-diary-play.html?demo=1',{waitUntil:'domcontentloaded'});
   await page.locator('#setup').waitFor({state:'visible',timeout:12000});
   assert.equal(await page.locator('#diarySchoolMode').inputValue(),'demo','School selection must come before character details');
   assert.equal(await page.locator('#setup').getAttribute('data-step'),'1','Direct demo must open profile instead of infographic');
   assert.equal(await page.locator('#opening').isVisible(),false,'The old infographic must be skipped');
   await page.locator('#playerName').fill('루다');
   await page.locator('#experience').selectOption('new');
   await page.locator('#gender').selectOption('woman');
   await page.locator('#mbti').selectOption('INFP');
   await page.locator('#setupNext').click();
   assert.equal(await page.locator('#setup').getAttribute('data-step'),'2','Colleague choices must be the next screen');
   assert.equal(await page.locator('[data-partner-choice]').count(),3);
   await page.goto(base+'/teacher-class-diary-play.html',{waitUntil:'domcontentloaded'});
   await page.locator('#diaryLanding').waitFor({state:'visible',timeout:12000});
   assert.equal(await page.locator('#notice').isVisible(),false,'Bare entry must not show auth failure');
   await page.locator('#diaryLandingStart').click();
   await page.locator('#setup').waitFor({state:'visible',timeout:12000});
   assert.equal(apiCalls,0,'Public fictional entry must not use the guest code endpoint');
   assert.equal(errors.length,0,'Browser errors: '+errors.join('; '));
   console.log('PASS Class Diary maintenance '+device.name+': locked home, guest URL blocked, demo intact');
   await page.close();
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1)});
