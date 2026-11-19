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
   {name:'mobile',width:390,height:844,partner:'man'},
   {name:'friendship',width:390,height:844,partner:'none'}
  ]){
   const page=await browser.newPage({viewport:{width:variant.width,height:variant.height},deviceScaleFactor:1});
   const errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('https://www.scottbuckley.com.au/**',route=>route.abort('blockedbyclient'));
   await page.goto(URL+'/teacher-class-diary-play.html?demo=1',{waitUntil:'domcontentloaded'});
   await page.locator('#setup').waitFor({state:'visible'});
   // Browser must receive the revised fictional incident dialogue.
   const incidentVersion=await page.evaluate(()=>{
     const events=window.BeaguClassDiaryIncidents?.INCIDENTS;
     return {
       choices:events?.friendship_chair?.choices?.length||0,
       prose:events?.barbecue?.choices?.find(c=>c.id==='bbq_join')?.reply?.[0]||''
     };
   });
   assert.equal(incidentVersion.choices,3,'Friendship episode choices must load');
   assert(incidentVersion.prose.includes('종이접시'),'Revised event dialogue must load');
   await page.locator('#playerName').fill(variant.name==='desktop'?'최윤호':variant.name==='friendship'?'박루다':'김민서');
   const count=await page.locator('#profileForm input,#profileForm select').count();
   assert.equal(count,6,'Character form must contain exactly 6 fields');
   await page.locator('#experience').selectOption(variant.name==='desktop'?'mid':'new');
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
   assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('is-playing')),true,'Single-screen VN mode must be active');
   const stage=await page.locator('#novelCard').boundingBox();
   assert(stage&&stage.height<=variant.height+1,'VN must fit within viewport');
   assert.equal(await page.locator('#vnMore').isVisible(),true,'Dialogue paging button must be visible');
   assert.equal(await page.locator('#choiceSection').isVisible(),false,'Choices should appear after reading dialogue');

   if(variant.name==='desktop')await page.screenshot({path:'artifacts/class-diary/desktop-first-scene.png',fullPage:true});
   else await page.screenshot({path:'artifacts/class-diary/mobile-first-scene.png',fullPage:true});
   let turns=0,sawFull=false,sawFriendly=false,sawCareer=false,sawCharacterVoice=false,seenStory='';
   const full=variant.name==='desktop'?'최윤호 선생님':variant.name==='friendship'?'박루다 선생님':'김민서 선생님';
   const friendly=variant.name==='desktop'?'윤호 쌤':variant.name==='friendship'?'루다 쌤':'민서 쌤';
   while(await page.locator('#ending').isHidden()){
    if(turns++>1200)throw Error('Scene flow did not finish within 1200 interactions');
    const now=(await page.locator('#chapterText').innerText())+' '+(await page.locator('#outcomeText').innerText());
    seenStory+=' '+now;
    sawFull ||= now.includes(full);
    sawFriendly ||= now.includes(friendly);
    const unique=variant.partner==='woman'?'지윤 선생님은 내가 설명을 다 끝낼 때까지 기다렸다':
      variant.partner==='man'?'현우 선생님은 복합기 옆에서':'민서 선생님은 자리에 앉자마자';
    sawCharacterVoice ||= now.includes(unique);
    sawCareer ||= now.includes(variant.name==='desktop'?
      '경력이 쌓여도 학기 초는 늘 새로웠다':'아직 교단에서 배우는 일이 더 많았다');
    const more=page.locator('#vnMore');
    if(await more.isVisible()){await more.click();continue;}
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
   assert(sawCareer||seenStory.includes(variant.name==='desktop'?'경력이 쌓여도 학기 초는 늘 새로웠다':'아직 교단에서 배우는 일이 더 많았다'),'Selected career stage must shape narration across the first day');
   assert(sawCharacterVoice||seenStory.includes(variant.partner==='woman'?'지윤 선생님은 내가 설명을 다 끝낼 때까지 기다렸다':variant.partner==='man'?'현우 선생님은 복합기 옆에서':'민서 선생님은 자리에 앉자마자'),'Every selected adult colleague must have distinct opening narration');
   assert(sawFull||seenStory.includes(full),'Colleagues must use the character full name in initial scenes');
   assert(sawFriendly||seenStory.includes(friendly),'Closer colleagues must use given-name 쌤 on later days');
   assert((await page.locator('#endingTitle').innerText()).startsWith('나의 '));
   assert((await page.locator('#endingText').innerText()).length>100);
   if(variant.partner==='none'){
     assert((await page.locator('#endingText').innerText()).includes('민서 선생님'),'Platonic friendship has its own named ending');
     assert(!['나의 소중한 학급일지','나의 다정한 학급일지'].includes(await page.locator('#endingTitle').innerText()),
       'Platonic route must not open romantic endings');
   }
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
   console.log('PASS '+variant.name+': '+turns+' clicks, single viewport VN dialogue, ending reached, no saved progress');
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
