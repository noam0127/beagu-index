import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {catalog} from '../supabase/functions/_shared/questionnaire-2026.mjs';
import {publicQuestionResults} from '../supabase/functions/_shared/results-2026.mjs';

const sql=fs.readFileSync('supabase/migrations/20261120213000_beagu_2026_publication_basis_fail_closed.sql','utf8');
assert.match(sql,/create table if not exists beagu_private\.beagu_2026_publication_basis_review/i);
assert.match(sql,/review_status='VERIFIED'/i);
assert.match(sql,/notice_effective_at<=r\.source_snapshot_at/i);
assert.match(sql,/b\.payload_sha256=r\.payload_sha256/i);
assert.match(sql,/b\.reviewed_at>=r\.source_snapshot_at/i);
assert.match(sql,/b\.reidentification_reviewed/i);
assert.match(sql,/small_sample_reviewed/i);
assert.match(sql,/prior_data_combination_reviewed/i);
assert.match(sql,/beagu_admin_active_mfa_session\(actor_id,actor_session\)/);
assert.match(sql,/technical_status='TECHNICAL_CHECK_PASSED'/i);
assert.match(sql,/approved_at\s*<=\s*now\(\)-interval '24 hours'/i);
assert.match(sql,/coalesce\(jsonb_agg\(q\.value\),'\[\]'::jsonb\)/i);
assert.match(sql,/q\.value->>'id' not in \('Q31','Q51'\)/i);
assert.match(sql,/revoke all on function public\.beagu_2026_approve_results\(text,text,text,jsonb\) from public,anon,authenticated/i);
assert.match(sql,/revoke all on function public\.beagu_2026_released_question_results\(text\) from public,anon,authenticated/i);
assert.match(sql,/revoke all on beagu_private\.beagu_2026_publication_basis_review from public,anon,authenticated/i);

const q=(id,optionIndex=0)=>{
  const m=catalog[id];
  const options=m.kind==='grid'?m.columns:m.options;
  const counts=options.map((_,i)=>i===optionIndex?1:0);
  return {id,row:-1,valid:1,invalid:0,counts,minutes_sum:0};
};
const q31=q('Q31'),q01=q('Q01');
assert.equal(publicQuestionResults([q31]).length,0,'Q31 is private-analysis-only');
assert.equal(publicQuestionResults([q01]).length,1,'ordinary choices still render when released');
assert.deepEqual(publicQuestionResults([q31,q01]).map(x=>x.questionId),['Q01']);

const browser={window:{Beagu2026Questionnaire:catalog}};
vm.createContext(browser);
vm.runInContext(fs.readFileSync('js/2026-approved-question-results.js','utf8'),browser);
const safe=[{questionId:'Q31',row:-1,values:[catalog.Q31.options[0]]},
 {questionId:'Q01',row:-1,values:[catalog.Q01.options[0]]}];
const out=browser.window.Beagu2026ApprovedResults.summary(safe);
assert.equal(out.Q31,undefined,'browser also refuses sensitive Q31');
assert.equal(typeof out.Q01,'string');
assert.ok(!JSON.stringify(out).includes(catalog.Q31.options[0])||catalog.Q31.options[0]===catalog.Q01.options[0]);
console.log('PASS: independent 2026 publication-basis gate, 24h cooldown and Q31 suppression');
