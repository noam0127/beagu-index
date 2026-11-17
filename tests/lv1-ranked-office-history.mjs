import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=p=>fs.readFileSync(p,'utf8');
const html=read('search-lv1.html'),search=read('js/level-search.js'),report=read('school-report.html');
const api=read('supabase/functions/beagu-level-api/index.ts');
const observed=read('js/2025-observed-choices.js');
const prompts=read('js/historical-original-questions.js');
const prior=read('js/historical-questionnaire-choices.js');
assert.doesNotThrow(()=>new vm.Script(search));
assert.equal((html.match(/data-sort="/g)||[]).length,5);
for(const s of ['school_name','address','beagu_percentile_2025','student_count','housing_price_won']){
 assert.ok(html.includes('data-sort="'+s+'"'), 'missing verified sort '+s);
 assert.ok(api.includes("'"+s+"'"),'server whitelist '+s);
}
assert.match(html,/학교명 가나다순/);
assert.match(html,/주소순/);
assert.doesNotMatch(html,/세종은 2025년 세종시 전체 공동주택 평균 공시가격을 적용했습니다/);
assert.match(html,/세종의 학교 소재 법정동별 공시가격은 원자료 확인 전까지 표시하지 않습니다/);
assert.match(search,/법정동별 원자료 확인 중/);
assert.doesNotMatch(search,/세종시 전체 공동주택 평균 공시가격/);
assert.match(html,/가나다순 또는 높은 순/);
assert.match(search,/api\('offices'/);
assert.match(search,/api\('ranked_schools'/);
assert.doesNotMatch(search,/query\.order\('address'/,'must not sort only one page');
assert.match(api,/const ascending=sort==='school_name'\|\|sort==='address'/);
assert.match(api,/query\.order\(sort,\{ascending,nullsFirst:false\}\)/);
assert.match(api,/direction:ascending\?'asc':'desc'/);
assert.match(search,/new Option\(shortOfficeName\(value,region\),value\)/,'short visible label must retain exact server filter');
assert.match(search,/전남광주통합특별시/);
assert.match(search,/강원특별자치도/);
assert.match(api,/\.range\(from,from\+19\)/);
assert.match(api,/beagu_lv1_office_directory/);
assert.match(api,/beagu_lv1_school_sort_index/);
assert.match(api,/if\(body\.action==='survey_comparisons'\)/);
assert.match(api,/beagu_survey_geography_comparisons_v1/);
assert.match(report,/fetchHistoricalGeography/);
assert.match(report,/geographyComparisonCache/);
assert.match(report,/geographyComparisonCache/);
assert.match(report,/js\/2025-observed-choices\.js/);
const win={};vm.runInNewContext(observed,{window:win},{timeout:1000});
assert.equal(Object.keys(win.Beagu2025ObservedChoices||{}).length,30);
assert.ok(win.Beagu2025ObservedChoices.Q03.length>=10);
assert.ok(win.Beagu2025ObservedChoices.Q04.length>=8);
assert.ok(win.Beagu2025ObservedChoices.Q30.length>=5);
const original={};vm.runInNewContext(prompts,{window:original},{timeout:1000});
assert.equal(Object.keys(original.BeaguHistoricalOriginalQuestions['2023']).length,14);
assert.equal(Object.keys(original.BeaguHistoricalOriginalQuestions['2024']).length,14);
assert.equal(Object.keys(original.BeaguHistoricalOriginalQuestions['2025']).length,50);
assert.ok(original.BeaguHistoricalOriginalQuestions['2023'].Q01.includes('배구를 하는가'));

const w2={};vm.runInNewContext(prior,{window:w2},{timeout:1000});
assert.equal(Object.keys(w2.BeaguHistoricalQuestionnaire['2023']).length,10);
assert.equal(Object.keys(w2.BeaguHistoricalQuestionnaire['2024']).length,13);
assert.equal(Object.keys(w2.BeaguHistoricalQuestionnaire['2025']).length,20);
assert.doesNotMatch(report,/\['학교별 응답자'/,'No public teacher response counts');

const publicSearch=read('search.html');
const sync=read('scripts/beagu-2026-noon-sync.gs');
assert.match(publicSearch,/CHANGWON_SURVEY_AREAS/, 'Lv.0 must offer 3 Changwon areas');
assert.doesNotMatch(publicSearch,/LEGACY_GYEONGNAM/, 'obsolete office names must not be selectable');
for(const x of ['창원교육지원청', '창원교육지원청(마산센터)', '창원교육지원청(진해센터)']) {
 assert.ok(publicSearch.includes(x),'Lv.0 missing region option '+x);
 assert.ok(search.includes(x),'Lv.1 missing short label '+x);
}
assert.doesNotThrow(()=>new vm.Script(sync),'2026 matching script syntax');
const matcher=vm.runInNewContext(sync+'\n;({normalizeOffice})',{}, {timeout:1000});
for(const [input,expected] of [
 ['창원교육지원청','창원'], ['창원','창원'],
 ['마산','마산'], ['마산교육청','마산'], ['창원교육지원청(마산센터)','마산'],
 ['진해','진해'], ['진해교육청','진해'], ['창원교육지원청(진해센터)','진해'],
 ['경기도수원교육지원청','수원']
]) assert.equal(matcher.normalizeOffice(input),expected,'2026 matching '+input);
console.log('PASS: Changwon 3-area search and 2026 normalization');

for(const file of [
 'search.html','js/school-search-card-v1.js','js/level-search.js',
 'school-report.html','js/statistics-table.js','js/school-mbti-v1.js',
 'supabase/functions/beagu-level-api/index.ts'
]){
 assert.ok(read(file).includes('[A-Z0-9]{7}'),file+' must support an official NEIS alphanumeric school ID');
}
assert.ok(/^[A-Z0-9]{7}$/.test('C150029'),'NEIS alphanumeric school ID is valid');
assert.equal(/^[A-Z0-9]{7}$/.test('       '),false,'blank placeholder school ID is invalid');
console.log('PASS: NEIS alphanumeric school ID validation');


console.log('PASS: 5 full-dataset sorts including Hangul alphabetical and address, abbreviated labels preserving office IDs');
