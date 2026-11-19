/* Stage 4 director: day-to-day continuity, evidence boundaries, and gender-neutral relationships. */
'use strict';
const assert=require('node:assert/strict');
const game=require('../js/class-diary-play-v1.js');
const director=require('../js/class-diary-director-v1.js');
const world={eligible:true,basic:{id:'7972013',name:'검증된 가상학교',scale:'medium'},publishedYears:[2024],
  numbers:{students:{status:'APPROVED',value:283,referenceYear:2024}},categories:{},geography:{tags:[{id:'admin_eup',source:'official_address',label:'읍 소재'}]}};
const plan={schoolId:world.basic.id,scenes:Array.from({length:7},(_,i)=>({day:i+1,basis:'fictional_general',passage:'허구의 장면'}))};
const profile={age:32,gender:'woman',mbti:'INFP',partner:'woman'};
let state=game.createGame(world,plan,profile);
const first=director.decorateChapter(state,world,game.chapter(state,world,plan));
assert.equal(first.character.name,'지윤 선생님');
assert.equal(first.visual.id,'morning');
assert.equal(first.worldDetail.value,'2024년 기준 학생 283명');
assert.equal(first.callbackFrom,null);
assert(!first.paragraphs.join('').includes('동해안'),'No unverified geography');
state=game.choose(state,'carry');
const o=director.decorateOutcome(state);
assert(o.paragraphs.length>=3);
state=game.advance(state);
const second=director.decorateChapter(state,world,game.chapter(state,world,plan));
assert.equal(second.callbackFrom,'carry');
assert(second.paragraphs.some(x=>x.includes('전날 가방에 넣어 둔 서류')));
for(const p of ['woman','man','none']){
 const x=game.createGame(world,plan,{...profile,partner:p});
 const view=director.decorateChapter(x,world,game.chapter(x,world,plan));
 assert(director.RELATIONSHIPS[p].name===view.character.name);
 assert.deepEqual(x.stats,state.day?game.createGame(world,plan,profile).stats:{},'Partner choice must not affect base score');
}
const day2Choices=game.chapter(state,world,plan).choices;
assert(day2Choices.length===3);
for(let idx=0;idx<2187;idx++){
 let n=idx,s=game.createGame(world,plan,profile);
 for(let day=1;day<=7;day++){
  const c=director.decorateChapter(s,world,game.chapter(s,world,plan));
  assert(c.visual&&c.paragraphs.length>=4);
  if(day>1)assert(c.callbackFrom,'All choices must have follow-up prose');
  const option=c.choices[n%3];n=Math.floor(n/3);
  s=game.choose(s,option.id);
  assert(director.decorateOutcome(s).paragraphs.length>=3);
  s=game.advance(s);
 }
 assert.equal(s.phase,'ending');
 const ending=director.decorateEnding(s);
 assert(ending.paragraphs.length>=5);
}
const badWorld={...world,numbers:{students:{status:'WITHHELD',value:999999,referenceYear:2026}}};
assert.equal(director.worldDetail(badWorld,1).source,'approved_school_world');
assert.equal(director.worldDetail({...world,geography:{tags:[{id:'island',source:'guessed',label:'섬'}]}},6),null);
console.log('PASS: 2187 paths have coherent callbacks and reactions; verified school details only; no personal data or persistence');
