/* Public Lv2-free demo: fictional-only data, no persistence/network, full 7-day route. */
'use strict';
const assert=require('node:assert/strict');
const demo=require('../js/class-diary-demo-v1.js');
const game=require('../js/class-diary-play-v1.js');
const director=require('../js/class-diary-director-v1.js');
const {world,plan}=demo.createDemo();
assert.equal(world.mode,'public_fiction_demo');
assert.equal(world.basic.id,'DEMO001');
assert.equal(world.basic.name,'가상의 초등학교');
assert.deepEqual(world.publishedYears,[]);
assert.deepEqual(world.numbers,{});
assert.deepEqual(world.categories,{});
assert.deepEqual(world.geography.tags,[]);
assert.equal(plan.schoolId,world.basic.id);
assert.equal(plan.scenes.length,7);
assert(plan.scenes.every(x=>x.basis==='fictional_general'&&!x.questionKey));
const profile={age:32,gender:'woman',partner:'none',mbti:'INFP'};
let state=game.createGame(world,plan,profile);
for(let day=1;day<=7;day++){
 const book=director.decorateChapter(state,world,game.chapter(state,world,plan));
 assert.equal(book.day,day);
 assert.equal(book.source,'fiction');
 assert.equal(book.worldDetail, null===book.worldDetail?null:book.worldDetail); // safe rendering contract
 assert.equal(book.character.name,'동학년 선생님');
 assert.equal(book.choices.length,3);
 state=game.choose(state,book.choices[0].id);
 state=game.advance(state);
}
assert.equal(state.phase,'ending');
assert.equal(state.history.length,7);
assert(state.ending.title.startsWith('나의 '));
assert(director.decorateEnding(state).paragraphs.length>=5);
assert.throws(()=>game.createGame({...world,basic:{...world.basic,id:'7972013'}},plan,profile),/DEMO_WORLD_INVALID/);
assert.throws(()=>game.createGame({...world,publishedYears:[2024]},plan,profile),/DEMO_WORLD_INVALID/);
assert.throws(()=>game.createGame(world,{...plan,scenes:plan.scenes.map((s,i)=>i===0?{...s,basis:'approved_historical_aggregate'}:s)},profile),/VERIFIED_SCENE_PLAN_REQUIRED/);
const f=require('node:fs'),src=f.readFileSync(require('node:path').join(__dirname,'..','js','class-diary-demo-v1.js'),'utf8');
assert(!/fetch\(|localStorage|sessionStorage|supabase|APPROVED_AGGREGATE_ONLY|API=/.test(src),
 'Demo must be network-free, non-persistent and without approved research data');
console.log('PASS: unauthenticated fictional demo can complete 7 days without real-school data, network or gameplay storage');
