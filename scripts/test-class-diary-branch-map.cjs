/* 36 episode branches: schema, save compatibility, factual separation. */
'use strict';
const assert=require('node:assert/strict');
const b=require('../js/class-diary-branch-map-v1.js');
assert.deepEqual(b.validate(),{episodes:36,choices:108,echoes:16});
for(let n=1;n<=36;n++){
 const e=b.episode(n);assert.equal(e.choices.length,3);
 for(let c=0;c<3;c++){
  assert.equal(e.choices[c].id,String(c));
  const recorded=b.branch([{episode:n,choice:c}]);
  assert.equal(recorded.chosen[0].episode,n);
  assert.equal(recorded.flags.length,1);
 }
}
assert.equal(b.episode(37),null);
assert.deepEqual(b.branch([]).flags,[]);
assert.equal(b.memories([{episode:14,choice:2}],33)[0].from,14);
assert.match(b.memories([{episode:14,choice:2}],33)[0].text,/계약서/);
assert.equal(b.memories([{episode:14,choice:1}],33)[0].text.includes('협상'),true);
assert.equal(b.memories([{episode:14,choice:0}],33)[0].text.includes('준비'),true);
assert.equal(b.memories([{episode:1,choice:0}],33).length,0);
const approved={numbers:{students:{status:'APPROVED',value:640,referenceYear:2025}},
 categories:{milk_lunch:{status:'APPROVED',value:'실시',referenceYear:2025}}};
const a=b.settingVariant(approved,1);assert.equal(a.scale,'large');
assert.equal(a.facts.students.value,640);
assert.equal(b.settingVariant({numbers:{students:{status:'PENDING',value:8000,referenceYear:2025}}},1).scale,'unknown');
assert.equal(b.schoolContext({},25).missing.includes('milk_lunch'),true);
assert.equal(b.schoolContext(approved,25).facts.milk_lunch.value,'실시');
const h=Array.from({length:36},(_,i)=>({episode:i+1,choice:i%3}));
assert.equal(b.branch(h).chosen.length,36);
assert.equal(b.branch(h).flags.length,36);
const entry=require('node:fs').readFileSync(require('node:path').join(__dirname,'../teacher-class-diary-play.html'),'utf8');
assert(entry.includes('js/class-diary-branch-map-v1.js'),'Approved school branch data is loaded');
assert(entry.includes('sceneDirector.forEpisode(game.episode,view.title,plannedEpisode&&plannedEpisode.title)'),
 'New chapter direction requires an exact manuscript title match');
assert(!entry.includes('branchMap.episode(game.episode).choices.forEach('),'New choice labels must stay opt-in until manuscripts are rewritten');
console.log('PASS: 36 episode maps, 108 choices, '+b.ECHOES.length+' callbacks, approved-only school context, saved history reconstruction');
