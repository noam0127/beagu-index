/* Three original adult colleague routes, independent narrative voices, no storage. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const routes=require('../js/class-diary-character-routes-v1.js');
const engine=require('../js/class-diary-play-v1.js');
const director=require('../js/class-diary-director-v1.js');
const kinds=['woman','man','man2','man3','none'],endings=['warm','parallel','steady','tender','ordinary'];
const world={eligible:true,basic:{id:'7972013',name:'검증된 가상학교',scale:'medium'},publishedYears:[2024],numbers:{},geography:{tags:[]}};
const plan={schoolId:world.basic.id,scenes:Array.from({length:7},(_,i)=>({day:i+1,basis:'fictional_general'}))};
function state(kind,day,stats={affection:72,trust:75}){
 const s=engine.createGame(world,plan,{name:'박루다',age:32,experience:'mid',gender:'undisclosed',mbti:'INFP',partner:kind});
 s.day=day;s.stats={...s.stats,...stats};
 return s;
}
assert.deepEqual(Object.keys(routes.CAST),kinds);
for(let day=1;day<=7;day++){
 const unique=new Set();
 for(const kind of kinds){
  const s=state(kind,day);
  const beat=routes.chapterMoment(s);
  assert(typeof beat==='string'&&beat.length>=40);
  assert(!beat.includes('{colleague}'),'Unresolved placeholder');
  unique.add(beat);
  assert(typeof routes.relationshipMoment(s)==='string');
  assert(day<=5?routes.greeting(s).length>15:routes.greeting(s)==='');
  if(day<=5){
   assert(routes.eventMoment(s,{id:'first_day'}).includes('선생님'),'Personalized school episodes');
  }
 }
 assert.equal(unique.size,5,'All 5 characters must have distinct day '+day+' narrative');
}
for(const kind of kinds){
 const s=state(kind,4);
 s.lastOutcome={id:'invite'};
 assert(routes.outcomeMoment(s).length>15,'Unique response for key relationship choices');
 for(const ending of endings){
  s.ending={id:ending};
  assert(routes.endingMoment(s).length>=40,'Unique ending epilogue');
 }
 const chapter=director.decorateChapter(s,world,engine.chapter(s,world,plan));
 assert(chapter.paragraphs.join(' ').includes(routes.chapterMoment(s)),'Route must reach actual game director');
}
assert(routes.relationshipMoment(state('none',5)).includes('민서'),'Platonic route retains an independent, named friendship');
assert.notEqual(routes.relationshipMoment(state('woman',5)),routes.relationshipMoment(state('man',5)));
assert.notEqual(routes.relationshipMoment(state('woman',5,{affection:42,trust:38})),routes.relationshipMoment(state('woman',5)));
const platonic=state('none',7,{affection:100,trust:100,agency:75});
const finished=engine.advance(engine.choose(platonic,'thanks'));
assert(!['warm','tender'].includes(finished.ending.id),
 'Platonic route cannot be forced into romance');
assert.throws(()=>routes.chapterMoment(null),/ROUTE_STATE_REQUIRED/);
const src=fs.readFileSync(path.join(__dirname,'..','js/class-diary-character-routes-v1.js'),'utf8');
assert(!/localStorage|sessionStorage|indexedDB|fetch\(|sendBeacon\(|XMLHttpRequest|WebSocket|Math\.random\(/.test(src),
 'Character dialogue engine cannot save, track, or send data');
console.log('PASS: 5 independent adult characters × 7 days + 5 epilogues, named platonic route, no storage or network');
