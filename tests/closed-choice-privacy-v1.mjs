import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {historicalChoice,filterEdited2026Results} from '../supabase/functions/_shared/closed-choice-privacy.mjs';
import {catalog} from '../supabase/functions/_shared/questionnaire-2026.mjs';
const canary='SYNTHETIC_PRIVATE_OTHER_TEXT';
const context=vm.createContext({window:{}});
for(const f of ['historical-questionnaire-choices','2025-observed-choices','2026-questionnaire-options-v1.2','2026-approved-question-results'])vm.runInContext(fs.readFileSync('js/'+f+'.js','utf8'),context);
for(const year of [2023,2024,2025]){
 for(const [id,choices] of Object.entries(context.window.BeaguHistoricalQuestionnaire[year])){
  for(const v of choices){assert.equal(historicalChoice(year,id,v),v);assert.equal(context.window.BeaguHistoricalClosedChoice(year,id,v),v);}
  assert.equal(historicalChoice(year,id,canary),null);
  assert.equal(context.window.BeaguHistoricalClosedChoice(year,id,canary),null);
 }
}
assert.equal(historicalChoice(2025,'Q03',canary),null);
assert.equal(Object.keys(context.window.Beagu2025ObservedChoices).length,0);
const input=[{questionId:'Q01',row:-1,values:[catalog.Q01.options[0],canary],extra:canary},{questionId:'Q31',row:-1,values:[canary]},{questionId:'Q51',row:-1,values:[canary]}];
const output=filterEdited2026Results(input);
assert.deepEqual(output,[{questionId:'Q01',row:-1,values:[catalog.Q01.options[0]]}]);
assert.equal(JSON.stringify(context.window.Beagu2026ApprovedResults.summary(input)).includes(canary),false);
assert.equal(JSON.stringify(context.window.Beagu2026ApprovedResults.summary(input)).includes(catalog.Q01.options[0]),true);
for(const f of ['js/level-search.js','js/statistics-compare.js','school-report.html'])assert.match(fs.readFileSync(f,'utf8'),/BeaguHistoricalClosedChoice/);
console.log('PASS closed-choice allowlist, synthetic other, Q31/Q51, server/browser parity');

assert.equal(historicalChoice(2025,'Q01','1 그런 일이 존재한다는 게 믿을 수 없다'),'① 그런 일이 존재한다는 게 믿을 수 없다');
assert.equal(historicalChoice(2025,'Q01','① SYNTHETIC_PRIVATE_OTHER_TEXT'),null);
assert.equal(historicalChoice(2025,'Q01','①'),null);

// Independently documented checkbox calculations (2025 source workbook, rows 2 and 21).
assert.equal(context.window.BeaguHistoricalQuestionnaire['2025'].Q03.length,16);
assert.equal(context.window.BeaguHistoricalQuestionnaire['2025'].Q04.length,9);
assert.equal(historicalChoice(2025,'Q03','교과서 구입'),'교과서 구입');
assert.equal(historicalChoice(2025,'Q04','운동회'),'운동회');
assert.equal(historicalChoice(2025,'Q04','운동회, SYNTHETIC_PRIVATE_OTHER_TEXT'),null);

// Final 2025 questionnaire PDF, not the response-derived catalogue.
const final25=context.window.BeaguHistoricalQuestionnaire['2025'];
assert.equal(Object.keys(final25).length,50);
assert.equal(Object.entries(final25).filter(([id])=>Number(id.slice(1))<=30).flatMap(([,v])=>v).length,170);
for(const v of ['1학년','2학년','3학년','4학년','5학년','6학년','모른다','기피하는 학년이 없다.']) assert.equal(historicalChoice(2025,'Q30',v),v);
assert.equal(historicalChoice(2025,"Q03","잘 모름"),null);
assert.equal(historicalChoice(2025,"Q03","잘모름"),null);
assert.equal(historicalChoice(2025,"Q04","수학여행"),null);
assert.equal(historicalChoice(2025,"Q04","축제"),null);
assert.equal(historicalChoice(2025,"Q04","학부모 공개수업"),null);

// Source-verified historical numeric codes, not arbitrary strings.
for(const [year,ids] of [[2023,['Q11','Q12','Q13','Q14']],[2024,['Q03']]])for(const id of ids){for(let n=1;n<=6;n++){const v=historicalChoice(year,id,String(n));assert.equal(v,context.window.BeaguHistoricalQuestionnaire[year][id][n-1]);assert.equal(context.window.BeaguHistoricalClosedChoice(year,id,String(n)),v);}assert.equal(historicalChoice(year,id,'7'),null);assert.equal(historicalChoice(year,id,'1: SYNTHETIC_PRIVATE_OTHER_TEXT'),null);}
assert.equal(historicalChoice(2024,'Q03','2'),'2점');
assert.equal(Object.keys(context.window.BeaguHistoricalQuestionnaire['2023']).length,14);
assert.equal(Object.keys(context.window.BeaguHistoricalQuestionnaire['2024']).length,14);
