/* School culture events, fictional-only conditions and school facts release gate. */
'use strict';
const assert=require('node:assert/strict');
const game=require('../js/class-diary-play-v1.js');
const scenario=require('../js/class-diary-scenario-v1.js');
const world={
 eligible:true,basic:{id:'7972013',name:'테스트 초등학교',scale:'medium'},
 publishedYears:[2024],numbers:{students:{status:'APPROVED',value:320,referenceYear:2024},
 teachers:{status:'APPROVED',value:28,referenceYear:2024},
 classes:{status:'APPROVED',value:13,referenceYear:2024},
 junior_teacher_ratio:{status:'WITHHELD',value:99,referenceYear:2024}},categories:{},geography:{tags:[]}
};
const plan={schoolId:'7972013',scenes:Array.from({length:7},(_,i)=>({day:i+1,basis:'fictional_general'}))};
const base={age:28,gender:'woman',partner:'woman',mbti:'INTJ',
 experience:'new',duty:'academic',classTone:'demanding',workCulture:'deflecting'};
assert(scenario.officialFacts(world).some(f=>f.key==='students'));
assert(!scenario.officialFacts(world).some(f=>f.key==='junior_teacher_ratio'));
assert(scenario.officialContext?scenario.officialContext(world,1):true);
const fixture={...world,mode:'public_fiction_demo',numbers:undefined};
const test=game.createGame(world,plan,base);
const first=scenario.scene(test,world);
assert(first.paragraphs.join(' ').includes('등교한 지'));
assert(first.paragraphs.join(' ').includes('교무'));
assert(first.paragraphs.join(' ').includes('확인된 학교 상세정보:'));
assert.equal(first.choices.length,3);
assert.equal(first.source,'fictional_scenario');
const dutyNone=scenario.scene(game.createGame(world,plan,{...base,duty:'none'}),world);
assert(dutyNone.paragraphs.join(' ').includes('별도 업무가 배정되지 않았다'));
const toneMild=scenario.scene(game.createGame(world,plan,{...base,classTone:'steady'}),world);
assert(!toneMild.paragraphs[0].includes('목소리가 겹쳤다'));
const demoWorld={eligible:true,mode:'public_fiction_demo',basic:{id:'DEMO001',name:'가상의 초등학교'},
 publishedYears:[],numbers:{students:{status:'APPROVED',value:500,referenceYear:2024}},categories:{}};
const demoPlan={schoolId:'DEMO001',scenes:Array.from({length:7},(_,i)=>({day:i+1,basis:'fictional_general'}))};
const demoGame=game.createGame(demoWorld,demoPlan,base);
const text=scenario.scene(demoGame,demoWorld).paragraphs.join(' ');
assert(!text.includes('확인된 학교 상세정보:'),'Demo never displays official facts');

/* 2026 조사 취지: 동료 협력과 교직원 적대는 같은 업무량이라도 다른 경험이다. */
const supportiveProfile={...base,workCulture:'collaborative'};
const hostileProfile={...base,workCulture:'hostile'};
const supportive=game.createGame(world,plan,supportiveProfile);
const hostile=game.createGame(world,plan,hostileProfile);
assert(supportive.stats.support>hostile.stats.support);
assert(scenario.scene(supportive,world).paragraphs.some(x=>x.includes('동의서')));
assert(scenario.scene(hostile,world).paragraphs.some(x=>x.includes('왜 벌써 시끄러워요')));
assert(scenario.STAFF_MOOD.hostile&&scenario.STAFF_MOOD.collaborative);
assert.equal(scenario.scene(hostile,world).choices.length,3);
let aided=scenario.choose(supportive,'protect',world);
let isolated=scenario.choose(hostile,'protect',world);
assert(aided.stats.support>isolated.stats.support);
assert(aided.storyReflection.paragraphs.some(x=>x.includes('같이 해요')));
assert(isolated.storyReflection.paragraphs.some(x=>x.includes('같이 확인')));
let unheard=scenario.choose(hostile,'endure',world);
assert(unheard.stats.support<isolated.stats.support);
function finishOneWeek(first,school){
 let st=first;
 for(let day=1;day<=7;day++){
  if(day<=5){
   const event=scenario.scene(st,school);
   if(event){
    st=scenario.choose(st,event.choices[0].id,school);
    st=scenario.continueStory(st);
   }
  }
  st=game.choose(st,game.chapter(st,school,plan).choices[0].id);
  st=game.advance(st);
 }
 return st;
}
const director=require('../js/class-diary-director-v1.js');
const goodEnding=director.decorateEnding(finishOneWeek(game.createGame(world,plan,supportiveProfile),world));
const hardEnding=director.decorateEnding(finishOneWeek(game.createGame(world,plan,hostileProfile),world));
assert(goodEnding.paragraphs.join(' ').includes('함께 만드는 학교'));
assert(hardEnding.paragraphs.join(' ').includes('서로를 경계하는 학교'));
for(const grade of ['lower','middle','upper']){
 const first=game.createGame(world,plan,{...supportiveProfile,gradeBand:grade});
 assert(scenario.scene(first,world).paragraphs.some(x=>x.includes('배움터지킴이')));
}

const endings=new Set();
for(let n=0;n<243;n++){
 let code=n,s=game.createGame(world,plan,base);
 for(let day=1;day<=7;day++){
  if(day<=5){
   const event=scenario.scene(s,world);
   assert(event&&event.choices.length===3);
   const pick=event.choices[code%3];code=Math.floor(code/3);
   const old=s.stats.voice;
   s=scenario.choose(s,pick.id);
   assert(s.stats.voice!==old||pick.id==='helpbrief','Scenario impacts voice');
   assert.equal(s.storyEvents.length,day);
   assert.equal(scenario.scene(s,world).result.day,day);
   s=scenario.continueStory(s);
   assert.equal(scenario.scene(s,world),null);
  }
  const chapter=game.chapter(s,world,plan);
  const preferred=chapter.choices[(day-1)%3];
  s=game.choose(s,preferred.id);
  s=game.advance(s);
 }
 assert.equal(s.phase,'ending');
 assert.equal(s.storyEvents.length,5);
 endings.add(s.ending.id);
}
for(const name of ['소중한','든든한','씩씩한','설레는','서툰']){
 assert(Object.values(game.ENDINGS).some(e=>e.title==='나의 '+name+' 학급일지'),'Korean ending missing '+name);
}
assert(!JSON.stringify(scenario).includes('localStorage'));
console.log('PASS: 243 varied school incident routes, fictional school cultures, approved stats, natural Korean endings, no storage');
