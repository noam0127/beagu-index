/* Multiple incidents per day, teacher solidarity/hostility, no storage or real-event claims. */
'use strict';
const assert=require('node:assert/strict');
const game=require('../js/class-diary-play-v1.js');
const scenario=require('../js/class-diary-scenario-v1.js');
const incidents=require('../js/class-diary-incidents-v1.js');
const demo=require('../js/class-diary-demo-v1.js');
const {world:demoWorld,plan:demoPlan}=demo.createDemo();
const profile={age:36,gender:'woman',partner:'woman',mbti:'INFP',
  experience:'senior',duty:'academic',classTone:'demanding',workCulture:'collaborative',
  gradeBand:'lower',storyRegion:'urban',fictionalSchoolSize:'large'};
const base=incidents.validate();
assert(base.events>=12&&base.choices>=36,'There must be many original, meaningful incidents.');
function make(overrides={}, world=demoWorld, plan=demoPlan){
  return game.createGame(world,plan,{...profile,...overrides});
}
function goToDay(state,day){
  // Purely for schedule inspection: no user-visible progress or history gets saved.
  const x=JSON.parse(JSON.stringify(state));x.day=day;return x;
}
const happy=make();
const hostile=make({workCulture:'deflecting'});
const rural=make({storyRegion:'rural',fictionalSchoolSize:'small'});
assert(incidents.schedule(happy,demoWorld).includes('parking'));
assert(incidents.schedule(happy,demoWorld).includes('arrival'));
assert(incidents.schedule(happy,demoWorld).includes('focus'));
assert(incidents.schedule(goToDay(happy,2),demoWorld).includes('seat_song'));
assert(incidents.schedule(goToDay(happy,2),demoWorld).includes('break_clean'));
assert(incidents.schedule(goToDay(happy,2),demoWorld).includes('shared_break'));
assert(incidents.schedule(goToDay(hostile,2),demoWorld).includes('hostile_break'));
assert(incidents.schedule(goToDay(happy,4),demoWorld).includes('shared_meeting'));
assert(incidents.schedule(goToDay(hostile,4),demoWorld).includes('hostile_meeting'));
assert(incidents.schedule(goToDay(happy,5),demoWorld).includes('barbecue'));
assert(incidents.schedule(goToDay(hostile,5),demoWorld).includes('friendship_chair'));
assert(incidents.schedule(goToDay(rural,3),demoWorld).includes('wildlife'));
assert(!incidents.schedule(goToDay(rural,1),demoWorld).includes('parking'));
assert(!incidents.schedule(goToDay(rural,5),demoWorld).includes('friendship_chair'));
assert(!incidents.schedule(goToDay(make({...profile,gradeBand:'upper'}),2),demoWorld).includes('seat_song'));
assert(incidents.schedule(goToDay(make({...profile,workCulture:'deflecting',fictionalSchoolSize:'small'}),5),demoWorld).length===0);
// One day can include multiple incidents, each with a full 3-way decision.
for(const workCulture of ['collaborative','deflecting']){
 const start=make({workCulture,storyRegion:workCulture==='collaborative'?'rural':'urban'});
 for(let day=1;day<=7;day++){
  const ready=goToDay(start,day);
  for(const id of incidents.schedule(ready,demoWorld)){
   const event=incidents.INCIDENTS[id];
   assert(event.choices.length===3,'Every incident needs meaningful choices');
   assert(event.prose.length>=2);
   for(const choice of event.choices){
    assert(choice.reply.length>=2);
    assert(Object.keys(choice.delta).every(key=>Object.hasOwn(ready.stats,key)));
    assert(!/localStorage|sessionStorage|학교\s*확정\s*사건/.test(choice.label));
   }
  }
 }
}
function complete(overrides={}){
 let s=make(overrides);
 for(let day=1;day<=7;day++){
  assert.equal(s.day,day);
  let steps=0;
  while(true){
   const incident=incidents.next(s,demoWorld);
   if(incident){
    if(incident.result){s=incidents.continueStory(s);continue;}
    s=incidents.choose(s,demoWorld,incident.choices[0].id);
    assert.equal(s.incidentReflection.id,incident.id);
    assert.equal(incidents.next(s,demoWorld).result.day,day);
    if(++steps>8)throw Error('Infinite multi-event day');
    continue;
   }
   const sc=scenario.scene(s,demoWorld);
   if(sc){
    if(sc.result){s=scenario.continueStory(s);continue;}
    s=scenario.choose(s,sc.choices[0].id,demoWorld);
    continue;
   }
   const chapter=game.chapter(s,demoWorld,demoPlan);
   s=game.choose(s,chapter.choices[0].id);
   s=game.advance(s);
   break;
  }
 }
 assert.equal(s.phase,'ending');
 return s;
}
const x=complete({workCulture:'collaborative',storyRegion:'rural'});
const y=complete({workCulture:'deflecting',storyRegion:'urban'});
assert(x.incidentEvents.length>8);
assert(y.incidentEvents.length>8);
assert(x.incidentEvents.some(e=>e.id==='shared_break'));
assert(x.incidentEvents.some(e=>e.id==='shared_meeting'));
assert(x.incidentEvents.some(e=>e.id==='barbecue'));
assert(y.incidentEvents.some(e=>e.id==='hostile_break'));
assert(y.incidentEvents.some(e=>e.id==='hostile_meeting'));
assert(y.incidentEvents.some(e=>e.id==='friendship_chair'));
assert(x.stats.support>y.stats.support,'Mutual support must translate to a higher sense of support in otherwise similar fictional work');
assert(x.stats.fatigue<y.stats.fatigue,'Same work, less isolation -> lower narrative fatigue');
for(const s of [x,y]){
 assert(s.ending.title.startsWith('나의 '));
 for(const score of Object.values(s.stats))assert(score>=0&&score<=100);
}
const fakeReal={...demoWorld,mode:'real_approved',publishedYears:[2024],
  basic:{...demoWorld.basic,id:'7972013',name:'개별 시험학교',scale:'large'},
  numbers:{students:{status:'APPROVED',value:1000,referenceYear:2024}},
  geography:{tags:[{id:'admin_eup',source:'official_address',label:'읍 소재'}]}};
const realPlan={...demoPlan,schoolId:'7972013'};
const real=make({workCulture:'deflecting'},fakeReal,realPlan);
const list=incidents.schedule(goToDay(real,5),fakeReal);
assert(list.includes('friendship_chair'));
const fictionalHostility=incidents.next(goToDay(real,5),fakeReal);
assert(fictionalHostility.paragraphs.join('').includes('실제 친목회 관행을 알려 주는 자료는 아니며'));
const withheld={...fakeReal,numbers:{students:{status:'WITHHELD',value:1500,referenceYear:2024}}};
const noFact=incidents.next(goToDay(real,5),withheld);
assert(noFact===null||!noFact.paragraphs.join('').includes('공개 승인 학생 수'),
 'Withheld official facts must not be displayed, and omission of the event is permitted');
const src=require('node:fs').readFileSync(require('node:path').join(__dirname,'..','js/class-diary-incidents-v1.js'),'utf8');
assert(!/localStorage|sessionStorage|fetch\(|sendBeacon\(/.test(src));
console.log('PASS: multi-events/day, staff solidarity vs hostility, geography, school size, boundaries, privacy and 7-day completion');
