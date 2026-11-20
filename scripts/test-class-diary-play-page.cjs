/* Stage 4 checks: no game persistence, safe markup, stable Lv2 access. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.join(__dirname,'..');
function checkPage(name){
 const src=fs.readFileSync(path.join(root,name),'utf8');
 const ids=new Set([...src.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));
 const inline=[...src.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).filter(Boolean);
 assert(inline.length>0,'Need a page bootstrap script: '+name);
 for(const text of inline){
  new vm.Script(text,{filename:name+' inline script'});
  for(const m of text.matchAll(/\$\('([^']+)'\)/g))assert(ids.has(m[1]),'Unknown DOM id '+m[1]+' in '+name);
 }
 for(const m of src.matchAll(/<script\s+src="([^"]+)"/g)){
  assert(!m[1].startsWith('http:'),'Remote insecure JS');
  assert(fs.existsSync(path.join(root,m[1].split('?')[0])),'Missing script '+m[1]);
 }
 assert(!src.includes('SUPABASE_SERVICE_ROLE_KEY'),'Never put a service role key in the client');
 return {ids,src};
}
const play=checkPage('teacher-class-diary-play.html');
const preview=checkPage('teacher-class-diary.html');
assert(preview.src.includes('teacher-class-diary-play.html?schoolId='));
assert(preview.src.includes("$('playSection').hidden=!world.eligible"));
assert(play.src.includes("sessionStorage.getItem('beagu-level-session-v1')"));
assert(play.src.includes("engine.createGame(world,plan"));
assert(!play.src.includes('engine.restore('));
assert(!play.src.includes('engine.createSnapshot('));
assert(play.src.includes('scenario.continueStory(game):engine.advance(game)'));
assert(play.src.includes('incidents.continueStory(game)'));
assert(play.src.includes('src="js/class-diary-incidents-v1.js"'));
assert(play.src.includes('incidents.next(game,world)'));
assert(!play.src.includes('id="guestCode"'),'The game must never ask for raw guest codes');
assert(!play.src.includes('id="guestForm"'),'The game must never contain a guest login form');
assert(play.src.includes("params.get('guest')==='1'"),'Guest route must be explicit');
assert(play.src.includes("sessionStorage.removeItem(handoffKey)"),'Guest ticket must be consumed and discarded');
assert(play.src.includes("show('guestAccess')"),'Guest verification screen must gate the fiction');
assert(play.src.includes("action:'verify-ticket'"),'Ticket must be verified server-side');
assert(play.src.includes("result.scope!=='class-diary-fictional-guest'"),'Guest ticket must be scoped');
assert(play.src.includes("result.progressToken"),'Game progress must use a signed token');
assert(play.src.indexOf("if(isGuest){")<play.src.indexOf("if(isDemo){"),'Guest access must be checked before the demo route');
assert(play.src.indexOf('class="setup-player-stamp"')>play.src.indexOf('class="form-grid"'),'Pencil preview must be below the form');
assert(play.src.includes('class-diary-guest-experience-v1.css'),'Guest stylesheet remains available');


assert(!play.src.includes('sessionStorage.setItem('),'Guest code may not be saved in client session');
assert(!play.src.includes('레벨2 임시 승인'),'Guest must not be misrepresented as Level 2');
assert(play.src.includes('id="playerName"'));
const setupSection=play.src.split('<form id="profileForm">')[1].split('</form>')[0];
const formInputs=[...setupSection.matchAll(/\<(?:input|select)\b[^>]*\bid="([^"]+)"/g)].map(x=>x[1]);
assert.deepEqual(formInputs,['diarySchoolName','diarySchoolMode','playerName','experience','gender','mbti','partner','diarySchoolQuery'],'One visible school text field, hidden fictional defaults, colleague selector and optional legacy lookup');
assert(!play.ids.has('age'),'No player age input');
assert(play.ids.has('diaryLandingStart'),'One-card story entry is required');
assert(play.ids.has('diarySchoolName'),'Actual school must be chosen in the first setup step');
assert(!play.src.includes('class="diary-school-flow"'),'Oversized prologue-to-school progress box must be absent');
assert(play.src.includes('class="diary-school-intro"'),'School selection should have the new compact story lead');
assert(play.src.includes('class="diary-school-input-wrap"'),'Search control should have a dedicated discoverable surface');
assert(play.src.includes('class="diary-school-narrative"'),'Real school data limitations must remain disclosed');
assert(play.src.includes('styles/class-diary-guest-experience-v1.css?v=20261120-school-layout8'),'New CSS must not be cached as the old screen');
assert(play.src.includes('id="diarySchoolName" type="text"'),'School selection should be a plain text input');
assert(play.src.includes('id="diarySchoolMode" type="hidden"'),'The old mode dropdown must be removed from the user interface');
assert(play.src.includes('봄에서 여름까지, 하나의 이야기가 시작된다.'),'Landing card should lead into the semester story');
assert(play.src.includes('validateSchoolName:applySchoolName'),'Actual school must be verified before colleague choice');
assert(play.src.includes('schoolSelection=Object.freeze('),'School identity must come from the verified public directory');
assert(play.ids.has('diarySchoolResults'),'School search results must be available');
assert(play.src.includes("if(!isGuest){location.replace('index.html#teacher-diary-feature');return;}"),'Non-guest entry cannot bypass private preview');
assert(play.src.includes('id="diary-private-preview-gate"'),'Direct game links must be blocked early');
assert(play.src.includes("selectSchoolMode('choose')"),'Every new session must require school selection');
assert(play.src.includes("if(!/^[0-9a-f]{64}$/.test(token))"),'Protected legacy Lv2 world API must retain its authorization check');
assert(preview.src.includes("location.replace('index.html#teacher-diary-feature')"),'Paused legacy preview must return safely to the home diary entry');

assert(play.src.includes("selectSchoolMode('demo');\n  show('diaryLanding');"),'Demo shows the title before selecting a school');
assert(play.src.includes("selectSchoolMode('real',world.basic.name);\n  $('semesterStart').click();"),'Authorized real school should also skip the opening');
assert(play.src.includes('function vnFitPage('),'Overflowing dialogue must be repaginated');
assert(play.src.includes('class="panel vn-setup"'),'Dating-sim setup should replace plain form');
for(const id of ['setupPlayerPreview','setupPortraitWoman','setupPortraitMan','setupPortraitNone']){
 assert(play.ids.has(id),'Setup portrait/preview missing: '+id);
}
for(const key of ['woman','man','none','man2','man3']){
 assert(play.src.includes('data-partner-choice="'+key+'"'),'Character card missing: '+key);
}
const castRetouchCss=fs.readFileSync('styles/class-diary-cast-photo-retouch-v4.css','utf8');
const castRetouchWebp=fs.readFileSync('assets/class-diary/characters/setup-three-portraits-v4.webp');
assert(castRetouchWebp.length>2000&&castRetouchWebp.subarray(0,4).toString('ascii')==='RIFF','Retouched photo strip must be a real WebP');
assert(play.src.includes("retouchedPortraitStrip.src='assets/class-diary/characters/setup-three-portraits-v4.webp'"),'The three-card photo strip must be preloaded');
assert(castRetouchCss.includes('background-size: 300% 100%'),'Three natural portrait photographs must be segmented correctly');
assert(castRetouchCss.includes('.setup-character-art.minseo'),'Minseo crop fix must be present');
assert(castRetouchCss.includes('.setup-character-art.dogyeom'),'Dogyeom background fix must be present');
assert(castRetouchCss.includes('.setup-character-art.taeo'),'Taeo background fix must be present');
const newCastCss=fs.readFileSync('styles/class-diary-cast-distinct-v5.css','utf8');
const newCastPhoto=fs.readFileSync('assets/class-diary/characters/class-diary-cast-five-distinct-v5.webp');
assert(newCastPhoto.length>14000&&newCastPhoto.subarray(0,4).toString('ascii')==='RIFF','Five-person natural portrait strip must be a complete WebP');
assert(newCastCss.includes('background-size:500% 100%'),'Five same-size square photographs must not be squeezed');
for(const item of ['jiyoon','hyunwoo','minseo','dogyeom','taeo'])assert(newCastCss.includes('.setup-character-art.'+item),'Distinct colleague photo is missing: '+item);
assert(play.src.includes("distinctCastPortraits.src='assets/class-diary/characters/class-diary-cast-five-distinct-v5.webp'"),'New five-person strip must be preloaded before replacing fallback art');
assert(play.src.includes('styles/class-diary-cast-distinct-v5.css?v=20261120-hyunwoo-hair-v3'),'Cache-busting stylesheet must be linked');
const v6Css=fs.readFileSync('styles/class-diary-cast-profiles-v6.css','utf8');
const v6Image=fs.readFileSync('assets/class-diary/characters/class-diary-cast-hobbies-v6.webp');
assert(v6Image.length>4000&&v6Image.subarray(0,4).toString('ascii')==='RIFF','Hobby-themed WebP strip must exist and be valid');
assert(v6Css.includes('background-size:500% 100%'),'Hobby-themed photographs must be separate square crops');
assert(play.src.includes("hobbyCastPortraits.src='assets/class-diary/characters/class-diary-cast-hobbies-v6.webp'"),'Hobby photo strip must be loaded with v5 fallback');
assert(play.src.includes('styles/class-diary-cast-profiles-v6.css?v=20261120-cast-hobbies-hyunwoo-v3'),'Portrait CSS must be cache busted');
for(const text of ['기타 · 낮은 선율로 마음을 건넨다','논어 · 웃음 뒤에 생각을 남긴다','기록 · 지나간 표정을 오래 헤아린다','실뜨기 · 얽힌 마음을 찬찬히 푼다','배구 · 승부보다 함께한 날을 기억한다'])assert(play.src.includes(text),'Hobby/personality label missing: '+text);

assert(play.src.includes('has-hyunwoo-hair-v3'),'Hyunwoo profile should apply the same hair treatment as the novel');
assert(v6Css.includes('--diary-hyunwoo-hair-image'),'Only Hyunwoo card may override hobby photos');
const hairSource=fs.readFileSync('js/class-diary-male-natural-v2.js','utf8');
assert(hairSource.includes('function restyleHyunwoo(image)'),'Retain all eight poses with a hair-only rendering pass');
assert(hairSource.includes('function spriteSource(partner)'),'Card and stage use same hairstyle');
assert(play.src.includes("syncSetupPartner();sound.note('uiPick')"),'Selecting a cast card should play a cue');
assert(play.src.includes("sound.note('uiStart')"),'Beginning the novel should play a cue');
assert(play.src.includes("setupDescription"),'Selecting cast should update story introduction');
assert(play.src.includes('role="group" aria-label="프롤로그의 화자, 알고 싶은 사람 선택"'),'Card chooser should be accessible');
assert(!play.ids.has('partnerDescription'),'Redundant character-description box must be removed');
assert(play.src.includes('<select id="partner" required hidden'),'Legacy partner data remains in a hidden form control');
assert(play.ids.has('diarySchoolSurveyLink'),'Schools without published results offer a 2026 survey link');
assert(play.src.includes('arcade-leaderboard?school_id='),'School survey eligibility is queried from existing published API');
assert(play.src.includes("school.eligible!==true||!years.length"),'Schools without approved public survey years require survey participation');
assert(play.src.includes("baseGame.schoolContext={"),'Approved public school identity must survive progress saves');
assert(play.src.includes("let storyMode='semester'"),'All user journeys default to the 36-episode narrative');
assert(play.src.includes('id="openingStart" type="button" class="secondary diary-opening-start" hidden'),'7-day trial button must not appear');
assert(play.src.includes('id="semesterStart" type="button" class="primary diary-opening-start" hidden'),'No alternative game start button');
assert(play.src.includes('학교명·지역·공개 조사연도'),'Only grounded, public school attributes may be described as real');

assert(play.src.includes('async function loadSchoolWorld(schoolId)'),'School data loads only after explicit selection');
const journey=fs.readFileSync('js/class-diary-journey-v1.js','utf8');
const guestStyle=fs.readFileSync('styles/class-diary-guest-experience-v1.css','utf8');
assert(journey.includes('Math.min(3,Number(next)||1)'),'Setup must support the third review step');
assert(journey.includes('go(3)'),'Colleague next button must enter the review screen');
assert(journey.includes("step!==3"),'Submitting story should only work from first-day review');
assert(journey.includes("setupReviewPartner"),'Review must show the actual selected colleague');
assert(guestStyle.includes('setupPortraitNone'),'Minseo must have a matching photograph scale');
assert(guestStyle.includes('Gowun Batang'),'Main action buttons should use the diary literary typography');

assert(play.src.includes('schoolSelection=Object.freeze({id:record.school_id,name,region,years})'),'Public school choice must not demand a Level 2 world API');
assert(play.src.includes('The title and first setup step never require a school ID'),'Initial screen cannot block on school');
assert(play.src.includes("Fail closed for checkpoint writes"),'Failed progress retrieval cannot overwrite existing saves');

assert(play.src.indexOf('id="diarySchoolMode"') < play.src.indexOf('id="playerName"'),'School selection precedes name');


assert(play.src.includes('engine.inferredProfile(world,{'));
assert(play.src.includes("experience:$('experience').value"));
assert(!play.src.includes('experienceYears'));
assert(setupSection.includes('value="mid" selected'),'Hidden profile defaults to neutral story experience');
assert(play.src.includes('},plan));'));
assert(play.src.includes('id="worldAutoNote"'));
assert(play.src.includes('제작자: 카리브해매너티'));
assert(play.src.includes('id="musicBtn"'));
assert(play.src.includes("name:$('playerName').value"));

assert(play.src.includes("director.decorateEnding(game)"));
assert(play.src.includes("director.decorateChapter("));
assert(play.src.includes("director.decorateOutcome(game)"));
assert(play.src.includes('id="sceneArt"'));
assert(!play.ids.has('vnReset'),'No return-to-start control in the story info toolbar');
assert(!play.ids.has('vnScreenToggle'),'No fullscreen control in the story info toolbar');
assert(play.ids.has('diaryScreenToggle'),'Fullscreen toggle must be accessible from setup and ending');
assert(play.src.includes('requestFullscreen({navigationUI:'),'Fullscreen button must invoke the browser API');
assert(play.src.includes('document.exitFullscreen()'),'Expanded view must be reversible');
assert(play.src.includes("document.addEventListener('fullscreenchange',syncScreenButtons)"),'Escape/fullscreen state changes must refresh the button');
assert(play.src.includes("document.body.classList.contains('diary-theater-mode')"),'Unsupported browsers need an immersive fallback');
assert(play.src.includes("setAttribute('aria-pressed',String(expanded))"),'The screen toggle must expose its state to assistive tech');
assert(play.src.includes('id="experience"'),'Career selector is required');
assert(!play.src.includes('id="experienceYears"'),'Numeric career field must not return');
assert(setupSection.includes('id="experience" hidden'),'Internal default must not ask for career stage');
assert(setupSection.includes('id="gender" hidden'),'Internal default must not ask for gender');
assert(setupSection.includes('id="mbti" hidden'),'Internal default must not ask for MBTI');
assert(setupSection.includes('id="playerName" name="playerName" type="hidden"'),'Internal pen name should not be requested');
assert(play.src.includes("show('diaryLanding');\n status('첫 페이지를 펼치면 학교를 선택할 수 있습니다.')"),'Verified guest must see the title before settings');
assert(!play.src.includes("if($('setup').dataset.step==='2')$('profileForm').requestSubmit()"),'Choosing a portrait should not skip the first-day button');
assert(!play.src.includes('id="duty"'),'Other profile settings are derived or fictional');
assert(!play.src.includes('id="classTone"'),'Other profile settings are derived or fictional');
assert(!play.src.includes('id="workCulture"'),'Other profile settings are derived or fictional');
assert(play.src.includes('src="js/class-diary-scenario-v1.js"'));
assert(play.src.includes('scenario.scene(game,world)'));
assert(play.src.includes('scenario.choose(game,choice.id,world)'));
assert(play.src.includes('incidents.choose(game,world,choice.id)'));
assert(play.src.includes('scenario.continueStory(game)'));

assert(play.src.includes('id="characterAvatar"'));
assert(play.src.includes('src="js/class-diary-director-v1.js"'));
assert(play.src.includes('src="js/class-diary-character-routes-v1.js"'));
assert(play.src.includes('민서 선생님 · 우정 중심'));
assert(play.src.includes('characterRoutes.eventMoment(game,event)'));
assert(play.src.includes('src="js/class-diary-context-v1.js"'));
assert(play.src.includes('schoolContext.forDay(world,game.day)'));
assert(play.src.includes("$('statVoice').textContent"));
assert(play.src.includes("$('statBoundary').textContent"));
assert(!play.src.includes('type="checkbox"'));
assert(play.src.includes('기록은 저장되지 않습니다'));
assert(play.src.includes("localStorage.removeItem(key)"));
assert(!play.src.includes('localStorage.setItem('));
assert(!play.src.includes('localStorage.getItem('));
assert(!play.src.includes('sessionStorage.setItem('));
assert(play.src.includes("window.scrollTo(0,0)"));
assert(play.src.includes('레벨2'));
assert(play.src.includes("const isDemo=params.get('demo')==='1'"));
assert(play.src.includes("if(isDemo){"));
assert(play.src.indexOf('if(isDemo){')<play.src.indexOf("if(!/^[A-Z0-9]{7}$/.test(schoolId))"));
assert(preview.src.includes('teacher-class-diary-play.html?demo=1'));
assert(play.src.includes('src="js/class-diary-demo-v1.js"'));
assert(play.src.includes('로그인 없이 플레이'));
assert(play.src.includes('실제 학교 자료 사용 안 함'));
assert(!play.src.includes('.innerHTML'),'Use textContent instead of interpolating user data as HTML');
for(const id of ['profileForm','setup','novel','ending','chapterText','choiceButtons','outcome','noSaveNotice','schoolFacts','schoolFactsList','statVoice','statBoundary']){
 assert(play.ids.has(id),'Required interactive UI element missing: '+id);
}
assert(!play.src.includes('id="resumeBox"'));
assert(!play.src.includes('id="records"'));
assert(play.ids.has('diaryHomeReturn'),'Home return button must exist in the game HUD');
assert(play.src.includes('aria-label="배구지수 홈으로 돌아가기"'),'Home control needs a clear accessible name');
assert(play.src.includes("window.location.assign('https://baeguindex.com/')"),'Home button must lead to Beaguindex');
assert(play.src.includes("const saved=await progressSession.save(game)"),'Do not leave without attempting a progress save');
assert(play.src.includes("진행 기록을 저장하지 못했습니다."),'Warn on save failures');
console.log('PASS: Lv2 page syntax, no game persistence, legacy cleanup, stage4 director UI, no unsafe HTML insertion');
