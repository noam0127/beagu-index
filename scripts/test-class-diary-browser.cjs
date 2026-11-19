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
   await page.locator('#opening').waitFor({state:'visible'});
   assert.equal(await page.locator('#openingTitle').innerText(),'한 학기, 서른여섯 장면','Semester should be the primary introduction');
   assert.equal(await page.locator('.diary-opening-stat strong').first().innerText(),'36화');
   assert.equal(await page.locator('.diary-semester-acts span').count(),6,'Existing six-part intro must remain visible');
   await page.locator('#openingStart').click();
   await page.locator('#setup').waitFor({state:'visible'});
   assert.equal(await page.locator('#setup').getAttribute('data-step'),'1');
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
   await page.locator('#experience').selectOption(variant.name==='desktop'?'mid':'new');
   assert.equal(await page.locator('#age').count(),0,'Player age must not be requested');
   await page.locator('#gender').selectOption('undisclosed');
   await page.locator('#mbti').selectOption('INFP');
   await page.locator('#setupNext').click();
   assert.equal(await page.locator('#setup').getAttribute('data-step'),'2');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+2),true,'Setting screens must not scroll');
   assert.equal(await page.locator('[data-partner-choice]').count(),3,'All three date-sim character cards must render');
   const card=page.locator('[data-partner-choice="'+variant.partner+'"]');
   await card.click();
   assert.equal(await page.locator('#partner').inputValue(),variant.partner,'Card must update original partner field');
   assert.equal(await card.getAttribute('aria-pressed'),'true','Selected card must be visually announced');
   assert.equal(await page.locator('#partnerDescription').count(),0,'Selection cards should not have a duplicate description box');
   for(const id of ['setupPortraitWoman','setupPortraitNone','setupPortraitSuhyun','setupPortraitSea','setupPortraitYuri']){
     assert((await page.locator('#'+id).getAttribute('src')).startsWith('data:image/webp;base64,'),'HQ female art must be bundled: '+id);
   }
   assert((await page.locator('#setupPortraitMan').getAttribute('src')).startsWith('data:image/svg+xml'),'Male fallback must remain available');
   const count=await page.locator('#profileForm input,#profileForm select').count();
   assert.equal(count,5,'Character form must contain exactly 5 fields without age');
   await page.locator('#partner').selectOption(variant.partner);
   await page.locator('#setupNext').click();
   assert.equal(await page.locator('#setup').getAttribute('data-step'),'3');
   assert(!(await page.locator('#setupReviewName').innerText()).includes('세'),'Review must not show player age');
   assert((await page.locator('#setupReviewPartner').innerText()).includes(variant.partner==='woman'?'지윤':variant.partner==='man'?'현우':'민서'));
   await page.locator('#profileForm button[type="submit"]').click();
   await page.locator('#novel').waitFor({state:'visible'});
   assert.equal(await page.locator('.diary-day-progress span').count(),7,'Seven-day preview must retain its day-by-day progress');
   assert.equal(await page.locator('#diarySemesterMeta').isHidden(),true,'Preview must not use semester HUD');
   assert.equal(await page.locator('#musicBtn').getAttribute('aria-pressed'),'true','Game start enables music');
   await page.locator('#vnSound').click(); // in-scene sound control delegates to hidden settings button
   assert.equal(await page.locator('#musicBtn').getAttribute('aria-pressed'),'false');
   assert((await page.locator('#sceneBackdrop').evaluate(x=>x.style.backgroundImage)).includes('data:image/svg+xml'));
   // Only the scenery may be visible during actual play; the cast remains selectable in setup.
   assert.equal(await page.locator('#sceneBackdrop').isVisible(),true,'Scenery must remain visible');
   for(const id of ['scenePortrait','sceneHyunwooLive','sceneGuest','sceneDoyun']){
     assert.equal(await page.locator('#'+id).isVisible(),false,'Playable stage must hide character artwork: '+id);
   }
   const portraitSrc=await page.locator('#scenePortrait').getAttribute('src');
   assert(portraitSrc.startsWith(variant.partner==='man'?'data:image/svg+xml':'data:image/webp;base64,'),'Portrait must match chosen cast style');
   if(variant.partner!=='man')assert.equal(await page.locator('#scenePortrait').getAttribute('data-art-quality'),'hq');
   assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('is-playing')),true,'Single-screen VN mode must be active');
   const stage=await page.locator('#novelCard').boundingBox();
   assert(stage&&stage.height<=variant.height+1,'VN must fit within viewport');
   assert.equal(await page.locator('#vnMore').isVisible(),true,'Dialogue paging button must be visible');
   await page.waitForTimeout(100);
   assert.equal(await page.locator('#chapterText').evaluate(e=>e.closest('.vn-dialogue').scrollHeight<=e.closest('.vn-dialogue').clientHeight+3),true,'Dialogue must fit without inner scrolling');
   assert.equal(await page.locator('#choiceSection').isVisible(),false,'Choices should appear after reading dialogue');
   // UI v2 controls: accessible, functional and entirely temporary.
   assert.equal(await page.locator('.diary-toolbar button').count(),3,'Auto, skip and log must be available');
   assert.equal(await page.locator('#diarySettings').isVisible(),true,'Settings must be available in the HUD');
   await page.locator('#diarySettings').click();
   await page.locator('#diaryPanelScrim').waitFor({state:'visible'});
   assert.equal(await page.locator('#diaryMusicVolume').count(),1,'BGM level should be adjustable');
   assert.equal(await page.locator('#diaryEffectsVolume').count(),1,'SFX level should be adjustable');
   await page.locator('.diary-panel-close').click();
   assert.equal(await page.locator('#diaryPanelScrim').isVisible(),false,'Settings should close');
   await page.locator('#diaryLog').click();
   assert.equal(await page.locator('#diaryPanelScrim').isVisible(),true,'Dialogue log should open');
   assert((await page.locator('.diary-panel-content').innerText()).includes('새로고침'),'Temporary log must disclose no persistence');
   await page.keyboard.press('Escape');
   assert.equal(await page.locator('#diaryPanelScrim').isVisible(),false,'Escape should close the log');
   await page.locator('#diaryAuto').click();
   assert.equal(await page.locator('#diaryAuto').getAttribute('aria-pressed'),'true','Auto should start on demand');
   await page.locator('#diaryAuto').click();
   assert.equal(await page.locator('#diaryAuto').getAttribute('aria-pressed'),'false','Auto should be stoppable');


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
     assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('is-choosing')),true,'Choices should open as dimmed overlay');
     const overlay=await page.locator('#choiceSection').boundingBox();
     assert(overlay&&overlay.height>=variant.height-2,'Choice overlay should cover viewport');
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
   await page.locator('#opening').waitFor({state:'visible'});
   assert(await page.locator('#setup').isHidden(),'Reload should return to opening, not saved setup');
   assert(await page.locator('#ending').isHidden(),'Reload must clear session progress');
   console.log('PASS '+variant.name+': '+turns+' clicks, single viewport VN dialogue, ending reached, no saved progress');
   await page.close();
  }
  // Desktop full-semester opening scene must fit without page scrolling.
  const semesterDesktop=await browser.newPage({viewport:{width:1365,height:850},deviceScaleFactor:1});
  const deskErrors=[];
  semesterDesktop.on('pageerror',e=>deskErrors.push(e.message));
  await semesterDesktop.route('https://www.scottbuckley.com.au/**',route=>route.abort('blockedbyclient'));
  await semesterDesktop.goto(URL+'/teacher-class-diary-play.html?demo=1',{waitUntil:'domcontentloaded'});
  await semesterDesktop.locator('#semesterStart').click();
  await semesterDesktop.locator('#playerName').fill('한가람');
  await semesterDesktop.locator('#experience').selectOption('mid');
  await semesterDesktop.locator('#gender').selectOption('undisclosed');
  await semesterDesktop.locator('#mbti').selectOption('INFP');
  await semesterDesktop.locator('#setupNext').click();
  await semesterDesktop.locator('[data-partner-choice="man"]').click();
  await semesterDesktop.locator('#setupNext').click();
  await semesterDesktop.locator('#profileForm button[type="submit"]').click();
  await semesterDesktop.locator('#novel').waitFor({state:'visible'});
  assert.equal(await semesterDesktop.locator('.diary-day-progress span').count(),6,'Desktop semester must show six-act progress');
  assert.equal(await semesterDesktop.locator('#diarySemesterMeta').isVisible(),true,'Desktop semester seasonal HUD must be visible');
  const desktopRect=await semesterDesktop.locator('#novelCard').boundingBox();
  assert(desktopRect&&desktopRect.height<=851,'Desktop semester chapter must fit a single viewport');
  assert.equal(await semesterDesktop.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+8),true,'Desktop semester overflow');
  assert.equal(deskErrors.length,0,'Desktop semester browser errors: '+deskErrors.join('; '));
  await semesterDesktop.screenshot({path:'artifacts/class-diary/semester-desktop-first-scene.png'});
  await semesterDesktop.close();
  // Full-semester browser path: all 36 scenes must reach an ending in a real DOM.
  const semesterPage=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
  const semesterErrors=[];
  semesterPage.on('pageerror',e=>semesterErrors.push(e.message));
  await semesterPage.route('https://www.scottbuckley.com.au/**',route=>route.abort('blockedbyclient'));
  await semesterPage.goto(URL+'/teacher-class-diary-play.html?demo=1',{waitUntil:'domcontentloaded'});
  await semesterPage.locator('#opening').waitFor({state:'visible'});
  await semesterPage.locator('#semesterStart').click();
  await semesterPage.locator('#setup').waitFor({state:'visible'});
  assert.equal(await semesterPage.locator('#setup').evaluate(el=>document.body.dataset.diaryStory),'semester');
  assert((await semesterPage.locator('.setup-player-stamp small').innerText()).includes('한 학기'),'Semester setup must not say 7 days');
  await semesterPage.locator('#playerName').fill('한가람');
  await semesterPage.locator('#experience').selectOption('new');
  await semesterPage.locator('#gender').selectOption('undisclosed');
  await semesterPage.locator('#mbti').selectOption('INFP');
  await semesterPage.locator('#setupNext').click();
  await semesterPage.locator('[data-partner-choice="woman"]').click();
  await semesterPage.locator('#setupNext').click();
  await semesterPage.locator('#profileForm button[type="submit"]').click();
  await semesterPage.locator('#novel').waitFor({state:'visible'});
  const proseMode=await semesterPage.evaluate(()=>({
    semester:document.body.classList.contains('is-semester-mode'),
    overlayLoaded:typeof window.BeaguClassDiaryLiterary?.present==='function',
    totalLines:document.querySelectorAll('#chapterText .diary-literary-line').length,
    visibleLines:[...document.querySelectorAll('#chapterText .diary-literary-line')].filter(el=>!el.hidden).length,
    ghostLines:document.querySelectorAll('.diary-literary-echo').length,
    season:document.querySelector('#novelCard').dataset.season,
    paperBackground:getComputedStyle(document.querySelector('.vn-dialogue')).backgroundColor,
    height:document.querySelector('#novelCard').getBoundingClientRect().height,
    viewport:innerHeight
  }));
  assert(proseMode.semester&&proseMode.overlayLoaded,'The 36-chapter literary presentation must load');
  assert(proseMode.totalLines>=3,'Semester pages must contain several readable lines');
  assert.equal(proseMode.visibleLines,1,'The first line is revealed before user input');
  assert.equal(proseMode.ghostLines,0,'Prior-line echoes must not exist');
  const beforeTap=await semesterPage.evaluate(()=>{
    const row=document.querySelector('#chapterText .diary-literary-line:not([hidden])');
    return {text:row.textContent,size:getComputedStyle(row).fontSize,opacity:getComputedStyle(row).opacity};
  });
  // A real touch-like click reveals exactly one additional line and preserves the first line.
  await semesterPage.locator('#sceneArt').click({position:{x:75,y:370}});
  const afterTap=await semesterPage.evaluate(()=>{
    const rows=[...document.querySelectorAll('#chapterText .diary-literary-line:not([hidden])')];
    return {count:rows.length,text:rows[0].textContent,size:getComputedStyle(rows[0]).fontSize};
  });
  assert.equal(afterTap.count,2,'One touch must add precisely one line');
  assert.equal(afterTap.text,beforeTap.text,'Old text must remain unchanged');
  assert.equal(afterTap.size,beforeTap.size,'Old text must not shrink');
  // Enter advances one more line, with focus outside any form or button.
  await semesterPage.evaluate(()=>document.activeElement?.blur());
  await semesterPage.keyboard.press('Enter');
  assert.equal(await semesterPage.locator('#chapterText .diary-literary-line:not([hidden])').count(),3,
    'One Enter must reveal precisely the next line');
  assert.equal(proseMode.season,'march','The semester begins in chilly March');
  assert(proseMode.height<=proseMode.viewport+2,'36-chapter mode must fit the viewport');
  await semesterPage.screenshot({path:'artifacts/class-diary/semester-literary-first-scene.png',fullPage:true});
  assert.equal(await semesterPage.locator('.diary-day-progress span').count(),6,'Full semester must use six-part progress, not seven-day timeline');
  assert.equal(await semesterPage.locator('#diarySemesterMeta').isVisible(),true,'Season and act status must be visible in game');
  assert.equal(await semesterPage.locator('#sceneBackdrop').isVisible(),true,'Semester scenery must remain visible');
  for(const id of ['scenePortrait','sceneHyunwooLive','sceneGuest','sceneDoyun']){
    assert.equal(await semesterPage.locator('#'+id).isVisible(),false,'Semester stage must hide character artwork: '+id);
  }
  assert((await semesterPage.locator('#diarySemesterMeta').innerText()).includes('3월'),'March season marker missing');
  const gameFrame=await semesterPage.locator('#novelCard').boundingBox();
  assert(gameFrame && gameFrame.height<=844+1,'36-episode novel should remain one mobile viewport');
  const visited=new Set(),months=new Set(),parts=new Set();
  let steps=0;
  while(await semesterPage.locator('#ending').isHidden()&&steps<2400){
   steps++;
   const header=await semesterPage.locator('#chapterDay').innerText();
   const match=header.match(/^(\d+) \/ 36/);
   if(match){
    visited.add(Number(match[1]));
    const season=await semesterPage.locator('#novelCard').getAttribute('data-season');
    const month={march:'03',april:'04',may:'05',june:'06',july:'07'}[season];
    if(month)months.add(month);
    const info=await semesterPage.locator('#diarySemesterMeta').innerText();
    const part=info.match(/제([1-6])부/);
    if(part)parts.add(Number(part[1]));
   }
   const choice=semesterPage.locator('#choiceSection');
   if(await choice.isVisible()){
    const options=choice.locator('.choice');
    assert.equal(await options.count(),3,'Semester chapter must offer three choices');
    await options.nth(steps%3).click();
   }else{
    // The public UI intentionally hides the old next buttons: touch/Enter
    // still invoke their original handlers without a forced scroll.
    const advanced=await semesterPage.evaluate(()=>{
     const next=!document.getElementById('vnMore').hidden
       ?document.getElementById('vnMore'):!document.getElementById('nextBtn').hidden
       ?document.getElementById('nextBtn'):null;
     if(!next)return false;
     next.click();return true;
    });
    if(!advanced)throw Error('Semester blocked at step '+steps+' ('+header+')');
   }
  }
  assert.equal(visited.size,36,'Must visit all 36 original fiction scenes');
  assert.deepEqual([...months].sort(),['03','04','05','06','07'],'March through July must appear in episode status');
  assert.deepEqual([...parts].sort((a,b)=>a-b),[1,2,3,4,5,6],'All six parts must appear in progression');
  assert(!await semesterPage.locator('#ending').isHidden(),'Semester must reach its final page');
  assert((await semesterPage.locator('#endingTitle').innerText()).startsWith('나의 '));
  assert((await semesterPage.locator('#endingSchool').innerText()).includes('36화의 기록'));
  assert.equal(await semesterPage.locator('#diarySemesterFinish').isVisible(),true,'Semester completion marker is missing');
  assert.equal(semesterErrors.length,0,'Semester browser errors: '+semesterErrors.join('; '));
  const semesterStorage=await semesterPage.evaluate(()=>Object.keys(localStorage).filter(k=>k.includes('class-diary')));
  assert.equal(semesterStorage.length,0,'Semester must not save game data');
  console.log('PASS semester browser: '+visited.size+' chapters, '+steps+' interactions, ending, no saved progress');
  await semesterPage.close();
  const page=await browser.newPage();
  await page.goto(URL+'/teacher-class-diary-play.html?schoolId=DEMO001',{waitUntil:'domcontentloaded'});
  await page.locator('#notice').waitFor({state:'visible'});
  assert(await page.locator('#setup').isHidden(),'Fictional school may not bypass Level2 auth');
  await page.close();
  console.log('PASS non-demo Lv2 access gate');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
