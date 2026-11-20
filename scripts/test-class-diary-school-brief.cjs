/* School introduction: show verified public facts only and require player setup after prologue. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const card=require('../js/class-diary-school-brief-v1.js');
const narrator=require('../js/class-diary-narrator-v1.js');
const semester=require('../js/class-diary-semester-v1.js');
const selection={id:'TEST001',name:'행복초등학교',region:'부산광역시',years:[2023,2026]};
const world={eligible:true,basic:{id:'TEST001',name:'행복초등학교',office:'가상교육지원청',address:'부산광역시 가상로 10'},
 numbers:{students:{status:'APPROVED',value:243,referenceYear:2025},
 teachers:{status:'APPROVED',value:17,referenceYear:2025},
 classes:{status:'APPROVED',value:12,referenceYear:2025}}};
const info=card.summarize(selection,world);
assert.equal(info.name,'행복초등학교');
assert.equal(info.verified,true);
for(const label of ['학교명','지역','공개 조사연도','교육지원청','학교 소재지','학생 수','교원 수','학급 수'])
 assert(info.facts.some(f=>f.label===label),label+' must be shown');
const students=info.facts.find(x=>x.label==='학생 수');
assert.equal(students.value,'243명');assert.equal(students.year,2025);
assert.deepEqual(card.summarize(selection,null).facts.map(x=>x.label),
 ['학교명','지역','공개 조사연도']);
assert.equal(card.summarize(selection,{...world,basic:{...world.basic,id:'OTHER001'}}).verified,false);
assert(!card.summarize(selection,{...world,numbers:{students:{status:'PENDING',value:999,referenceYear:2025}}})
 .facts.some(x=>x.label==='학생 수'),'Unapproved source data must not render');
assert(!card.summarize(selection,{...world,numbers:{students:{status:'APPROVED',value:3,referenceYear:2027}}})
 .facts.some(x=>x.label==='학생 수'),'Fictional present/future year is not a current public statistic');
assert.equal(narrator.prologue({partner:'woman',name:'가람'}).paragraphs.join(''),
 narrator.prologue({partner:'woman',name:'새봄'}).paragraphs.join(''),
 'Prologue must not know a player name selected after it');
const base={schoolName:'행복초등학교',
 profile:{name:'새봄',gender:'undisclosed',experience:'mid',partner:'woman'},
 stats:{affection:35,trust:42,agency:42,fatigue:35,voice:45,boundary:48,support:67}};
let game=semester.createGame(base);
game={...game,profile:{...game.profile,name:'가람',experience:'new',gender:'female'}};
const view=semester.chapter(game);
assert.equal(game.episode,1);assert.equal(game.profile.name,'가람');
assert(view.paragraphs[0].includes('임용시험 공부'),'Low-career branch must start with the March 1 principal call during teacher recruitment studies');
assert.equal(game.profile.employment,'fixed_term');
const html=fs.readFileSync(path.join(__dirname,'../teacher-class-diary-play.html'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'../styles/class-diary-player-flow-v1.css'),'utf8');
for(const id of ['playerSetup','playerSetupForm','heroName','heroExperience','heroGender','diaryPrologueSchool','diaryPrologueSchoolTitle','diaryPrologueSchoolFacts','diaryPrologueSchoolContinue'])
 assert(html.includes('id="'+id+'"'),'Required UI missing '+id);
assert(html.includes('js/class-diary-school-brief-v1.js?v=20261120-a1'));
assert(html.includes('styles/class-diary-player-flow-v1.css?v=20261120-a1'));
assert(html.includes('function renderPrologueSchoolIntroduction()'));
assert(html.includes('function renderPlayerSetup()'));
assert(html.includes("if(storyMode==='semester'&&schoolIntroPending)return renderPrologueSchoolIntroduction();"));
assert(html.includes("if(storyMode==='semester'&&playerSetupPending)return renderPlayerSetup();"));
assert(html.includes("prologuePending=false;playerSetupPending=true;render();return;"),
 'Finishing prologue must show player setup, not episode 1');
assert(html.includes('playerSetupPending=false;\n sound.note(\'pageTurn\');\n render();autoSaveProgress();'));
assert(html.includes("!prologuePending&&!schoolIntroPending&&!playerSetupPending"));
assert(css.includes('diary-player-config')&&css.includes('diary-prologue-school-screen'));
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).filter(Boolean);
for(const script of scripts)new Function(script);
console.log('PASS: school facts grounded by approved data; post-prologue protagonist form; first episode respects player career; page syntax');
