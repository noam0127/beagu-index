/* Real Chromium regression: tap/Enter progresses one complete sentence with a waiting cursor.
 * Only the public fictional demo is used; no account or school-data access. */
'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const url=process.env.DIARY_BASE||'http://127.0.0.1:8123';
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  for(const device of [{name:'mobile',width:390,height:844},{name:'desktop',width:1365,height:850}]){
   for(const story of ['semester']){
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
    const rows=[...document.querySelectorAll('#chapterText .diary-literary-line')];
    const current=rows[0];
    const stage=document.querySelector('#sceneArt');
    const reader=document.querySelector('#vnDialogueSlot');
    return {
     total:rows.length,visible:rows.filter(row=>!row.hidden).length,
     text:current?.textContent||'',full:current?.getAttribute('aria-label')||'',
     ready:current?.classList.contains('diary-literary-ready')||false,
     cursor:!!current?.querySelector('.diary-reading-cursor'),
     cursorAnimation:current?.querySelector('.diary-reading-cursor')?getComputedStyle(current.querySelector('.diary-reading-cursor')).animationName:'',
     viewportHeight:innerHeight,viewportWidth:innerWidth,
     stageHeight:stage.getBoundingClientRect().height,
     pageWidth:reader.getBoundingClientRect().width,
     readerHeight:reader.clientHeight,readerScrollHeight:reader.scrollHeight,
     scene:document.body.classList.contains('is-literary-mode'),
     semester:document.body.classList.contains('is-semester-mode'),
     choosing:document.body.classList.contains('is-choosing'),
     portraits:document.querySelector('#scenePortrait').getBoundingClientRect().width,
     echo:document.querySelectorAll('.diary-literary-echo').length
    };
   });
   await page.waitForFunction(()=>!!document.querySelector('#chapterText p.diary-literary-ready'),null,{timeout:12000});
   const first=await sample();
   assert(first.scene,'Literary prose mode is enabled');
   assert(first.semester,'Semester story mode is enabled');
   assert.equal(first.total,1,'One complete sentence, not several lines, must be present');
   assert.equal(first.visible,1,'Only the current sentence is visible');
   assert(first.full.length>=3,'Sentence text must be nonempty');
   assert(first.cursor,'A cursor must wait after the sentence');
   assert(first.cursorAnimation.includes('diary-sentence-cursor-blink'),'Waiting cursor must blink');
   assert.equal(first.portraits,0,'Only the scene background should render without character images');
   assert.equal(first.echo,0,'No past-line echo is allowed');
   assert(first.pageWidth>first.viewportWidth*.75,'Text should occupy most of the screen width');
   assert(first.stageHeight<=first.viewportHeight+2,'Stage stays within one viewport');

   // A tap after completion replaces the sentence, not adds another visible line.
   await page.evaluate(()=>document.getElementById('sceneArt').click());
   await page.waitForFunction(previous=>{
    const row=document.querySelector('#chapterText p.diary-literary-line');
    return row&&row.getAttribute('aria-label')!==previous;
   },first.full,{timeout:5000});
   await page.waitForFunction(()=>!!document.querySelector('#chapterText p.diary-literary-ready'),null,{timeout:12000});
   const second=await sample();
   assert.equal(second.total,1,'Next tap should replace, not append, prose');
   assert.notEqual(second.full,first.full,'A new sentence must follow the first');
   assert(second.cursor,'Cursor must remain at the end of the next sentence');
   // Enter provides identical progression to tapping, including on phones.
   await page.evaluate(()=>document.activeElement?.blur());
   await page.keyboard.press('Enter');
   await page.waitForFunction(previous=>document.querySelector('#chapterText p.diary-literary-line')?.getAttribute('aria-label')!==previous,second.full,{timeout:5000});
   const third=await sample();
   assert.equal(third.total,1,'Enter must show only the next sentence');
   assert.notEqual(third.full,second.full,'Keyboard advances exactly one sentence');
   assert.equal(errors.length,0,'Uncaught browser errors: '+errors.join('; '));
   console.log('PASS literary sentence reader '+device.name+' '+story+': punctuation-sized pages, blinking cursor, tap and Enter, no portraits');
   await page.close();
   }
  }
 }finally{await browser.close()}
})().catch(err=>{console.error(err);process.exit(1)});
