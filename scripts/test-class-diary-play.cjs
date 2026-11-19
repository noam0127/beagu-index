/* Run with Node: node scripts/test-class-diary-play.cjs */
'use strict';
const assert=require('node:assert/strict');
const engine=require('../js/class-diary-play-v1.js');
const storyInfo=engine.validateStory();
assert.equal(storyInfo.chapters,7);
assert.equal(storyInfo.choices,21);
assert.equal(engine.createSnapshot,undefined);
assert.equal(engine.restore,undefined);
assert.equal(engine.DAYS.join('|'),
 '2027-03-08|2027-03-09|2027-03-10|2027-03-11|2027-03-12|2027-03-13|2027-03-14');
const world={
 eligible:true,basic:{id:'7972013',name:'가상 테스트 초등학교',scale:'medium'},
 publishedYears:[2024],categories:{},geography:{tags:[]}
};
const plan={schoolId:'7972013',scenes:Array.from({length:7},(_,i)=>({
 day:i+1,basis:i===2?'approved_historical_aggregate':'fictional_general',
 passage:'검증된 과거 집계에 착안한 창작 장면이다.'
}))};
const profile={age:32,gender:'woman',partner:'man',mbti:'INFP'};
assert.throws(()=>engine.createGame({...world,eligible:false},plan,profile),/APPROVED_WORLD_REQUIRED/);
assert.throws(()=>engine.createGame(world,{...plan,schoolId:'0000000'},profile),/VERIFIED_SCENE_PLAN_REQUIRED/);
assert.throws(()=>engine.createGame(world,plan,{...profile,age:17}),/ADULT_AGE_REQUIRED/);
assert.throws(()=>engine.createGame(world,plan,{...profile,mbti:'ZZZZ'}),/MBTI_INVALID/);
let game=engine.createGame(world,plan,profile);
assert.equal(game.day,1);assert.equal(game.phase,'chapter');
assert(engine.chapter(game,world,plan).paragraphs.length>=3);
assert.throws(()=>engine.advance(game),/ADVANCE_PHASE_REQUIRED/);
assert.throws(()=>engine.choose(game,'invalid'),/CHOICE_INVALID/);
const history=[];
for(let day=1;day<=7;day++){
 const chapter=engine.chapter(game,world,plan);
 assert.equal(chapter.day,day);
 assert.equal(chapter.choices.length,3);
 assert.equal(chapter.paragraphs.some(x=>x.includes('{colleague}')),false);
 if(day===3)assert.equal(chapter.source,'historical_fiction');
 game=engine.choose(game,chapter.choices[0].id);
 assert.equal(game.history.length,day);
 assert.equal(game.phase,'reflection');
 assert.throws(()=>engine.choose(game,chapter.choices[0].id),/CHOICE_PHASE_REQUIRED/);
 game=engine.advance(game);
 history.push(chapter.choices[0].id);
 if(day<7)assert.equal(game.day,day+1);
}
assert.equal(game.phase,'ending');assert.equal(game.history.length,7);
assert(game.ending.title.startsWith('나의 '));assert(game.ending.title.endsWith(' 학급일지'));
assert(Number.isInteger(game.ending.affection));
assert(game.ending.score>=0&&game.ending.score<=100);
const fingerprints=new Set();
for(let mask=0;mask<2187;mask++){
 let n=mask,s=engine.createGame(world,plan,profile);
 for(let day=1;day<=7;day++){
  const opts=engine.chapter(s,world,plan).choices;
  const index=n%3;n=Math.floor(n/3);
  s=engine.choose(s,opts[index].id);
  s=engine.advance(s);
 }
 assert.equal(s.phase,'ending');
 assert(s.ending.score>=0&&s.ending.score<=100);
 assert(s.stats.agency>=0&&s.stats.agency<=100);
 fingerprints.add(s.ending.id);
}
assert.equal(fingerprints.size,5,'All five named endings must be reachable');
assert.notDeepEqual(
 engine.chapter(engine.createGame(world,plan,{...profile,age:26}),world,plan).paragraphs,
 engine.chapter(engine.createGame(world,plan,{...profile,age:45}),world,plan).paragraphs,
 'Age must influence narrator voice, not score');
const maleProtagonist=engine.createGame(world,plan,{...profile,gender:'man'});
assert.deepEqual(maleProtagonist.stats,engine.createGame(world,plan,profile).stats,
 'Gender must not change starting scores');
const platonic=engine.createGame(world,plan,{...profile,partner:'none'});
assert.equal(engine.chapter(platonic,world,plan).partner,'동학년 선생님');
console.log('PASS: 7 coherent days / 21 options / all 2187 routes / five reachable endings / ephemeral memory-only state / Lv2-gated world contract');
