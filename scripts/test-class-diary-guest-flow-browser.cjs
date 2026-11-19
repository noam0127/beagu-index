/* Mocked browser UX only: do not use issued codes, real accounts or school data.
 * The live edge signature/rate limits are independently tested by guest-smoke.
 */
'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const base=process.env.DIARY_BASE||'http://127.0.0.1:8123';
const api='https://snvzwrexuqavnfvzgxqj.supabase.co/functions/v1/class-diary-guest-access-v1';
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  for(const device of [{name:'mobile',width:390,height:844},{name:'desktop',width:1365,height:850}]){
   const page=await browser.newPage({viewport:{width:device.width,height:device.height},deviceScaleFactor:1});
   const errors=[];let codeCheck=0,ticketCheck=0;
   page.on('pageerror',error=>errors.push(error.message));
   await page.route(api,route=>{
    const body=JSON.parse(route.request().postData()||'{}');
    if(body.action==='verify-code'){
     codeCheck++;assert.equal(body.code,'AAAAAAAAAA','Only synthetic test code may be used');
     return route.fulfill({status:200,contentType:'application/json',
      body:JSON.stringify({ok:true,scope:'class-diary-fictional-guest',ticket:'v1.fakepayload.fakesignature'})});
    }
    if(body.action==='verify-ticket'){
     ticketCheck++;assert.equal(body.ticket,'v1.fakepayload.fakesignature');
     return route.fulfill({status:200,contentType:'application/json',
      body:JSON.stringify({ok:true,scope:'class-diary-fictional-guest'})});
    }
    throw Error('Unexpected guest API action');
   });
   await page.route('https://www.scottbuckley.com.au/**',route=>route.abort('blockedbyclient'));
   await page.goto(base+'/index.html',{waitUntil:'domcontentloaded'});
   await page.locator('#homeDiaryGuestForm').waitFor({state:'visible'});
   assert.equal(await page.locator('#homeDiaryCode').count(),1);
   assert.equal(await page.locator('#teacher-diary-feature .teacher-diary-code-message').count(),1);
   await page.locator('#homeDiaryCode').fill('AAAAAAAAAA');
   await page.locator('#homeDiarySubmit').click();
   await page.waitForURL('**/teacher-class-diary-play.html?guest=1',{timeout:12000});
   await page.locator('#opening').waitFor({state:'visible'});
   assert.equal(codeCheck,1,'Code should be verified exactly once, on home');
   assert.equal(ticketCheck,1,'Ticket should be validated on game arrival');
   assert.equal(await page.locator('#guestCode').count(),0,'No duplicate code field in game');
   assert.equal(await page.evaluate(()=>sessionStorage.getItem('beagu-class-diary-guest-handoff-v1')),null,
    'Ticket must be consumed before the story appears');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+3),true,'Opening must not scroll');
   await page.locator('.diary-opening-visual').click();
   await page.locator('#setup').waitFor({state:'visible'});
   assert.equal(await page.locator('#setup').getAttribute('data-step'),'1');
   assert.equal(await page.locator('#playerName').isVisible(),false,'Guest cannot be asked to enter a name');
   assert.equal(await page.locator('#mbti').isVisible(),false,'Guest cannot be asked to choose MBTI');
   assert.equal(await page.locator('#experience').isVisible(),false,'Guest cannot be asked for career data');
   assert.equal(await page.locator('#setupPlayerPreview').innerText(),'새봄 선생님');
   assert.equal(await page.locator('#setup').evaluate(el=>el.querySelector('.form-grid').compareDocumentPosition(el.querySelector('.setup-player-stamp'))&Node.DOCUMENT_POSITION_FOLLOWING),4,'Pencil preview must be after form');
   await page.locator('.guest-setup-poem').click();
   assert.equal(await page.locator('#setup').getAttribute('data-step'),'2');
   assert.equal(await page.locator('#partner').isVisible(),false,'No redundant dropdown below portraits');
   assert.equal(await page.locator('[data-partner-choice]').count(),3);
   await page.locator('[data-partner-choice="none"]').click();
   assert.equal(await page.locator('#setup').getAttribute('data-step'),'3','Picture selection should advance directly');
   assert((await page.locator('#setupReviewPartner').innerText()).includes('민서'));
   await page.locator('#setupReviewPartner').click();
   await page.locator('#novel').waitFor({state:'visible'});
   const state=await page.evaluate(()=>({
    scrollHeight:document.documentElement.scrollHeight,
    viewport:innerHeight,scrollWidth:document.documentElement.scrollWidth,
    width:innerWidth,btn:document.getElementById('musicBtn').getAttribute('aria-pressed'),
    saved:[...Object.keys(localStorage)].filter(k=>k.includes('class-diary')||k.includes('diary'))
   }));
   assert(state.scrollHeight<=state.viewport+3,'Game must fit one viewport: '+JSON.stringify(state));
   assert(state.scrollWidth<=state.width+3,'Game must not overflow horizontally');
   assert.equal(state.btn,'true','Music should be enabled by default');
   assert.equal(state.saved.length,0,'Guest story cannot save player progress');
   assert.equal(await page.locator('.sound-panel').isVisible(),false,'Music controls should not clutter the page');
   assert.equal(await page.locator('#vnSound').isVisible(),false,'Music toggle must live inside settings only');
   assert.equal(await page.locator('#diarySettings').isVisible(),true);
   await page.locator('#diarySettings').click();
   assert.equal(await page.locator('#diaryMusicVolume').isVisible(),true,'Volume slider must live in settings');
   assert.equal(await page.locator('#diaryEffectsVolume').isVisible(),true);
   await page.locator('.diary-panel-close').click();
   assert.equal(errors.length,0,'Browser errors: '+errors.join('; '));
   console.log('PASS mocked guest '+device.name+': home code, secure ticket handoff, no re-entry, picture choice, fullscreen, music in settings');
   await page.close();
  }
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exit(1)});
