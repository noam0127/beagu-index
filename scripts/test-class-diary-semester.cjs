/* 36-episode Korean fiction integration and branching regression. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const novel=require('../js/class-diary-semester-v1.js');
const {episodes,acts,choices,endingTypes}=novel.validate();
assert.deepEqual([episodes,acts,choices,endingTypes],[36,6,108,5]);
const base=partner=>({
 schoolName:'가상의 초등학교',
 profile:{name:'루다',age:31,partner,experience:'new',gender:'undisclosed',mbti:'INFP'},
 stats:{affection:35,trust:42,agency:42,fatigue:35,voice:45,boundary:48,support:67}
});
function run(partner,pick){
 let state=novel.createGame(base(partner)),seen=[];
 for(let i=1;i<=36;i++){
  assert.equal(state.episode,i);
  assert.equal(state.phase,'semester_chapter');
  const view=novel.chapter(state);
  assert.equal(view.episode,i);
  assert.equal(view.total,36);
  assert.equal(view.choices.length,3);
  assert(view.paragraphs.length>=3);
  assert(view.paragraphs.every(s=>s.length>15));
  assert(view.date.startsWith('2027-'));
  assert(/[가-힣]/.test(view.place)&&!/^[a-z]+$/.test(view.place),
   'Episode '+i+' must expose a Korean place name, not internal scene key: '+view.place);
  assert.equal(view.visual,novel.SCENES[i-1][2],
   'Visual artwork must continue to use the original internal scene key');
  assert.equal(view.act,Math.ceil(i/6));
  assert(view.title.length>=4);
  seen.push(view.title);
  state=novel.choose(state,String(pick(i)));
  assert.equal(state.phase,'semester_reflection');
  assert.equal(state.history.length,i);
  assert(state.lastOutcome.paragraphs.length>=2);
  for(const x of Object.values(state.stats))assert(x>=0&&x<=100);
  state=novel.advance(state);
 }
 assert.equal(state.phase,'semester_ending');
 assert(state.ending.title.startsWith('나의 '));
 assert(state.ending.paragraphs.length>=5);
 assert.equal(new Set(seen).size,36);
 return state;
}
const patterns={
 steady:()=>0,
 tender:()=>1,
 ordinary:()=>2,
 parallel:i=>i<=20?0:1,
 warm:i=>i<=16?0:1
};
const types=new Set();
for(const [expected,pick] of Object.entries(patterns)){
 const story=run('woman',pick);
 assert.equal(story.ending.id,expected,expected+' should remain reachable');
 types.add(story.ending.id);
}
assert.equal(types.size,5);
for(const partner of ['man','none']){
 for(const pick of [patterns.steady,patterns.warm,patterns.ordinary]){
  const story=run(partner,pick);
  if(partner==='none')assert(!['warm','tender'].includes(story.ending.id));
 }
}
let a=novel.createGame(base('woman'));
let b=novel.createGame(base('woman'));
for(let i=1;i<=8;i++){
 a=novel.advance(novel.choose(a,String(i===4?0:1)));
 b=novel.advance(novel.choose(b,String(i===4?2:1)));
}
assert.equal(a.episode,9);
assert.notDeepEqual(novel.chapter(a).paragraphs,novel.chapter(b).paragraphs,
 'The March hallway decision must change the April scene');
const placeCases={2:'학년연구실',4:'학교 복도',5:'회의실',12:'동네 서점',16:'운동장',33:'집',36:'교실'};
for(const [episode,expected] of Object.entries(placeCases)){
 let state=novel.createGame(base('woman'));
 while(state.episode<Number(episode))state=novel.advance(novel.choose(state,'0'));
 assert.equal(novel.chapter(state).place,expected);
}
const raw=fs.readFileSync(require.resolve('../js/class-diary-semester-v1.js'),'utf8');
for(const banned of ['localStorage.setItem','sessionStorage.setItem','indexedDB','fetch(','XMLHttpRequest','navigator.sendBeacon'])
 assert(!raw.includes(banned),'Story engine must never persist or transmit game data: '+banned);
const page=fs.readFileSync(require('node:path').join(__dirname,'../teacher-class-diary-play.html'),'utf8');
for(const marker of ['id="semesterStart"','src="js/class-diary-semester-v1.js?v=20261120"',"semester.createGame(baseGame)","if(storyMode==='semester')return renderSemester()","semester.advance(game)"])
 assert(page.includes(marker),'Semester UI connection missing '+marker);
for(const englishLabel of ['PROLOGUE 00','PLAYER SETUP','MY STORY','STORY · 나의 학급일지','END CREDITS'])
 assert(!page.includes(englishLabel),'Untranslated game UI label: '+englishLabel);
for(const label of ['주인공 설정','나의 이야기','이야기 · 나의 학급일지','제작진'])
 assert(page.includes(label),'Korean game UI label missing: '+label);
console.log('PASS: 36 chapters show Korean places, internal artwork codes stay unchanged, UI labels Korean, five endings, no persistence');
