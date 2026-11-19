/* Run with Node: node scripts/test-class-diary-narrative.cjs */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=path.join(__dirname,'..');
const catalog=JSON.parse(fs.readFileSync(path.join(base,'data/public-statistics-question-catalog-v1.json'),'utf8'));
global.window=global;
require(path.join(base,'js/2026-questionnaire-options-v1.2.js'));
const source=require(path.join(base,'js/class-diary-narrative-v1.js'));
const blueprint=source.createBlueprint(catalog,global.Beagu2026Questionnaire);
assert.equal(blueprint.coverage.questionCount,128);
assert.deepEqual(blueprint.coverage.byYear,{'2023':14,'2024':14,'2025':50,'2026':50});
assert.equal(blueprint.coverage.unmappedQuestions,0);
assert.equal(blueprint.coverage.metadataIssues.length,0);
assert(blueprint.coverage.subitemCount>50);
for(const e of blueprint.entries){
  assert(e.key&&e.theme&&e.scene.passage&&e.scene.dialogue);
  assert(e.scene.passage.length>15);
  if(e.year!==2026)assert.equal(e.sourcePrecision,'public_label_only');
  if(e.year===2026){
    assert.equal(e.sourcePrecision,'full_2026_metadata');
    assert(e.questionText);
    if(e.responseKind==='grid')assert(e.subitems.length>0&&e.subitems.every(s=>s.choices.length>0));
    if(e.responseKind==='multi')assert(e.subitems.length>0);
  }
}
for(const [year,map] of Object.entries(source.TOPIC_IDS)){
  for(const ids of Object.values(map)){
    for(const id of ids.split(' '))assert(blueprint.entries.some(e=>e.key===year+':'+id));
  }
}
const world={basic:{id:'7972013'},publishedYears:[2023,2024]};
const good={schoolId:'7972013',surveyYear:2024,questionId:'Q05',modeOption:'5점: 자율 구입',
  validResponseRows:20,releaseStatus:'APPROVED_AGGREGATE_ONLY',reviewPolicy:'N10_CELL3_PATTERNS5_STRICT_MATCH',
  annualStatus:'PUBLISHED',privacyReviewed:true};
function count(changes, w=world){
  return source.selectSignals(blueprint,w,[{...good,...changes}]).signals.length;
}
assert.equal(count({}),1);
assert.equal(count({schoolId:'0000000'}),0);
assert.equal(count({surveyYear:2026}),0);
assert.equal(count({validResponseRows:9}),0);
assert.equal(count({validResponseRows:undefined,privacyMinRespondentsMet:true}),1);
assert.equal(count({releaseStatus:'OWNER_AUTHORIZED_CLOSED_CHOICE'}),0);
assert.equal(count({reviewPolicy:'NONE'}),0);
assert.equal(count({annualStatus:'WITHHELD'}),0);
assert.equal(count({privacyReviewed:false}),0);
assert.equal(count({questionId:'Q10'}),0); // sensitive educator-leave topic
assert.equal(count({modeOption:''}),0);
assert.equal(count({surveyYear:2025}),0);
assert.equal(count({surveyYear:2026}, {basic:{id:'7972013'},publishedYears:[2026]}),0); // explicit 2026 manual approval absent
const plan=source.scenePlan(blueprint,world,[good]);
assert.equal(plan.scenes.length,7);
assert(plan.scenes.some(s=>s.basis==='approved_historical_aggregate'));
assert(plan.scenes.some(s=>s.basis==='fictional_general'));
assert(plan.scenes.every(s=>s.note.includes('허구')));
console.log('PASS: 128 questions, '+blueprint.coverage.subitemCount+' verified 2026 subitems, 7-day scene plan, release/privacy gating');
