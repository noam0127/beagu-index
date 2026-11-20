'use strict';
/* Full literary edition integration; deterministic, no network or student data. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const novel=require('../js/class-diary-semester-v1.js');
const prose=require('../js/class-diary-literary-v3.js');
const philosophy=require('../js/class-diary-philosophy-v1.js');
const endings=require('../js/class-diary-endings-v3.js');
const html=fs.readFileSync(path.join(__dirname,'../teacher-class-diary-play.html'),'utf8');
assert.deepEqual(prose.validate(),{episodes:36,seedPayoffLinks:66,acts:6});
assert.deepEqual(philosophy.validate(),{branches:14,options:2});
assert.deepEqual(endings.validate(),{types:5,partners:5,careerOrigins:3,worldviews:2});
assert(html.includes('id="heroPedagogy"'));
for(const p of ['value="field"','value="theory"'])assert(html.includes(p));
for(const name of ['class-diary-literary-v3.js','class-diary-philosophy-v1.js','class-diary-endings-v3.js'])
 assert(html.includes(name),'Required story module absent from HTML: '+name);
const stat={affection:35,trust:42,agency:42,fatigue:35,voice:45,boundary:48,support:67};
const roles=['woman','man','none','man2','man3'];
let routes=0;
for(const partner of roles)for(const experience of ['new','mid','senior'])for(const education of ['field','theory']){
 const profile={name:'가람',partner,experience,pedagogy:education,gender:'undisclosed'};
 let state=novel.createGame({schoolName:'장미초등학교',profile,stats:stat});
 const first=novel.chapter(state);
 assert.equal(first.date,'2027-03-02');
 assert(first.paragraphs[0].includes('3월 1일')||first.paragraphs[0].includes('3월 1일 오후'));
 assert(first.paragraphs[0].includes(experience==='new'?'임용시험':experience==='mid'?'육아':'명예퇴직'));
 for(let e=1;e<=36;e++){
  const view=novel.chapter(state);
  assert.equal(view.narrator,'player');
  assert(view.paragraphs.join('').length>=1400,'Scene '+e+' must contain literary narrative');
  for(const line of prose.get(e).lines)assert(view.paragraphs.includes(line),'Deep revised scene absent: '+e);
  const pov=philosophy.moment(e,education);
  if(pov)assert(view.paragraphs.includes(pov),'Selected educational value not reflected: '+e);
  if(e===10)assert(view.paragraphs.join('').includes('민재'));
  if(e===17)assert(view.paragraphs.join('').includes('도겸'));
  if(e===29)assert(view.paragraphs.join('').includes('윤아'));
  assert.equal(view.choices.length,3);
  state=novel.choose(state,String(e%3));
  assert.equal(state.lastOutcome.paragraphs.length,2);
  state=novel.advance(state);
 }
 assert.equal(state.phase,'semester_ending');
 assert(state.ending.paragraphs.length>=6);
 assert(state.ending.paragraphs.join('').includes(education==='theory'?'개념':'현장'));
 routes++;
}
for(const kind of ['warm','parallel','steady','tender','ordinary'])for(const partner of roles){
 const v=endings.compose(kind,{partner,experience:'mid',pedagogy:'field'},[]);
 assert(v.length>=6&&v[2].length>=110);
}
assert(prose.SCENES.every((s,i)=>s.n===i+1&&s.returns.every(n=>n>s.n&&n<=36)));
const firstText=novel.chapter(novel.createGame({schoolName:'장미초등학교',profile:{name:'가람',partner:'none',experience:'mid',pedagogy:'field'},stats:stat})).paragraphs.join('');
assert(firstText.includes('파란 실')&&firstText.includes('배구공'),'The new five-person ensemble must appear in the first act');
console.log('PASS: '+routes+' full 36-chapter routes, 14 educational branches, 66 seed/payoff links and 5 earned endings');
