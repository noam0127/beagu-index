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
  assert(fs.existsSync(path.join(root,m[1])),'Missing script '+m[1]);
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
assert(play.src.includes("game=engine.advance(game)"));
assert(play.src.includes("director.decorateEnding(game)"));
assert(play.src.includes("director.decorateChapter("));
assert(play.src.includes("director.decorateOutcome(game)"));
assert(play.src.includes('id="sceneArt"'));
assert(play.src.includes('id="characterAvatar"'));
assert(play.src.includes('src="js/class-diary-director-v1.js"'));
assert(!play.src.includes('type="checkbox"'));
assert(play.src.includes('기록은 저장되지 않습니다'));
assert(play.src.includes("localStorage.removeItem(key)"));
assert(!play.src.includes('localStorage.setItem('));
assert(!play.src.includes('localStorage.getItem('));
assert(!play.src.includes('sessionStorage.setItem('));
assert(play.src.includes("window.scrollTo(0,0)"));
assert(play.src.includes('레벨2'));
assert(!play.src.includes('.innerHTML'),'Use textContent instead of interpolating user data as HTML');
for(const id of ['profileForm','setup','novel','ending','chapterText','choiceButtons','outcome','noSaveNotice']){
 assert(play.ids.has(id),'Required interactive UI element missing: '+id);
}
assert(!play.src.includes('id="resumeBox"'));
assert(!play.src.includes('id="records"'));
console.log('PASS: Lv2 page syntax, no game persistence, legacy cleanup, stage4 director UI, no unsafe HTML insertion');
