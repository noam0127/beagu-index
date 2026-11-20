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
// Review-only rows must never travel with the ingest snapshot.
context.questionColumns=()=>({school:2});
context.getSubmittedDay=value=>String(value).slice(0,10);
context.resolveSchool=()=>({school:{school_id:'1000001'},typeConflict:false});
context.BEAGU26={sourceId};
const fixtureCatalog={
  Q12:{kind:'choice',options:['운영하지 않는다','기타'],rows:[],columns:[]},
  Q14:{kind:'choice',options:['A에 매우 가깝다','B에 매우 가깝다'],rows:[],columns:[]}
};
const fixtureRows=[
  ['날짜','지역','학교','Q12. 문항','Q14. 문항'],
  ['2026-10-30','부산','시범학교','운영하지 않는다','A에 매우 가깝다'],
  ['2026-11-19','부산','시범학교','부장은 1회 근무한다.','A에 매우 가깝다'],
  ['2026-11-19','부산','시범학교','운영하지 않는다','미등록 선택지']
];
const reviewed=context.beagu26BuildResults(fixtureRows,[],fixtureCatalog);
assert.equal(reviewed.totals.prelaunch_rows,1);
assert.equal(reviewed.totals.official_rows,2);
assert.equal(reviewed.schools[0].school_response_rows,2);
assert.deepEqual(Array.from(reviewed.schools[0].questions, q=>[q.valid,q.invalid]),[[1,1],[1,1]]);
assert.equal(reviewed.reviewRows.length,2);
assert.equal(JSON.stringify(reviewed.reviewRows).includes('부장은 1회 근무한다.'),false);
assert.equal(JSON.stringify(context.beagu26BuildResults(fixtureRows,[],fixtureCatalog)),JSON.stringify(reviewed));
const {reviewRows, ...safePayload}=reviewed;
assert.equal('reviewRows' in safePayload,false);
const otherRow=[
  fixtureRows[0],['2026-11-19','부산','시범학교','기타','A에 매우 가깝다']
];
assert.equal(context.beagu26BuildResults(otherRow,[],fixtureCatalog).reviewRows[0][4],'OTHER_OPTION');
const timeCatalog={Q18:{kind:'time',options:[],rows:[],columns:[]}};
const timeRows=[
  ['날짜','지역','학교','Q18. 문항'],
  ['2026-11-19','부산','시범학교','오후 9:20'],
  ['2026-11-19','부산','시범학교','임의 시간']
];
const timeResult=context.beagu26BuildResults(timeRows,[],timeCatalog);
const [timeQuestion]=timeResult.schools[0].questions;
assert.deepEqual([timeQuestion.valid,timeQuestion.invalid,timeQuestion.minutes_sum],[1,1,1280]);
assert.equal(timeResult.reviewRows[0][4],'INVALID_TIME');
assert.equal(JSON.stringify(timeResult.reviewRows).includes('임의 시간'),false);
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
