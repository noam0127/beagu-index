/* Stage 3 document wiring and browser script syntax check. No network or test credentials. */
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
assert(play.src.includes("engine.restore(world,plan"));
assert(play.src.includes("game=engine.advance(game)"));
assert(play.src.includes("game.ending.title"));
assert(play.src.includes('type="checkbox"'));
assert(play.src.includes("window.scrollTo(0,0)"));
assert(play.src.includes('레벨2'));
assert(!play.src.includes('.innerHTML'),'Use textContent instead of interpolating user data as HTML');
for(const id of ['profileForm','setup','novel','ending','chapterText','choiceButtons','outcome','resumeBtn','clearBtn','clearRecordsBtn']){
 assert(play.ids.has(id),'Required interactive UI element missing: '+id);
}
console.log('PASS: Lv2 page syntax, script paths, 3-stage UI, all named elements, opt-in local save and no unsafe HTML insertion');
