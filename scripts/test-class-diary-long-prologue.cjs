/* Five fully authored prologues, a clean POV handoff and the entire contract-teacher timeline. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const narrator=require('../js/class-diary-narrator-v1.js');
const semester=require('../js/class-diary-semester-v1.js');
const universe=require('../js/class-diary-universe-v1.js');
const pedagogy=require('../js/class-diary-pedagogy-v1.js');
const scenes=require('../js/class-diary-prologue-scenes-v1.js');
const page=fs.readFileSync(path.join(__dirname,'../teacher-class-diary-play.html'),'utf8');
assert.deepEqual(narrator.validate(),{narrators:5,perspective:'colleague',longPrologue:true});
assert.deepEqual(universe.validate(),{cast:5,episodes:36,principle:'no_foreshadow_without_payoff'});
assert.equal(scenes.validate().scenes,12);
assert.equal(pedagogy.validate().scenes,16);
const roles=[
 {id:'woman',name:'서지윤',hobby:'베이스'},
 {id:'man',name:'한현우',hobby:'논어'},
 {id:'none',name:'윤민서',hobby:'중식'},
 {id:'man2',name:'차도겸',hobby:'실뜨기'},
 {id:'man3',name:'백태오',hobby:'배구'}
];
const allText=new Set();
for(const role of roles){
 const scene=narrator.prologue({partner:role.id,name:'한가람'});
 const text=scene.paragraphs.join('');
 assert.equal(scene.narrator,role.name);
 assert.equal(scene.perspective,'colleague');
 assert.equal(scene.paragraphs.length,52);
 assert(text.length>=10000,role.name+' must have a twentyfold prologue');
 assert(text.includes('3월 1일')&&text.includes('3월 2일'),'Prologue must cover both dates');
 assert(text.includes(role.hobby),role.name+' hobby must shape the viewpoint');
 assert(!text.includes('한가람'),'Prologue must not know the future player name');
 assert(!scene.paragraphs.some(x=>x.includes('{player}')));
 allText.add(text);
 assert(page.includes('data-partner-choice="'+role.id+'"'));
 assert(page.includes('<option value="'+role.id+'">'));
}
assert.equal(allText.size,5,'Each colleague needs an independent voice');
for(const filename of ['class-diary-prologue-scenes-v1.js',...roles.map(x=>'class-diary-prologue-lens-'+x.id+'-v1.js'),'class-diary-pedagogy-v1.js']){
 assert(page.includes('js/'+filename),'Browser must load new prose module '+filename);
}
assert(page.includes("2027년 3월 2일 · '+view.place"),'The prologue date must match school opening');
for(const s of ['임용시험 준비 중','육아 중','명예퇴직 후 여행 중','3학년 장미반'])assert(page.includes(s));
const stats={affection:35,trust:42,agency:42,fatigue:35,voice:45,boundary:48,support:67};
for(const career of ['new','mid','senior']){
 let state=semester.createGame({schoolName:'가상장미초',profile:{name:'한가람',partner:'man3',gender:'undisclosed',experience:career},stats});
 const initial=semester.chapter(state);
 assert.equal(initial.date,'2027-03-02');
 assert.equal(initial.perspective,'player');
 assert(initial.paragraphs[0].includes('교감'));
 const origin=career==='new'?'임용시험':career==='mid'?'육아':'명예퇴직';
 assert(initial.paragraphs[0].includes(origin),'Career must affect phone scene: '+career);
 for(let i=1;i<=36;i++){
  const view=semester.chapter(state);
  assert(view.paragraphs.length>=7&&view.paragraphs.join('').length>=780);
  if(pedagogy.moment(i))assert(view.paragraphs.includes(pedagogy.moment(i)));
  state=semester.advance(semester.choose(state,'1'));
 }
 assert.equal(state.phase,'semester_ending');
 assert.equal(state.ending.perspective,'player');
}
console.log('PASS: 5 colleague long prologues ≥10000 chars, 36 player chapters, March 1/2 chronology, 16 education-value scenes and full routes');
