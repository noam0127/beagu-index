import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const js=readFileSync('scripts/beagu-2026-noon-sync.gs','utf8');
const culture=readFileSync('scripts/beagu-2026-mbti-review-sync.gs','utf8');
const scope={Date,Map,Set,Number,Object,Array,String,Math,RegExp,Error,JSON,Logger:{log:()=>{}}};
runInNewContext(js,scope,{timeout:2500,filename:'beagu-2026-noon-sync.gs'});
runInNewContext(culture,scope,{timeout:2500,filename:'beagu-2026-mbti-review-sync.gs'});

assert.equal(scope.getSubmittedDay('2026. 10. 30 오전 10:12:17'),'2026-10-30');
assert.equal(scope.getSubmittedDay('2026. 11. 1 오후 9:53:38'),'2026-11-01');
assert.equal(scope.getSubmittedDay('2026. 11. 32'),null);
const header=Array(41).fill('');
header[0]='타임스탬프';header[1]='B01. 시도';header[6]='B02. 인천';
header[21]='B03. 공식학교명';header[22]='B04. 학교유형';
for(let n=1;n<=13;n++)header[23+n]='Q'+String(n).padStart(2,'0')+'. 문항';
for(let n=14;n<=17;n++)header[23+n]='Q'+String(n).padStart(2,'0')+'. 학교문화';
const cols=scope.questionColumns(header);
assert.equal(cols.region,1);
assert.equal(cols.school,21);
assert.equal(cols.schoolType,22);
assert.equal(cols.q[0],24);
assert.equal(cols.q[12],36);
const row=Array(41).fill('');
row[1]='인천';row[6]='④ 북부교육지원청';row[21]='인천부현초등학교';row[22]='③ 국립초등학교';
const schools=[{school_id:'7331195',school_name:'인천부현초등학교',sido_standard:'인천',
 support_office:'인천광역시북부교육지원청',establishment:'공립'}];
const matched=scope.resolveSchool(row,cols,schools);
assert.equal(matched.school.school_id,'7331195');
assert.equal(matched.typeConflict,true);
assert.equal(matched.selectedType,'국립');
assert.equal(matched.registeredType,'공립');
assert.equal(scope.questionScore(1,'④ 그렇다'),75);
assert.equal(scope.questionScore(2,'① 전혀 그렇지 않다'),100);
assert.equal(scope.questionScore(12,'① 운영하지 않는다'),100);
assert.equal(scope.questionScore(13,'① 그런 일이 없다'),100);
// Other/write-in responses must not abort valid school aggregates.
// The review queue stores only source row pointers; free text stays private in the original.
const reviewRows=[];
assert.equal(scope.beagu26ScoreOrReview(12,'부장은 1회 근무한다.',81,'7331195',reviewRows),null);
assert.equal(scope.beagu26ScoreOrReview(13,'학교별 자체 방식',82,'7331195',reviewRows),null);
assert.equal(scope.beagu26ScoreOrReview(1,'④ 그렇다',83,'7331195',reviewRows),75);
assert.equal(scope.beagu26ScoreOrReview(2,'미등록 응답',84,'7331195',reviewRows),null);
assert.equal(reviewRows.length,3);
assert.deepEqual(JSON.parse(JSON.stringify(reviewRows[0])),[
  81,'7331195','Q12','OTHER_OR_UNKNOWN',
  '원본 시트의 해당 행·문항을 확인하고 코드북을 검수','PENDING_REVIEW'
]);
assert.ok(!JSON.stringify(reviewRows).includes('부장은'));
assert.ok(!JSON.stringify(reviewRows).includes('학교별 자체 방식'));
assert.match(js,/2026_기타응답_검수대기/);
assert.match(js,/function onBeagu2026FormSubmitted/);
assert.match(js,/newTrigger\("runBeagu2026QuarterHour"\)\.timeBased\(\)\.everyMinutes\(15\)/);
assert.match(js,/refreshBeagu2026AllPrivateStats\(\);/);
assert.match(js,/if\(typeof refreshBeagu2026SchoolCulture==="function"\)/);
assert.match(js,/firstOfficialResponseDay: "2026-11-01"/);
assert.match(js,/publishBeagu2026NationalCount\(scanned-prelaunch-undated,newUniqueSchools\)/);
assert.doesNotMatch(js,/from\(['"]beagu_release_metrics_v2/);
assert.doesNotMatch(js,/service_role|SUPABASE_SERVICE_ROLE/i);

// Historical evidence is reused only after fresh unique exact identity verification.
const auditRow=row.slice();
auditRow[0]='2026. 11. 24 오후 1:00:00';
auditRow[22]='② 공립초등학교';
const auditSchool={...schools[0],status:'운영'};
const directory=[auditSchool];
const prior=[[2,'학교 MASTER 미매칭','UNIQUE_EXACT_MATCH_RECHECK','7331195','원본 기본정보 일치']];
const hold=[[2,auditRow[1],auditRow[6],auditRow[21],'학교 MASTER 미매칭']];
const audit=(rows,dir,p=prior,h=hold)=>{
  scope.beagu26PrepareSchoolIndex(dir);
  return JSON.parse(JSON.stringify(scope.beagu26AuditPriorExactMatches([header,...rows],dir,p,h)));
};
assert.deepEqual(audit([auditRow],directory),{candidates:1,reusable:1,held:0});
assert.equal(scope.resolveSchool(auditRow,cols,directory).school.school_id,'7331195');
assert.deepEqual(audit([auditRow],[auditSchool,{...auditSchool,school_id:'9999999'}]),{candidates:1,reusable:0,held:1});
assert.deepEqual(audit([auditRow],directory,[...prior,...prior]),{candidates:2,reusable:0,held:2});
assert.deepEqual(audit([auditRow],directory,[[...prior[0].slice(0,3),'9999999',prior[0][4]]]),{candidates:1,reusable:0,held:1});
const changed=auditRow.slice();changed[21]='다른초등학교';
assert.deepEqual(audit([changed],directory),{candidates:1,reusable:0,held:1});
assert.deepEqual(audit([row],directory),{candidates:1,reusable:0,held:1});
assert.deepEqual(audit([auditRow],[{...auditSchool,status:'폐교'}]),{candidates:1,reusable:0,held:1});
assert.deepEqual(audit([auditRow],directory,prior,[]),{candidates:1,reusable:0,held:1});

// Suspected duplicates stay in private aggregates but are flagged, never silently removed.
const validRow=auditRow.slice();
for(let j=0;j<13;j++)validRow[cols.q[j]]='④ 그렇다';
const sameRow=validRow.slice();
const missingRow=validRow.slice();missingRow[0]='2026. 11. 24 오후 1:00:01';missingRow[cols.q[0]]='';
const typeRow=validRow.slice();typeRow[0]='2026. 11. 24 오후 1:00:02';typeRow[22]='③ 국립초등학교';
const nextRow=validRow.slice();nextRow[0]='2026. 11. 24 오후 1:00:03';
scope.beagu26PrepareSchoolIndex(directory);
const signalRows=[header,validRow,sameRow,missingRow,typeRow,nextRow];
const signals=scope.beagu26RowReviewSignals(signalRows,cols,directory);
assert.equal(signals.get(1).has('DUPLICATE_SUSPECT'),true);
assert.equal(signals.get(2).has('DUPLICATE_SUSPECT'),true);
assert.equal(signals.get(3).has('MANDATORY_MISSING'),true);
assert.equal(signals.get(4).has('SCHOOL_TYPE_REVIEW'),true);
assert.equal(signals.has(5),false);
const yearAfter=validRow.slice();yearAfter[0]='2027. 1. 1 오후 1:00:00';
assert.equal(scope.beagu26RowReviewSignals([header,yearAfter,yearAfter],cols,directory).size,0);
const dateOnly=validRow.slice();dateOnly[0]='2026. 11. 24';
assert.equal(scope.beagu26RowReviewSignals([header,dateOnly,dateOnly],cols,directory).size,0);
const rowFixtureCatalog={};
for(let j=1;j<=13;j++)rowFixtureCatalog['Q'+String(j).padStart(2,'0')]={kind:'choice',options:['그렇다'],rows:[],columns:[]};
const rowResult=scope.beagu26BuildResults(signalRows,directory,rowFixtureCatalog);
assert.equal(rowResult.totals.official_rows,5);
assert.equal(rowResult.schools[0].school_response_rows,5);
assert.equal(rowResult.schools[0].school_match_status,'NEEDS_REVIEW');
assert.equal(rowResult.reviewRows.filter(r=>r[4]==='DUPLICATE_SUSPECT').length,2);
assert.equal(rowResult.reviewRows.filter(r=>r[4]==='MANDATORY_MISSING').length,1);
assert.equal(rowResult.reviewRows.filter(r=>r[4]==='SCHOOL_TYPE_REVIEW').length,1);
assert.equal(JSON.stringify(rowResult.reviewRows).includes(validRow[0]),false);

const invoked=[];
const snapshot={values:[],schools:[]};
let locked=false;
let expectedTimeout=180000;
scope.LockService={getScriptLock:()=>({
  tryLock:timeout=>{assert.equal(timeout,expectedTimeout);assert.equal(locked,false);locked=true;return true;},
  releaseLock:()=>{assert.equal(locked,true);locked=false;}
})};
scope.readBeagu2026SourceSnapshot=()=>{assert.equal(locked,true);invoked.push('read');return snapshot;};
scope.refreshBeagu2026QuestionResults=input=>{assert.equal(input,snapshot);invoked.push('questions');};
scope.refreshBeagu2026Stats=input=>{assert.equal(input,snapshot);invoked.push('core');};
scope.refreshBeagu2026VI13Private=()=>{assert.equal(locked,true);};
scope.refreshBeagu2026SchoolCulture=input=>{assert.equal(input,snapshot);invoked.push('culture');};
scope.onBeagu2026FormSubmitted({range:{getSheet:()=>({getName:()=> '설문지 응답 시트1'})}});
assert.equal(invoked.length,0,'Form submission must not launch a full rebuild');
expectedTimeout=1000;
scope.runBeagu2026QuarterHour();
expectedTimeout=180000;
assert.deepEqual(invoked,['read','questions','core','culture'],'Every output must use the same source snapshot');
assert.equal(locked,false);
scope.onBeagu2026FormSubmitted({range:{getSheet:()=>({getName:()=> '다른 시트'})}});
assert.equal(invoked.length,4,'Unrelated sheet must not trigger refresh');
scope.refreshBeagu2026QuestionResults=()=>{invoked.push('questions-failed');throw new Error('ingest failed');};
assert.throws(()=>scope.refreshBeagu2026AllPrivateStats(),/ingest failed/);
assert.deepEqual(invoked.slice(-4),['read','questions-failed','core','culture'],
  'A failed question ingest must not block core or culture processing');
assert.equal(locked,false,'A failed sync must release the lock for the next trigger');
scope.refreshBeagu2026QuestionResults=input=>{assert.equal(input,snapshot);invoked.push('questions');};
scope.refreshBeagu2026Stats=input=>{assert.equal(input,snapshot);invoked.push('partial-core');return {privateQaStatus:'PRIVATE_QA_ERROR',publishStatus:'PUBLISHED'};};
assert.throws(()=>scope.refreshBeagu2026AllPrivateStats(),/partial sync failed/);
assert.deepEqual(invoked.slice(-4),['read','questions','partial-core','culture']);
assert.equal(locked,false);
scope.refreshBeagu2026Stats=input=>{assert.equal(input,snapshot);invoked.push('core');return {privateQaStatus:'SENT_1',publishStatus:'PUBLISHED'};};
scope.refreshBeagu2026AllPrivateStats();
assert.deepEqual(invoked.slice(-4),['read','questions','core','culture'],'A later retry must use a fresh snapshot and complete all stages');
assert.equal(locked,false);
console.log('PASS: 2026 quarter-hour trigger path, one official row, school-type review, Q01-Q17 private auto aggregation');
