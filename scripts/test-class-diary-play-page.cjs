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
assert(play.src.includes('id="playerName"'));
const setupSection=play.src.split('<form id="profileForm">')[1].split('</form>')[0];
const formInputs=[...setupSection.matchAll(/\<(?:input|select)\b[^>]*\bid="([^"]+)"/g)].map(x=>x[1]);
assert.deepEqual(formInputs,['playerName','age','experience','gender','mbti','partner'],'Exactly 6 setup fields');
assert(play.src.includes('class="panel vn-setup"'),'Dating-sim setup should replace plain form');
for(const id of ['setupPlayerPreview','setupPortraitWoman','setupPortraitMan','setupPortraitNone','partnerDescription']){
 assert(play.ids.has(id),'Setup portrait/preview missing: '+id);
}
for(const key of ['woman','man','none']){
 assert(play.src.includes('data-partner-choice="'+key+'"'),'Character card missing: '+key);
}
assert(play.src.includes("syncSetupPartner();sound.note('uiPick')"),'Selecting a cast card should play a cue');
assert(play.src.includes("sound.note('uiStart')"),'Beginning the novel should play a cue');
assert(play.src.includes("setupDescription"),'Selecting cast should update story introduction');
assert(play.src.includes('role="group" aria-label="동료 캐릭터 선택"'),'Card chooser should be accessible');

assert(play.src.includes('engine.inferredProfile(world,{'));
assert(play.src.includes("experience:$('experience').value"));
assert(!play.src.includes('experienceYears'));
for(const label of ['저경력','중간경력','고경력'])assert(play.src.includes(label));
assert(play.src.includes('},plan));'));
assert(play.src.includes('id="worldAutoNote"'));
assert(play.src.includes('제작자: 카리브해매너티'));
assert(play.src.includes('id="musicBtn"'));
assert(play.src.includes("name:$('playerName').value"));

assert(play.src.includes("director.decorateEnding(game)"));
assert(play.src.includes("director.decorateChapter("));
assert(play.src.includes("director.decorateOutcome(game)"));
assert(play.src.includes('id="sceneArt"'));
assert(play.src.includes('id="experience"'),'Career selector is required');
assert(!play.src.includes('id="experienceYears"'),'Numeric career field must not return');
for(const value of ['new','mid','senior'])assert(setupSection.includes('value="'+value+'"'),'Missing career stage '+value);
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
