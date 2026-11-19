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
assert.deepEqual(formInputs,['diarySchoolMode','playerName','experience','gender','mbti','partner','diarySchoolQuery'],'School-first setup with six profile controls and separate school search, without age');
assert(!play.ids.has('age'),'No player age input');
assert(play.ids.has('diaryLandingStart'),'One-card story entry is required');
assert(play.ids.has('diarySchoolMode'),'School must be selectable before profile details');
assert(play.ids.has('diarySchoolResults'),'School search results must be available');
assert(play.src.includes("show('diaryLanding')"),'Unparameterized game entry must show the simple title card');
assert(play.src.includes("selectSchoolMode('demo')"),'Fictional demo school should be the safe default');
assert(play.src.includes("if(!/^[0-9a-f]{64}$/.test(token))"),'Real school selection must not bypass Lv2 verification');
assert(preview.src.includes("location.replace('teacher-class-diary-play.html')"),'Legacy preview must send users straight to the title card');

assert(play.src.includes("selectSchoolMode('demo');\n  show('diaryLanding');"),'Demo shows the title before selecting a school');
assert(play.src.includes("selectSchoolMode('real',world.basic.name);\n  $('semesterStart').click();"),'Authorized real school should also skip the opening');
assert(play.src.includes('function vnFitPage('),'Overflowing dialogue must be repaginated');
assert(play.src.includes('class="panel vn-setup"'),'Dating-sim setup should replace plain form');
for(const id of ['setupPlayerPreview','setupPortraitWoman','setupPortraitMan','setupPortraitNone']){
 assert(play.ids.has(id),'Setup portrait/preview missing: '+id);
}
for(const key of ['woman','man','none']){
 assert(play.src.includes('data-partner-choice="'+key+'"'),'Character card missing: '+key);
}
assert(play.src.includes("syncSetupPartner();sound.note('uiPick')"),'Selecting a cast card should play a cue');
assert(play.src.includes("sound.note('uiStart')"),'Beginning the novel should play a cue');
assert(play.src.includes("setupDescription"),'Selecting cast should update story introduction');
assert(play.src.includes('role="group" aria-label="동료 캐릭터 선택"'),'Card chooser should be accessible');
assert(!play.ids.has('partnerDescription'),'Redundant character-description box must be removed');
assert(play.src.includes('<select id="partner" required hidden'),'Legacy partner data remains in a hidden form control');
assert(play.ids.has('diarySchoolSurveyLink'),'Schools without published results offer a 2026 survey link');
assert(play.src.includes('arcade-leaderboard?school_id='),'School survey eligibility is queried from existing published API');
assert(play.src.includes('async function loadSchoolWorld(schoolId)'),'School data loads only after explicit selection');
assert(play.src.includes('await loadSchoolWorld(record.school_id)'),'Real school choice invokes the deferred loader');
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
assert(play.ids.has('vnScreenToggle'),'Fullscreen toggle must be accessible from the story HUD');
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
console.log('PASS: Lv2 page syntax, no game persistence, legacy cleanup, stage4 director UI, no unsafe HTML insertion');
