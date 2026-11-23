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
   // Mock public school-directory calls only; the private world API remains untouched.
   let privateWorldCalls=0;
   await page.route('https://snvzwrexuqavnfvzgxqj.supabase.co/functions/v1/class-diary-world-v1',route=>{
    privateWorldCalls++;return route.abort('blockedbyclient');
   });
   await page.route('https://snvzwrexuqavnfvzgxqj.supabase.co/functions/v1/arcade-leaderboard**',route=>{
    const query=new URL(route.request().url()).searchParams;
    if(query.has('schools'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
     schools:[{school_id:'A123456',school_name:'봄빛초등학교',sido_standard:'부산광역시'}]
    })});
    if(query.has('school_id'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
     school:{school_id:'A123456',school_name:'봄빛초등학교',region:'부산광역시',eligible:true,available_years:[2025]}
    })});
    // The home page also reads game leaderboards; stub those harmless GETs.
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({entries:[],top:[],leaderboard:[]})});
   });
   await page.route('https://www.scottbuckley.com.au/**',route=>route.abort('blockedbyclient'));
   await page.goto(base+'/index.html',{waitUntil:'domcontentloaded'});
   const homeProbe=await page.evaluate(()=>{
    const form=document.getElementById('homeDiaryGuestForm');
    const game=document.getElementById('teacher-diary-feature');
    const parents=[];let el=form;
    while(el&&parents.length<7){
     const style=getComputedStyle(el),bounds=el.getBoundingClientRect();
     parents.push({tag:el.tagName,id:el.id,display:style.display,visibility:style.visibility,opacity:style.opacity,width:bounds.width,height:bounds.height,hidden:el.hidden});
     el=el.parentElement;
    }
    return {url:location.href,documentTitle:document.title,formExists:!!form,sectionExists:!!game,parents,firstText:document.body?.innerText?.slice(0,280)};
   });
   console.log('DIARY_HOME_PROBE',JSON.stringify(homeProbe));
   await page.locator('.teacher-diary-private-preview summary').click();
   await page.locator('#homeDiaryGuestForm').waitFor({state:'visible',timeout:4500});
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
   assert.equal((await page.locator('.diary-landing-verse').innerText()).replace(/\s+/g,''),'낯선교실에첫발을내딛던날.봄에서여름까지,하나의이야기가시작된다.','Title card text must match regardless of line wrapping');
   assert.equal(await page.locator('#diarySchoolName').isVisible(),true,'School text field must be visible');
   assert.equal(await page.locator('.diary-school-flow').count(),0,'No prologue-to-school illustration');
   assert.equal(await page.locator('.diary-school-intro').isVisible(),true,'New school-intro appears');
   assert.equal(await page.locator('.diary-school-input-wrap').isVisible(),true,'School search control is directly visible');
   assert.equal(await page.locator('.diary-school-narrative').isVisible(),true,'Disclosure remains readable');
   assert.equal(await page.locator('#diarySchoolMode').isVisible(),false,'Mode dropdown must be hidden');
   for(const selector of ['#playerName','#experience','#gender','#mbti'])
    assert.equal(await page.locator(selector).isVisible(),false,'No personal questionnaire: '+selector);
   assert.equal(await page.locator('#diarySchoolName').getAttribute('readonly'),'','School name comes from public directory');
   assert.equal(await page.locator('#semesterStart').isVisible(),false,'No second game choice');
   assert.equal(await page.locator('#openingStart').isVisible(),false,'No 7-day trial choice');
   await page.locator('#setupNext').click();
   assert.equal(await page.locator('#setup').getAttribute('data-step'),'1','School selection required');
   await page.locator('#diarySchoolSearchDialog').waitFor({state:'visible'});
   await page.locator('#diarySchoolQuery').fill('봄빛');
   await page.locator('.diary-school-result').first().click();
   await page.waitForFunction(()=>document.getElementById('diarySchoolMode').dataset.schoolReady==='true');
   assert.equal(await page.locator('#diarySchoolName').inputValue(),'봄빛초등학교');
   assert((await page.locator('#diarySchoolSelected').innerText()).includes('2025'));
   await page.locator('#setupNext').click();
   assert.equal(await page.locator('#setup').getAttribute('data-step'),'2','Colleague choice follows verified public school');
   assert.equal(await page.locator('#schoolLine').textContent(),'봄빛초등학교 · 부산광역시 · 과거 공개 조사 2025년');
   assert.equal(privateWorldCalls,0,'Private Level2 school API must never be called by owner preview');
   assert.equal(await page.locator('#partner').isVisible(),false,'No redundant dropdown below portraits');
   assert.equal(await page.locator('[data-partner-choice]').count(),5,'Current 36-episode cast has five selectable colleagues');
   assert.equal(await page.locator('.setup-character-hobby').count(),5,'Five hobby labels are shown');
   assert.equal((await page.locator('.setup-section-title strong').filter({hasText:'알고 싶은 사람 고르기'}).count()),1,'Updated title is visible');
   const hobbies=await page.locator('.setup-character-hobby').allTextContents();
   assert.deepEqual(hobbies.map(x=>x.split(' · ')[0]),['기타','논어','기록','실뜨기','배구']);

   await page.waitForFunction(()=>document.getElementById('setup').classList.contains('has-distinct-cast-v5'),
    null,{timeout:8000});
   const portraits=await page.locator('.setup-portrait-grid').evaluate(grid=>{
    return ['.jiyoon','.hyunwoo','.minseo','.dogyeom','.taeo'].map(selector=>{
     const element=grid.querySelector('.setup-character-art'+selector);
     const style=getComputedStyle(element),rect=element.getBoundingClientRect();
     return {selector,image:style.backgroundImage,ratio:rect.width/rect.height,
      backgroundSize:style.backgroundSize,position:style.backgroundPosition,
      imageHidden:getComputedStyle(element.querySelector('img')).visibility==='hidden'};
    });
   });
   const regularPortraits=portraits.filter(p=>p.selector!=='.hyunwoo');
   const hyunwooPortrait=portraits.find(p=>p.selector==='.hyunwoo');
   const shortPortraits=portraits.map(p=>({
    ...p,image:p.image.startsWith('url("data:')?'inline WebP image':p.image
   }));
   assert(portraits.length===5&&regularPortraits.every(p=>
     p.image.includes('class-diary-cast-hobbies-v6.webp')&&p.imageHidden),
     'Four other colleagues retain their individual hobbies portraits: '+JSON.stringify(shortPortraits));
   assert(hyunwooPortrait?.image.startsWith('url("data:image/webp;base64,')&&hyunwooPortrait.imageHidden,
     'Hyunwoo retains the approved Kian84 hairstyle image: '+JSON.stringify(shortPortraits));
   const frameRatio=portraits[0]?.ratio;
   assert(frameRatio>=.76&&frameRatio<=1.06&&
     portraits.every(p=>Math.abs(p.ratio-frameRatio)<.08)&&
     regularPortraits.every(p=>p.backgroundSize.includes('500%'))&&
     hyunwooPortrait.backgroundSize.includes('400%'),
     'The five photo frames must share the same aspect ratio on mobile and desktop: '+JSON.stringify(shortPortraits));
   assert(new Set(regularPortraits.map(p=>p.position)).size===4,
     'Unchanged cast retain unique crop positions: '+JSON.stringify(shortPortraits));
   const castLayout=await page.locator('.setup-portrait-grid').evaluate(grid=>{
    const cards=[...grid.querySelectorAll('[data-partner-choice]')].map(el=>{
     const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};
    });
    return {cards,viewport:{w:innerWidth,h:innerHeight},scrollWidth:document.documentElement.scrollWidth};
   });
   assert(castLayout.cards.every(r=>r.left>=-1&&r.right<=castLayout.viewport.w+1&&r.bottom<=castLayout.viewport.h+2),
     'All five cast portraits must fit the width and height of the screen: '+JSON.stringify(castLayout));

   await page.locator('[data-partner-choice="none"]').click();
   assert.equal(await page.locator('#setup').getAttribute('data-step'),'2','Photo selects without skipping the first-day action');
   assert.equal(await page.locator('#partner').inputValue(),'none');
   assert.equal(await page.locator('#setupNext').isVisible(),true,'Bottom first-day action remains visible');
   await page.locator('#setupNext').click();
   assert.equal(await page.locator('#setup').getAttribute('data-step'),'3','Supporting teachers receive their own page');
   assert.equal(await page.locator('[data-setup-screen="3"]').isVisible(),true);
   assert.equal(await page.locator('[data-setup-screen="2"]').isVisible(),false);
   assert.equal(await page.locator('[data-setup-screen="3"] .setup-supporting-person').count(),6);
   assert.equal(await page.locator('#setupNext').isVisible(),true);
   assert.equal(await page.locator('.diary-paper-turn-sheet').count(),1,'Forward page-turn effect must run');
   await page.locator('#setupBack').click();
   assert.equal(await page.locator('#setup').getAttribute('data-step'),'2','Back page-turn returns to character choice');
   assert.equal(await page.locator('#partner').inputValue(),'none','Chosen colleague survives back navigation');
   await page.locator('#setupNext').click();
   await page.locator('#setupNext').click();
   assert.equal(await page.locator('#setup').getAttribute('data-step'),'4','Final review is the fourth page');
   assert.equal(await page.locator('#setupReviewSchool').innerText(),'봄빛초등학교','Chosen school is reviewed');
   assert.equal(await page.locator('#setupReviewPartner').innerText(),'윤민서','Chosen colleague is reviewed');
   assert.equal(await page.locator('#setupNext').isVisible(),false,'No duplicate next action on final review');
   assert.equal(await page.locator('.setup-begin').isVisible(),true,'Fourth page contains start action');
   await page.locator('.setup-begin').click();
   await page.locator('#novel').waitFor({state:'visible'});
   // The current five-colleague story opens with a school fact card and a
   // colleague-narrated prologue before the player's Chapter 1.
   await page.locator('#diaryPrologueSchool').waitFor({state:'visible'});
   await page.locator('#diaryPrologueSchoolContinue').click();
   await page.waitForFunction(()=>!!document.querySelector('#outcomeText p.diary-literary-line'),null,{timeout:5000});
   await page.evaluate(()=>{
    const more=document.getElementById('vnMore'),next=document.getElementById('nextBtn');
    for(let i=0;i<1100&&next.hidden;i++){if(more.hidden)break;more.click();}
   });
   await page.waitForFunction(()=>!document.getElementById('nextBtn').hidden,null,{timeout:15000});
   // The full-screen novel uses tap-to-advance; the old nextBtn is intentionally
   // visually hidden. A scene tap invokes the same handler without testing an
   // obsolete visible-arrow control.
   await page.locator('#sceneArt').evaluate(node=>node.click());
   await page.locator('#playerSetup').waitFor({state:'visible'});
   await page.locator('#heroName').fill('새봄');
   await page.locator('#playerSetupForm button[type="submit"]').click();
   await page.locator('#novel').waitFor({state:'visible'});
   assert.equal(await page.locator('#scenePortrait').isVisible(),false,'Story scenes remain background-only without character portraits');
   assert.equal(await page.locator('#sceneGuest').isVisible(),false,'Guest characters are not pictured yet');
   // Story-stage student art can appear by scene; the profile-card task must not override it.
   assert.equal(await page.locator('#chapterText p.diary-literary-line:not([hidden])').count(),1,
    'Exactly one sentence is initially revealed; later sentences remain hidden');
   await page.waitForFunction(()=>Boolean(document.querySelector('#chapterText p.diary-literary-ready:not([hidden])')),null,{timeout:12000});
   const firstSentence=await page.locator('#chapterText p.diary-literary-line:not([hidden])').first().getAttribute('aria-label');
   assert(firstSentence&&firstSentence.length>3,'Sentence text should appear fully');
   assert.equal(await page.locator('#chapterText p.diary-literary-line:not([hidden]) .diary-reading-cursor').count(),1,
    'Only the current revealed sentence has a waiting cursor');
   await page.locator('#sceneArt').evaluate(node=>node.click());
   await page.waitForFunction(first=>{
    const visible=[...document.querySelectorAll('#chapterText p.diary-literary-line:not([hidden])')];
    return visible.length===2&&visible[0].getAttribute('aria-label')===first;
   },firstSentence,{timeout:5000});
   const state=await page.evaluate(()=>({
    scrollHeight:document.documentElement.scrollHeight,
    viewport:innerHeight,scrollWidth:document.documentElement.scrollWidth,
    width:innerWidth,btn:document.getElementById('musicBtn').getAttribute('aria-pressed'),
    saved:[...Object.keys(localStorage)].filter(k=>k.includes('class-diary')||k.includes('diary'))
   }));
   const geometry=await page.evaluate(()=>{
    const box=selector=>{const el=document.querySelector(selector);if(!el)return null;
      const r=el.getBoundingClientRect();return {x:r.x,y:r.y,left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
    const date=box('#diarySceneDate'),home=box('#diaryHomeReturn'),menu=box('#diaryHudFold');
    const footer=box('#vnBottom .vn-control-row'),stage=box('#vnBottom');
    const prose=box('#vnDialogueSlot .prose');
    const visibleArrow=['vnMore','nextBtn'].map(id=>document.getElementById(id)).find(el=>!el.hidden&&getComputedStyle(el).display!=='none');
    const arrow=visibleArrow?box('#'+visibleArrow.id):null;
    const intersect=(a,b)=>a&&b&&Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))>1&&Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top))>1;
    return {date,home,menu,footer,stage,prose,arrow,dateHomeOverlap:intersect(date,home),homeMenuOverlap:intersect(home,menu),viewport:{width:innerWidth,height:innerHeight}};
   });
   assert(geometry.home&&geometry.menu&&geometry.date&&!geometry.dateHomeOverlap&&!geometry.homeMenuOverlap,
     'Header date, home and menu must not collide: '+JSON.stringify(geometry));
   assert(geometry.footer&&geometry.stage&&geometry.footer.right<=geometry.viewport.width+2&&geometry.footer.bottom<=geometry.viewport.height+2,
     'Footer must remain inside the viewport: '+JSON.stringify(geometry));
   assert(geometry.arrow&&geometry.arrow.bottom<=geometry.viewport.height+2,
     'Animated next-page arrow must stay within the visible game footer: '+JSON.stringify(geometry));
   assert(geometry.prose&&geometry.prose.width<=860,'Reader line length must remain bounded');
   assert.equal(await page.locator('#diarySaveNow').isVisible(),true,'In-game manual save button should be visible');
   assert.equal(await page.locator('#diaryContinueNow').isVisible(),true,'In-game continue button should be visible');
   await page.locator('#diarySaveNow').click();
   await page.waitForFunction(()=>document.querySelector('#vnSaveNotice')?.textContent?.includes('저장 완료'),null,{timeout:5000});
   assert(latestCheckpoint&&latestCheckpoint.version==='class-diary-semester/v1','Manual save must reach the mock progress API');
   assert.equal(latestCheckpoint.schoolName,'봄빛초등학교');
   assert.deepEqual(latestCheckpoint.schoolContext,{schoolId:'A123456',region:'부산광역시',publishedYears:[2025]});
   assert((await page.locator('#chapterSource').innerText()).includes('2025'));
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
   await page.waitForFunction(()=>Boolean(document.getElementById('novelCard').style.getPropertyValue('--diary-open-reader-top')),null,{timeout:5000});
   const expanded=await page.evaluate(()=>{
    const a=document.getElementById('vnHeaderSlot').getBoundingClientRect();
    const b=document.getElementById('vnBottom').getBoundingClientRect();
    return {headingTop:a.top,headingBottom:a.bottom,readerTop:b.top,height:innerHeight};
   });
   assert(expanded.headingTop<=120,'Expanded heading stays near the upper-left: '+JSON.stringify(expanded));
   assert(expanded.readerTop>=expanded.headingBottom-4,'Text should not cover the expanded heading: '+JSON.stringify(expanded));
   await page.locator('#diarySettings').click();
   assert.equal(await page.locator('#diaryMusicVolume').isVisible(),true,'Volume slider must live in settings');
   assert.equal(await page.locator('#diaryEffectsVolume').isVisible(),true);
   await page.locator('.diary-panel-close').click();
   assert.equal(errors.length,0,'Browser errors: '+errors.join('; '));
   console.log('PASS mocked guest '+device.name+': home code → title → school → colleague → story, saved progress and settings');
   await page.close();
  }
  const legacy=await browser.newPage({viewport:{width:390,height:844}});
  await legacy.goto(base+'/teacher-class-diary-play.html?schoolId=A123456',{waitUntil:'domcontentloaded'});
  await legacy.waitForURL('**/index.html#teacher-diary-feature');
  assert.equal(await legacy.locator('#teacher-diary-feature').count(),1,'Direct URL must not bypass PIN');
  await legacy.close();
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exit(1)});
