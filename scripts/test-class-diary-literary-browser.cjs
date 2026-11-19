/* Real Chromium regression: one click/Enter reveals one stable-sized line.
 * Only the public fictional demo is used; no account or school-data access. */
'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const url=process.env.DIARY_BASE||'http://127.0.0.1:8123';
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  for(const device of [{name:'mobile',width:390,height:844},{name:'desktop',width:1365,height:850}]){
   const page=await browser.newPage({viewport:{width:device.width,height:device.height}});
   const errors=[];
   page.on('pageerror',err=>errors.push(err.message));
   await page.route('https://www.scottbuckley.com.au/**',route=>route.abort('blockedbyclient'));
   // Capture a swallowed story-start exception only inside this local test.
   await page.route('**/teacher-class-diary-play.html?guest=1',async route=>{
    const response=await route.fetch();
    let html=await response.text();
    const needle="}catch(err){status('이야기 설정을 확인하지 못했습니다. 다시 시도해 주세요.');}";
    const amended="}catch(err){window.__litTestError=err.stack||String(err);status('이야기 설정을 확인하지 못했습니다. 다시 시도해 주세요.');}";
    if(!html.includes(needle))throw Error('Expected story-start catch missing');
    html=html.replace(needle,amended);
    await route.fulfill({response,body:html});
   });
   // Simulate the signed home-entry handoff without using a real identity or code.
   await page.addInitScript(()=>{
    sessionStorage.setItem('beagu-class-diary-guest-handoff-v1','v1.fakepayload.fakesignature');
   });
   await page.route('https://snvzwrexuqavnfvzgxqj.supabase.co/functions/v1/class-diary-guest-access-v1',
    route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
     ok:true,scope:'class-diary-fictional-guest',progressToken:'p1.fake.token'
    })}));
   let revision=0;
   await page.route('https://snvzwrexuqavnfvzgxqj.supabase.co/functions/v1/class-diary-progress-v1',route=>{
    const request=JSON.parse(route.request().postData()||'{}');
    if(request.action==='load')return route.fulfill({
     status:200,contentType:'application/json',body:JSON.stringify({ok:true,progress:null})
    });
    revision++;
    return route.fulfill({status:200,contentType:'application/json',
     body:JSON.stringify({ok:true,revision,updatedAt:'2026-11-20T00:00:00Z'})});
   });
   await page.goto(url+'/teacher-class-diary-play.html?guest=1',{waitUntil:'domcontentloaded'});
   await page.locator('#diaryLanding').waitFor({state:'visible'});
   await page.locator('#diaryLandingStart').click();
   await page.locator('#diarySchoolName').fill('가상 새봄초등학교');
   await page.locator('#setupNext').click();
   await page.locator('[data-partner-choice="woman"]').click();
   await page.locator('#setupNext').click();
   await page.waitForTimeout(300);
   if(await page.locator('#novel').isHidden()){
    const state=await page.evaluate(()=>({
     setupStep:document.getElementById('setup').dataset.step,
     setupHidden:document.getElementById('setup').hidden,
     partner:document.getElementById('partner').value,
     school:document.getElementById('diarySchoolName').value,
     story:document.body.dataset.diaryStory,
     status:document.getElementById('status').textContent,
     error:window.__litTestError||'',
     selected:document.querySelector('[data-partner-choice="woman"]').getAttribute('aria-pressed')
    }));
    throw Error('Line reader setup never opened the story: '+JSON.stringify(state)+' errors='+errors.join('; '));
   }
   await page.locator('#novel').waitFor({state:'visible',timeout:5000});
   const sample=()=>page.evaluate(()=>{
    const rows=[...document.querySelectorAll('#chapterText .diary-literary-line')];
    const shown=rows.filter(r=>!r.hidden);
    const stage=document.querySelector('#sceneArt');
    const reader=document.querySelector('#vnDialogueSlot');
    const body=document.body;
    const first=shown[0];
    return {
     total:rows.length,visible:shown.length,
     lines:shown.map(r=>r.textContent),
     sizes:shown.map(r=>getComputedStyle(r).fontSize),
     opacity:shown.map(r=>getComputedStyle(r).opacity),
     echo:document.querySelectorAll('.diary-literary-echo').length,
     viewportHeight:innerHeight,viewportWidth:innerWidth,
     stageHeight:stage.getBoundingClientRect().height,
     pageWidth:reader.getBoundingClientRect().width,
     readerHeight:reader.clientHeight,
     readerScrollHeight:reader.scrollHeight,
     scene:body.classList.contains('is-semester-mode'),
     pageIndex:document.querySelector('#chapterDay').textContent
    };
   });
   const first=await sample();
   assert(first.scene,'36-episode literary mode must be on');
   assert.equal(first.visible,1,'Exactly the first line should be visible initially');
   assert(first.total>=5,'The first page must offer several lines to read');
   assert.equal(first.echo,0,'There must be no previous-text echo');
   assert(first.pageWidth>first.viewportWidth*.75,'Prose must occupy most of the screen width');
   assert(first.stageHeight<=first.viewportHeight+2,'Stage must fit the viewport');
   const touchPoint={x:Math.round(device.width*.47),y:Math.round(device.height*.52)};
   await page.locator('#sceneArt').click({position:touchPoint});
   const second=await sample();
   assert.equal(second.visible,2,'A touch adds exactly one line');
   assert.equal(second.lines[0],first.lines[0],'Previous lines remain unchanged');
   assert.equal(second.sizes[0],first.sizes[0],'Previous lines cannot shrink');
   await page.evaluate(()=>document.activeElement?.blur());
   await page.keyboard.press('Enter');
   const third=await sample();
   assert.equal(third.visible,3,'Enter reveals exactly one more line');
   assert(third.sizes.every(size=>size===first.sizes[0]),'Every displayed line has the same font size');
   let tapped=0,sawFullPage=false;
   while(tapped++<70){
    const before=await sample();
    await page.evaluate(()=>document.getElementById('sceneArt').click());
    const after=await sample();
    if(after.visible===1&&before.visible>1){sawFullPage=true;break;}
    assert(after.visible===before.visible+1,'Each input must advance one line, then clear on page turn');
    assert(after.readerScrollHeight<=after.readerHeight+7,'Text must fit without inner scrolling');
   }
   assert(sawFullPage,'A full page should be replaced by the first line of the next page');
   assert.equal(errors.length,0,'Uncaught browser errors: '+errors.join('; '));
   console.log('PASS literary line-by-line '+device.name+': no echoes, stable typography, touch/Enter, full-width and no scroll');
   await page.close();
  }
 }finally{await browser.close()}
})().catch(err=>{console.error(err);process.exit(1)});
