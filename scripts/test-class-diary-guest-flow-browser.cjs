/* Mocked browser UX only: do not use issued codes, real accounts or school data.
 * The live edge signature/rate limits are independently tested by guest-smoke.
 */
'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const base=process.env.DIARY_BASE||'http://127.0.0.1:8123';
const api='https://snvzwrexuqavnfvzgxqj.supabase.co/functions/v1/class-diary-guest-access-v1';
const progressApi='https://snvzwrexuqavnfvzgxqj.supabase.co/functions/v1/class-diary-progress-v1';
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  for(const device of [{name:'mobile',width:390,height:844},{name:'desktop',width:1365,height:850}]){
   const page=await browser.newPage({viewport:{width:device.width,height:device.height},deviceScaleFactor:1});
   const errors=[];let codeCheck=0,ticketCheck=0,revision=0,latestCheckpoint=null;
   page.on('pageerror',error=>errors.push(error.stack||error.message));
   await page.route(api,route=>{
    const body=JSON.parse(route.request().postData()||'{}');
    if(body.action==='verify-code'){
     codeCheck++;assert.equal(body.code,'1234','Only synthetic test code may be used');
     return route.fulfill({status:200,contentType:'application/json',
      body:JSON.stringify({ok:true,scope:'class-diary-fictional-guest',ticket:'v1.fakepayload.fakesignature'})});
    }
    if(body.action==='verify-ticket'){
     ticketCheck++;assert.equal(body.ticket,'v1.fakepayload.fakesignature');
     return route.fulfill({status:200,contentType:'application/json',
      body:JSON.stringify({ok:true,scope:'class-diary-fictional-guest',progressToken:'p1.abc.xyz'})});
    }
    throw Error('Unexpected guest API action');
   });
   await page.route(progressApi,route=>{
    const body=JSON.parse(route.request().postData()||'{}');
    assert.equal(body.token,'p1.abc.xyz','Use only the synthetic progress token');
    if(body.action==='load')return route.fulfill({status:200,contentType:'application/json',
      body:JSON.stringify({ok:true,progress:latestCheckpoint?{revision,state:latestCheckpoint}:null})});
    if(body.action==='save'){
     assert.equal(body.expectedRevision,revision,'Save revisions must advance sequentially');
     revision++;latestCheckpoint=body.state;
     return route.fulfill({status:200,contentType:'application/json',
      body:JSON.stringify({ok:true,revision,updatedAt:'2026-11-20T00:00:00Z'})});
    }
    throw Error('Unexpected progress action');
   });
   await page.route('https://www.scottbuckley.com.au/**',route=>route.abort('blockedbyclient'));
   await page.goto(base+'/index.html',{waitUntil:'domcontentloaded'});
   await page.locator('#homeDiaryGuestForm').waitFor({state:'visible'});
   assert.equal(await page.locator('#homeDiaryCode').count(),1);
   assert.equal(await page.locator('#teacher-diary-feature .teacher-diary-code-message').count(),1);
   await page.locator('#homeDiaryCode').fill('1234');
   await page.locator('#homeDiarySubmit').click();
   await page.waitForURL('**/teacher-class-diary-play.html?guest=1',{timeout:12000});
   await page.locator('#diaryLanding').waitFor({state:'visible'});
   assert.equal(codeCheck,1,'Code should be verified exactly once, on home');
   assert.equal(ticketCheck,1,'Ticket should be validated on game arrival');
   assert.equal(await page.locator('#guestCode').count(),0,'No duplicate code field in game');
   assert.equal(await page.evaluate(()=>sessionStorage.getItem('beagu-class-diary-guest-handoff-v1')),null,
    'Ticket must be consumed before the story appears');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+3),true,'Title card must fit viewport');
   assert.equal(await page.locator('#opening').isVisible(),false,'Skip the separate infographic');
   assert.equal(await page.locator('.diary-landing-verse').isVisible(),true,'Poetic introduction under the title');
   await page.locator('#diaryLandingStart').click();
   await page.locator('#setup').waitFor({state:'visible'});
   assert.equal(await page.locator('#setup').getAttribute('data-step'),'1');
   assert.equal(await page.locator('#diarySchoolMode').isVisible(),true,'First setup shows school choice');
   assert.equal(await page.locator('#diarySchoolMode').inputValue(),'demo','Guest code defaults to fictional prologue');
   for(const selector of ['#playerName','#experience','#gender','#mbti'])
    assert.equal(await page.locator(selector).isVisible(),false,'No personal questionnaire: '+selector);
   await page.locator('#setupNext').click();
   assert.equal(await page.locator('#setup').getAttribute('data-step'),'2','Colleague choice follows school');
   assert.equal(await page.locator('#partner').isVisible(),false,'No redundant dropdown below portraits');
   assert.equal(await page.locator('[data-partner-choice]').count(),3);
   await page.locator('[data-partner-choice="none"]').click();
   assert.equal(await page.locator('#setup').getAttribute('data-step'),'2','Photo selects without skipping the first-day action');
   assert.equal(await page.locator('#partner').inputValue(),'none');
   assert.equal(await page.locator('#setupNext').isVisible(),true,'Bottom first-day action remains visible');
   await page.locator('#setupNext').click();
   await page.locator('#novel').waitFor({state:'visible'});
   const state=await page.evaluate(()=>({
    scrollHeight:document.documentElement.scrollHeight,
    viewport:innerHeight,scrollWidth:document.documentElement.scrollWidth,
    width:innerWidth,btn:document.getElementById('musicBtn').getAttribute('aria-pressed'),
    saved:[...Object.keys(localStorage)].filter(k=>k.includes('class-diary')||k.includes('diary'))
   }));
   assert.equal(await page.locator('#diarySaveNow').isVisible(),true,'In-game manual save button should be visible');
   assert.equal(await page.locator('#diaryContinueNow').isVisible(),true,'In-game continue button should be visible');
   await page.locator('#diarySaveNow').click();
   await page.waitForFunction(()=>document.querySelector('#vnSaveNotice')?.textContent?.includes('저장 완료'),null,{timeout:5000});
   assert(latestCheckpoint&&latestCheckpoint.version==='class-diary-semester/v1','Manual save must reach the mock progress API');
   page.once('dialog',dialog=>dialog.accept());
   await page.locator('#diaryContinueNow').click();
   await page.waitForFunction(()=>document.querySelector('#vnSaveNotice')?.textContent?.includes('이전 기록 확인됨'),null,{timeout:5000});
   assert.equal(await page.locator('#novel').isVisible(),true,'Saved story should resume in the game viewport');
   assert(state.scrollHeight<=state.viewport+3,'Game must fit one viewport: '+JSON.stringify(state));
   assert(state.scrollWidth<=state.width+3,'Game must not overflow horizontally');
   assert.equal(state.btn,'true','Music should be enabled by default');
   assert.equal(state.saved.length,0,'Guest story cannot save player progress');
   assert.equal(await page.locator('.sound-panel').isVisible(),false,'Music controls should not clutter the page');
   assert.equal(await page.locator('#vnSound').isVisible(),false,'Music toggle must live inside settings only');
   await page.locator('#diaryHudFold').click();
   assert.equal(await page.locator('#diarySettings').isVisible(),true);
   await page.locator('#diarySettings').click();
   assert.equal(await page.locator('#diaryMusicVolume').isVisible(),true,'Volume slider must live in settings');
   assert.equal(await page.locator('#diaryEffectsVolume').isVisible(),true);
   await page.locator('.diary-panel-close').click();
   assert.equal(errors.length,0,'Browser errors: '+errors.join('; '));
   console.log('PASS mocked guest '+device.name+': home code → title → school → colleague → story, saved progress and settings');
   await page.close();
  }
  const legacy=await browser.newPage({viewport:{width:390,height:844}});
  let earlyWorldCalls=0;
  await legacy.route('https://snvzwrexuqavnfvzgxqj.supabase.co/functions/v1/class-diary-world-v1',route=>{
   earlyWorldCalls++;return route.abort('blockedbyclient');
  });
  await legacy.goto(base+'/teacher-class-diary-play.html?schoolId=A123456',{waitUntil:'domcontentloaded'});
  await legacy.locator('#diaryLanding').waitFor({state:'visible'});
  assert.equal(earlyWorldCalls,0,'Initial title must not request school data');
  assert.equal(await legacy.locator('#notice').isVisible(),false,'No preselection school error');
  await legacy.locator('#diaryLandingStart').click();
  await legacy.locator('#setup').waitFor({state:'visible'});
  assert.equal(await legacy.locator('#diarySchoolMode').isVisible(),true);
  await legacy.close();
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exit(1)});
