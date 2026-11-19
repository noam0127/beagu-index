/* Real Chromium regression: tap/Enter accumulates complete sentences until text area is full.
 * Only the public fictional demo is used; no account or school-data access. */
'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const url=process.env.DIARY_BASE||'http://127.0.0.1:8123';
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  for(const device of [{name:'mobile',width:390,height:844},{name:'desktop',width:1365,height:850}]){
   for(const story of ['semester','week']){
   const page=await browser.newPage({viewport:{width:device.width,height:device.height}});
   const errors=[];
   page.on('pageerror',err=>errors.push(err.message));
   await page.route('https://snvzwrexuqavnfvzgxqj.supabase.co/functions/v1/arcade-leaderboard**',route=>{
    const query=new URL(route.request().url()).searchParams;
    if(query.has('schools'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
     schools:[{school_id:'A123456',school_name:'봄빛초등학교',sido_standard:'부산광역시'}]
    })});
    if(query.has('school_id'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
     school:{school_id:'A123456',school_name:'봄빛초등학교',region:'부산광역시',eligible:true,available_years:[2025]}
    })});
    throw Error('Unexpected public-school search');
   });
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
   if(story==='week'){
    // The original seven-day story remains available as the legacy opening route.
    await page.evaluate(()=>document.getElementById('openingStart').click());
   }
   await page.locator('#diarySchoolName').click();
   await page.locator('#diarySchoolQuery').fill('봄빛');
   await page.locator('.diary-school-result').first().click();
   await page.waitForFunction(()=>document.getElementById('diarySchoolMode').dataset.schoolReady==='true');
   await page.locator('#setupNext').click();
   await page.locator('[data-partner-choice="woman"]').click();
   await page.locator('#setupNext').click();
   assert.equal(await page.locator('#setup').getAttribute('data-step'),'3','One 36-chapter story uses a first-day confirmation');
   await page.locator('.setup-begin').click();
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
    const activeId=document.getElementById('outcome').hidden?'chapterText':'outcomeText';
    const rows=[...document.querySelectorAll('#'+activeId+' p.diary-literary-line')];
    const shown=rows.filter(row=>!row.hidden);
    const reader=document.querySelector('#vnDialogueSlot');
    const current=shown[shown.length-1];
    const first=shown[0];
    const lastRect=current?.getBoundingClientRect();
    const readerRect=reader.getBoundingClientRect();
    const cursor=current?.querySelector('.diary-reading-cursor');
    return {
     total:rows.length,visible:shown.length,
     sentences:shown.map(row=>row.getAttribute('aria-label')||''),
     ready:!!current?.classList.contains('diary-literary-ready'),
     allSizes:shown.map(row=>getComputedStyle(row).fontSize),
     allOpacity:shown.map(row=>getComputedStyle(row).opacity),
     cursorCount:shown.reduce((count,row)=>count+row.querySelectorAll('.diary-reading-cursor').length,0),
     cursorBlink:cursor?getComputedStyle(cursor).animationName:'',
     lastBottom:lastRect?.bottom||0,readerBottom:readerRect.bottom,
     scrollHeight:reader.scrollHeight,readerHeight:reader.clientHeight,
     width:readerRect.width,viewport:innerWidth,
     stageHeight:document.getElementById('sceneArt').getBoundingClientRect().height,
     viewportHeight:innerHeight,
     season:document.body.classList.contains('is-semester-mode'),
     literary:document.body.classList.contains('is-literary-mode'),
     choosing:document.body.classList.contains('is-choosing'),
     nextScene:!document.getElementById('nextBtn').hidden,
     echo:document.querySelectorAll('.diary-literary-echo').length
    };
   });
   const waitReady=()=>page.waitForFunction(()=>{
    const activeId=document.getElementById('outcome').hidden?'chapterText':'outcomeText';
    const rows=[...document.querySelectorAll('#'+activeId+' p.diary-literary-line:not([hidden])')];
    return rows.length>0&&rows[rows.length-1].classList.contains('diary-literary-ready');
   },null,{timeout:15000});
   try{await waitReady();}
   catch(error){
    const diag=await page.evaluate(()=>({
     status:document.querySelector('#status')?.textContent,
     error:window.__litTestError||'',
     playing:!document.querySelector('#novel')?.hidden,
     chapterHTML:document.querySelector('#chapterText')?.innerHTML.slice(0,600),
     outcomeHTML:document.querySelector('#outcomeText')?.innerHTML.slice(0,600),
     proseLines:document.querySelectorAll('#chapterText p').length,
     literary:document.body.classList.contains('is-literary-mode'),
     scriptVersion:window.BeaguClassDiaryLiterary?.VERSION
    }));
    throw Error('Initial literary page did not render: '+JSON.stringify(diag)+' | '+error.message);
   }
   const first=await sample();
   assert(first.literary,'Literary narration is enabled in both editions');
   assert.equal(first.season,story==='semester','The correct story mode is retained');
   assert.equal(first.visible,1,'Exactly one complete sentence appears initially');
   assert(first.total>=2,'The first page should contain more than one sentence');
   assert.equal(first.cursorCount,1,'Only the latest sentence retains the waiting cursor');
   assert(first.cursorBlink.includes('diary-sentence-cursor-blink'),'The waiting cursor blinks');
   assert.equal(first.echo,0,'No previous sentence may appear as an echo');
   assert(first.width>first.viewport*.75,'The prose box must use the scene width');
   assert(first.stageHeight<=first.viewportHeight+2,'The scene must stay within the viewport');

   // A single touch adds one entire sentence without changing the first.
   await page.locator('#sceneArt').click({position:{x:Math.round(device.width*.45),y:Math.round(device.height*.48)}});
   await waitReady();
   const second=await sample();
   assert.equal(second.visible,2,'One tap must append the next complete sentence');
   assert.equal(second.sentences[0],first.sentences[0],'The first sentence stays visible and unchanged');
   assert.equal(second.allSizes[0],first.allSizes[0],'Previously shown text must never shrink');
   assert(second.allSizes.every(size=>size===first.allSizes[0]),'All sentences use one font size');
   assert.equal(second.cursorCount,1,'Older sentences must not keep duplicate cursors');

   // Enter has the same one-sentence progression as tapping.
   await page.evaluate(()=>document.activeElement?.blur());
   await page.keyboard.press('Enter');
   if(second.visible<second.total){
    await waitReady();
    const third=await sample();
    assert.equal(third.visible,3,'Enter appends precisely one sentence');
    assert.deepEqual(third.sentences.slice(0,2),second.sentences,'Previous sentences remain readable');
   }
   // Continue until one page fills; then only the next interaction turns it.
   let turned=false;
   for(let n=0;n<90;n++){
    const before=await sample();
    if(before.choosing||before.nextScene){turned=true;break;}
    await page.evaluate(()=>document.getElementById('sceneArt').click());
    const after=await sample();
    if(before.visible<before.total){
     assert.equal(after.visible,before.visible+1,'Each input adds exactly one sentence');
     await waitReady();
    }else{
     assert(after.choosing||after.nextScene||after.visible===1,'A full page turns only on the next input');
     turned=true;
     break;
    }
    assert(after.lastBottom<=after.readerBottom+7,'Visible prose must remain in the text box');
    assert(after.scrollHeight<=after.readerHeight+8,'Text must not require inner scrolling');
   }
   assert(turned,'The text box should fill, then reveal a new page or choices');
   assert.equal(errors.length,0,'Uncaught browser errors: '+errors.join('; '));
   console.log('PASS sentence-fill '+device.name+' '+story+': one sentence per touch, accumulated text, capacity turn and stable font');
   await page.close();
   }
  }
 }finally{await browser.close()}
})().catch(err=>{console.error(err);process.exit(1)});
