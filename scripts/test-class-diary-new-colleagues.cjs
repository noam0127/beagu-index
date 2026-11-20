/* Male colleague 2 and 3: casting, prologue, full semester, privacy regression. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const dogyeom=require('../js/class-diary-colleague-dogyeom-v1.js');
const taeo=require('../js/class-diary-colleague-taeo-v1.js');
const narrator=require('../js/class-diary-narrator-v1.js');
const novel=require('../js/class-diary-semester-v1.js');
const routes=require('../js/class-diary-character-routes-v1.js');
const {RELATIONSHIPS}=require('../js/class-diary-director-v1.js');
const inputs=[
 {id:'man2',name:'차도겸',module:dogyeom,hobby:'실뜨기',min:17},
 {id:'man3',name:'백태오',module:taeo,hobby:'배구',min:19}
];
const page=fs.readFileSync(path.join(__dirname,'../teacher-class-diary-play.html'),'utf8');
for(const person of inputs){
 const profile={partner:person.id,name:'새봄',experience:'mid',gender:'undisclosed'};
 assert.equal(person.module.CHARACTER.name,person.name);
 assert.equal(person.module.CHARACTER.hobby,person.hobby);
 assert(person.module.validate().scenes>=person.min);
 const opening=narrator.prologue(profile);
 assert.equal(opening.perspective,'colleague');
 assert.equal(opening.narrator,person.name);
 assert(opening.paragraphs.some(x=>x.includes('나는')));
 assert(opening.paragraphs.every(x=>!x.includes('새봄')));
 assert.equal(routes.CAST[person.id].realName,person.name);
 assert(RELATIONSHIPS[person.id].name.includes(person.name.slice(1)));
 assert(page.includes('data-partner-choice="'+person.id+'"'));
 assert(page.includes('<option value="'+person.id+'">'));
 const characters=[...page.matchAll(/<script\s+src="([^"]+)"/g)].map(x=>x[1]);
 assert(characters.some(x=>x.includes('class-diary-colleague-'+(person.id==='man2'?'dogyeom':'taeo')+'-v1.js')));
 let state=novel.createGame({
  schoolName:'가상의 초등학교',profile,
  stats:{affection:35,trust:42,agency:42,fatigue:35,voice:45,boundary:48,support:67}
 });
 let appearances=0;
 for(let episode=1;episode<=36;episode++){
  const view=novel.chapter(state);
  assert.equal(view.perspective,'player');
  assert.equal(view.episode,episode);
  assert.equal(view.choices.length,3);
  if(person.module.moment(episode)){
   appearances++;
   assert(view.paragraphs.includes(person.module.moment(episode)),
    person.name+' scene '+episode+' must be included unchanged');
  }
  state=novel.advance(novel.choose(state,'1'));
 }
 assert.equal(appearances,person.module.validate().scenes);
 assert.equal(state.phase,'semester_ending');
 assert.equal(state.ending.perspective,'player');
}
for(const file of ['../js/class-diary-colleague-dogyeom-v1.js','../js/class-diary-colleague-taeo-v1.js']){
 const source=fs.readFileSync(path.join(__dirname,file),'utf8');
 for(const forbidden of ['localStorage','sessionStorage','indexedDB','fetch(','XMLHttpRequest','WebSocket'])
  assert(!source.includes(forbidden),'Standalone cast narrative cannot persist or send personal data');
}
console.log('PASS: two new colleagues, five narrator paths, 17+19 recurring scenes, complete 36-chapter and no-storage checks');
