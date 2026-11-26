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
