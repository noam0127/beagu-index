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
// Q45 exact old/new label compatibility, no generalized alias or positional guessing.
const q45={Q45:catalog.Q45};
const q45Headers=['날짜','지역','학교',...catalog.Q45.rows.map(x=>'Q45. 문항 ['+x+']')];
const q45Row=['2026-11-24','부산','검증학교',...catalog.Q45.rows.map(()=>catalog.Q45.columns[0])];
const q45Build=h=>context.beagu26BuildResults([h,q45Row],[],q45);
const current=q45Build(q45Headers);
const former=q45Headers.slice();
former[13]='Q45. 문항 [⑪ 교사용 와이파이(안정적으로 연결되는 공간)]';
former[14]='Q45. 문항 [⑫ 교사용 와이파이(연결이 자주 끊기거나 불안정한 공간)]';
assert.deepEqual(JSON.parse(JSON.stringify(q45Build(former))),JSON.parse(JSON.stringify(current)));
assert.equal(current.reviewRows.length,0);
assert.equal(current.schools[0].questions[10].valid,1);
assert.equal(current.schools[0].questions[11].valid,1);
for(const [i,label] of [[13,'학생용 와이파이(안정적으로 연결되는 공간)'],[14,'교사용 와이파이(안정적으로 연결되는 공간)'],[3,'다른 비품']]){
 const bad=q45Headers.slice();bad[i]='Q45. 문항 ['+label+']';
 assert.throws(()=>q45Build(bad),/grid row mismatch/);
}
assert.throws(()=>q45Build(q45Headers.concat(q45Headers[13])),/column count mismatch/);
assert.equal(catalog.Q45.rows[10],'와이파이(안정적으로 연결되는 공간)');
assert.equal(catalog.Q45.rows[11],'와이파이(연결이 자주 끊기거나 불안정한 공간)');
const questions=Object.entries(catalog).flatMap(([id,m])=>(m.kind==='grid'?m.rows:[null]).map((_,i)=>({id,row:m.kind==='grid'?i:-1,valid:0,invalid:0,counts:(m.kind==='grid'?m.columns:m.options).map(()=>0),minutes_sum:0})));
const payload={source_spreadsheet_id:sourceId,official_start_day:'2026-11-01',schema_version:1,snapshot_at:new Date().toISOString(),totals:{source_rows:2,official_rows:1,prelaunch_rows:1,unmatched_rows:0,undated_rows:0},schools:[{school_id:'1000001',school_response_rows:1,school_match_status:'EXACT_REGION_OFFICE_NAME',questions}]};
assert.equal(validateSnapshot(payload),payload);
const alphanumericSchool=structuredClone(payload);
alphanumericSchool.schools[0].school_id='A000001';
assert.equal(validateSnapshot(alphanumericSchool),alphanumericSchool);
alphanumericSchool.schools[0].school_id='A00000!';
assert.throws(()=>validateSnapshot(alphanumericSchool));
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
const replacement=fs.readFileSync('supabase/migrations/20261120023327_beagu_2026_set_based_snapshot.sql','utf8');
assert.match(replacement,/where existing\.payload_sha256 is distinct from excluded\.payload_sha256/);
assert.match(replacement,/approval_status='WITHHELD',approved_by=null,approved_at=null/);
assert.match(replacement,/snapshot_time<previous_time/);
// 2026 school-office aliases must preserve strict region + office + name matching.
const matcherSource=gs.slice(gs.indexOf('function normalize(s)'),gs.indexOf('function fetchSchools()'));
assert.ok(matcherSource.startsWith('function normalize(s)')&&matcherSource.includes('function normalizeOffice'));
const matchContext={};vm.createContext(matchContext);vm.runInContext(matcherSource,matchContext);
const office=matchContext.normalizeOffice;
assert.equal(office('㉕ 화성오산교육지원청'),office('경기도화성오산교육지원청'));
assert.equal(office('㉓ 평택교육지원청'),office('경기도평택교육지원청'));
assert.equal(office('㉒ 파주교육지원청'),office('경기도파주교육지원청'));
assert.equal(office('① 교육지원청 없음(세종)'),office('세종특별자치시교육청'));
assert.equal(office('⑧ 목포교육지원청'),office('전남광주통합특별시목포교육지원청'));
assert.equal(office('⑬ 창원교육지원청(의창·성산권)'),office('창원교육지원청'));
assert.equal(office('⑭ 창원교육지원청(마산권)'),office('창원교육지원청(마산센터)'));
assert.equal(office('⑮ 창원교육지원청(진해권)'),office('창원교육지원청(진해센터)'));
assert.notEqual(office('⑭ 창원교육지원청(마산권)'),office('⑮ 창원교육지원청(진해권)'));
assert.match(gs,/normalizeOffice\(s\.support_office\)===office/);
assert.match(gs,/if\(same\.length!==1\)/);
// Independent 2026 Q01–Q13 scoring contract: an incorrect reversal or
// silently scored 'other' response must fail CI before deployment.
const scoringStart=gs.indexOf('function questionScore(');
const scoringEnd=gs.indexOf('function resolveSchool(',scoringStart);
assert.ok(scoringStart>=0&&scoringEnd>scoringStart,'2026 scoring function must exist');
const scoreContext={};vm.createContext(scoreContext);
vm.runInContext(gs.slice(scoringStart,scoringEnd),scoreContext);
const score=scoreContext.questionScore;
const regular=['전혀 그렇지 않다','그렇지 않다','보통이다','그렇다','매우 그렇다','판단하기 어렵다'];
const positive=new Set([1,6,7,9,10,11]);
const reversed=new Set([2,3,4,5,8]);
for(let n=1;n<=11;n++){
  const id='Q'+String(n).padStart(2,'0');
  assert.equal(catalog[id].options.join('|'),regular.join('|'),id+' questionnaire options changed');
  assert.ok(positive.has(n)||reversed.has(n),id+' scoring orientation missing');
  for(let i=0;i<regular.length;i++){
    const response=['①','②','③','④','⑤','⑥'][i]+' '+regular[i];
    const expected=i===5?null:positive.has(n)?i*25:(4-i)*25;
    assert.equal(score(n,response),expected,id+' incorrect reversal or missing value');
  }
  assert.throws(()=>score(n,'알 수 없는 선택값'),/보기/,id+' unapproved values must not be scored');
}
for(const [n,expected] of [
  [12,[100,100,50,0,null]],
  [13,[100,100,25,0,null]]
]){
  const id='Q'+n;
  assert.equal(catalog[id].options.length,6,id+' expected five closed choices plus 기타');
  assert.equal(catalog[id].options[5],'기타',id+' unknown option must be reviewed');
  for(let i=0;i<5;i++)
    assert.equal(score(n,['①','②','③','④','⑤'][i]+' '+catalog[id].options[i]),expected[i],id+' mismatched category score '+i);
  assert.throws(()=>score(n,'⑥ 기타'),/보기/,id+' 기타 may never be scored');
  assert.throws(()=>score(n,'기타: 응답자 입력 내용'),/보기/,id+' free text may never be scored');
}
const reviewStore=[];
assert.equal(scoreContext.beagu26ScoreOrReview(12,'기타: 임의 입력',17,'0000001',reviewStore),null);
assert.equal(reviewStore.length,1);
assert.deepEqual(Array.from(reviewStore[0].slice(0,4)),[17,'0000001','Q12','OTHER_OR_UNKNOWN']);
assert.equal(JSON.stringify(reviewStore).includes('임의 입력'),false,'Private review records must contain pointers only');
console.log('2026 aggregation, strict payload validation, private/public projection and Apps Script syntax: PASS');
