/* Prologue narrator / main character perspective regression (no server calls). */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const narrator=require('../js/class-diary-narrator-v1.js');
const semester=require('../js/class-diary-semester-v1.js');
const entry=fs.readFileSync(path.join(__dirname,'../teacher-class-diary-play.html'),'utf8');
const journey=fs.readFileSync(path.join(__dirname,'../js/class-diary-journey-v1.js'),'utf8');
assert.deepEqual(narrator.validate(),{narrators:3,perspective:'colleague'});
const cases=[['woman','서지윤'],['man','한현우'],['none','윤민서']];
const unique=new Set();
const base=partner=>({
 schoolName:'가상의 초등학교',
 profile:{name:'새봄',experience:'mid',partner},
 stats:{affection:35,trust:42,agency:42,fatigue:35,voice:45,boundary:48,support:67}
});
for(const [partner,narratorName] of cases){
 const opening=narrator.prologue({partner,name:'새봄'});
 assert.equal(opening.narrator,narratorName);
 assert.equal(opening.perspective,'colleague');
 assert(opening.paragraphs.some(p=>p.includes('나는')),'Colleague narrates as I');
 assert(opening.paragraphs.some(p=>p.includes('그 선생님')),'Before player setup, the colleague calls the protagonist an unnamed newcomer');
 assert(!opening.paragraphs.some(p=>p.includes('새봄 선생님')),'The player name must not be assigned before the prologue ends');
 assert(opening.paragraphs.every(p=>!p.includes('{player}')));
 assert(opening.paragraphs.every(p=>p.length>25));
 unique.add(opening.paragraphs.join(''));
 let state=semester.createGame(base(partner));
 for(let episode=1;episode<=36;episode++){
  const view=semester.chapter(state);
  assert.equal(view.perspective,'player','Semester episode '+episode+' is narrated by the player');
  assert.equal(view.narrator,'player');
  assert(view.paragraphs.length>=3);
  state=semester.choose(state,'1');
  assert.equal(state.lastOutcome.perspective,'player','Reflection is player POV');
  state=semester.advance(state);
 }
 assert.equal(state.phase,'semester_ending');
 assert.equal(state.ending.perspective,'player','The ending is player POV');
}
assert.equal(unique.size,3,'Three genuinely different prologues are required');
assert(entry.includes('js/class-diary-narrator-v1.js?v=20261120-pov1'));
assert(entry.includes('function renderNarratorPrologue()'));
assert(entry.includes("const view=narrator.prologue(game.profile);"));
assert(entry.includes("if(storyMode==='semester'&&prologuePending)return renderNarratorPrologue();"));
assert(entry.includes("if(storyMode==='semester'&&prologuePending){prologuePending=false;playerSetupPending=true;render();return;}"));
assert(entry.includes("if(storyMode==='semester'&&playerSetupPending)return renderPlayerSetup();"));
assert(entry.includes("if(storyMode==='semester'&&schoolIntroPending)return renderPrologueSchoolIntroduction();"));
assert(entry.includes("prologuePending=storyMode==='semester';"));
assert(entry.includes("prologuePending=false;schoolIntroPending=false;playerSetupPending=false;render();progressStatus('loaded')"),'Restored sessions should not replay prologue or setup');
assert(entry.includes('<strong>알고 싶은 사람</strong>'),'Selection header');
assert(entry.includes('02 · 알고 싶은 사람'),'Step progress');
assert(entry.includes('<small>프롤로그의 화자</small>'),'Review label');
assert(entry.includes('그 사람의 프롤로그 읽기'),'Submit button');
assert(!entry.includes('<strong>함께할 동료</strong>'),'Retired label must not remain');
assert(journey.includes('알고 싶은 사람 고르기'),'Dynamic step button');
console.log('PASS: 3 colleague narrators, 36 first-person player chapters per route, reflections, endings, and UI transition');
