import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {catalog} from '../supabase/functions/_shared/questionnaire-2026.mjs';
import {validateSnapshot,publicQuestionResults,sourceId} from '../supabase/functions/_shared/results-2026.mjs';
const core=fs.readFileSync('scripts/beagu-2026-results-core.js','utf8');
const context={};vm.createContext(context);vm.runInContext(core,context);
const select=(raw,opts,multi)=>JSON.parse(JSON.stringify(context.beagu26Selections(raw,opts,multi)));
assert.deepEqual(select('① 하나, ㉑ 청소년단체(스카우트, 아람단)',['하나','청소년단체(스카우트, 아람단)'],true),[0,1]);
assert.equal(select('기타: 개인 이름',['기타'],true),null);
assert.equal(select('임의 보기',['승인 보기'],false),null);
const questions=Object.entries(catalog).flatMap(([id,m])=>(m.kind==='grid'?m.rows:[null]).map((_,i)=>({id,row:m.kind==='grid'?i:-1,valid:0,invalid:0,counts:(m.kind==='grid'?m.columns:m.options).map(()=>0),minutes_sum:0})));
const payload={source_spreadsheet_id:sourceId,official_start_day:'2026-11-01',schema_version:1,snapshot_at:new Date().toISOString(),totals:{source_rows:2,official_rows:1,prelaunch_rows:1,unmatched_rows:0,undated_rows:0},schools:[{school_id:'1000001',school_response_rows:1,school_match_status:'EXACT_REGION_OFFICE_NAME',questions}]};
assert.equal(validateSnapshot(payload),payload);
for(const change of [p=>p.schools[0].raw_answers=['secret'],p=>p.totals.official_rows=2,p=>p.schools.push(p.schools[0]),p=>p.schools[0].questions[0].counts[0]=2,p=>p.schools[0].questions[0].id='Q51',p=>p.snapshot_at='2026-01-01']){const copy=structuredClone(payload);change(copy);assert.throws(()=>validateSnapshot(copy));}
questions[0].valid=1;questions[0].counts[2]=1;
assert.deepEqual(publicQuestionResults(questions),[{questionId:'Q01',row:-1,values:['보통이다']}]);
assert.ok(!JSON.stringify(publicQuestionResults(questions)).includes('counts'));
questions[0].invalid=1;assert.deepEqual(publicQuestionResults(questions),[]);
// Compile all Apps Script files in one context to detect duplicate lexical declarations.
const gs=['noon','mbti-review'].map(name=>fs.readFileSync('scripts/beagu-2026-'+name+'-sync.gs','utf8')).join('\n');
new vm.Script(gs);
const declarations=[...gs.matchAll(/^function\s+(\w+)\(/gm)].map(m=>m[1]);
assert.equal(declarations.length,new Set(declarations).size);
assert.ok(!gs.includes('||='));
// Browser projections accept only original catalogue labels, including grid rows.
const browser={window:{Beagu2026Questionnaire:catalog}};vm.createContext(browser);vm.runInContext(fs.readFileSync('js/2026-approved-question-results.js','utf8'),browser);
assert.equal(browser.window.Beagu2026ApprovedResults.summary([{questionId:'Q01',row:-1,values:['보통이다']}]).Q01,'보통이다');
assert.equal(Object.keys(browser.window.Beagu2026ApprovedResults.summary([{questionId:'Q51',row:-1,values:['secret']}])).length,0);
console.log('2026 aggregation, strict payload validation, private/public projection and Apps Script syntax: PASS');
