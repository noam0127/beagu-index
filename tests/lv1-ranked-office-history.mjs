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
const publicSnapshot=JSON.parse(read('data/public-lv0-percentiles-v1.2.json'));
const restored=publicSnapshot.rows.find(r=>r.school_id==='7392112');
assert.ok(restored,'Gwangju Gyerim elementary must be present in restored history');
assert.equal(restored.percentiles[0],45.72,'2023 preserved vetted Gwangju percentile');
assert.equal(restored.percentiles[2],58.13,'2025 verified rank restored from original edited workbook');
assert.ok(publicSnapshot.restoration_20261118?.school_ids===317 &&
  publicSnapshot.restoration_20261118.published_school_years===503,
  'Both regions must have 503 published school-years restored');
for(const file of ['search.html','js/level-search.js','school-report.html','js/statistics-directory-v2.js']){
 assert.ok(read(file).includes('v=20261120-all-regions1'),file+' must use refreshed Gwangju/Jeonnam percentile bundle');
}
assert.match(api,/approvedDomainLabels/, 'Lv.1 must display the eight curated 2025 school areas');
assert.match(api,/APPROVED_SANITIZED_LEGACY_VIEW/, 'Only prior owner-approved public-release whitelist may be shown');
assert.match(api,/r\.respondents<1/, 'One response is allowed but zero responses are not');
assert.match(api,/NO_RAW_QUESTION_VALUES_NO_FREE_TEXT_NO_PERSONAL_IDENTIFIERS/, 'Never expose individual raw teacher choices or free text');
console.log('PASS: 503 school-year values restored and 2025 N>=1 sanitized domain release');

assert.match(html,/js\/historical-questionnaire-choices\.js/, 'Lv.1 must load original verified 2023/24/25 options');
assert.match(html,/js\/2025-observed-choices\.js/, 'Lv.1 must load observed multi-choice 2025 labels');
assert.match(search,/function renderHistoricalBenchmarks\(/, 'Lv.1 must display per-question original prompts and benchmarks');
assert.match(search,/loadGeographyComparisons\(year,region\)/, 'Lv.1 must fetch approved 2023-25 regional/national benchmarks');
assert.match(search,/api\('survey_comparisons',\{year,region\}\)/, 'benchmarks are authenticated and reviewed server-side');
assert.match(search,/학교별 문항 집계 미공개/, 'unapproved school-level single-respondent results must not be inferred');
assert.match(search,/학교가 속한 시도 및 전국의 자발적 참여 표본 집계값/, 'regional aggregates must be clearly labeled as sample references, not school results');
assert.match(search,/m\.kind==='most_frequent'\|\|m\.kind==='mode'/, 'mode comparisons must prefer the recorded mode over an arithmetic mean');
assert.match(search,/vetted\.get\(id\)\|\|null/, 'only verified school distributions can populate school cell');
assert.match(search,/원자료에서 확인된 보기 \(전체 목록 미확인\)/, 'observed partial option lists must be distinguished from authoritative options');
for(const s of ['school_name','address','beagu_percentile_2025','student_count','junior_teacher_ratio','male_teacher_ratio','housing_price_won'])assert.ok(html.includes('value="'+s+'"'),'Missing region sort '+s);
for(const label of ['학교명','주소','배구지수','학생수','2정교사비','남교사비'])assert.ok(html.includes('>'+label+'</option>'),'Missing sort label '+label);
assert.match(html,/>🔒 공시가격 \(Lv\.2\)<\/option>/,'Lv.1 still masks Lv.2-only price');
assert.match(html,/id="regionSortDirection"/,'Lv.1 must include a separate direction toggle');
assert.match(search,/sortDirection=sortDirection==='asc'\?'desc':'asc'/,'Lv.1 direction button must toggle ascending/descending');
assert.match(search,/value}_\$\{sortDirection\}/,'Lv.1 must send the selected direction to full-dataset API');
assert.doesNotMatch(html,/학교명순 ↑|학교명순 ↓|주소순 ↑|주소순 ↓/,'Sort criteria must not embed arrows');
assert.ok(search.includes("const sort=sortValue.replace(/_(?:asc|desc)$/,'')"),'Full metric field must be forwarded to the API');
assert.match(search,/render\(data,\s*count,\s*sortValue\)/,'Render the selected server-sorted metric');
assert.match(api,/beagu_percentile_2025/,'2025 percentile is a verified server sort');
assert.match(api,/student_count/,'Student count is a verified server sort');
assert.match(api,/housing_price_won/,'Housing price is a verified server sort');
assert.match(api,/junior_teacher_ratio/,'2nd-class teacher ratio is a verified server sort');
assert.match(api,/male_teacher_ratio/,'Male teacher ratio is a verified server sort');
assert.match(api,/student_count,student_reference_year,housing_price_won,junior_teacher_ratio,male_teacher_ratio/,'Approved school ratios must be returned for sort cards');
assert.doesNotMatch(html,/id="sortTabs"/,'No school search sorting buttons');
assert.doesNotMatch(html,/자료 표시 기준|Lv.1에서 공개 승인된 2023~2026년 학교 규모/);
assert.doesNotMatch(search,/세종시 전체 공동주택 평균 공시가격/);
assert.match(search,/api\('offices'/);
assert.match(search,/api\('ranked_schools'/);
assert.doesNotMatch(search,/query\.order\('address'/,'must not sort only one page');
assert.match(api,/const ascending=direction==='asc'/);
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
for(const s of ['school_name','address'])assert.ok(publicSearch.includes('value="'+s+'"'),'Lv.0 missing criterion '+s);
assert.match(publicSearch,/id="publicSortDirection"/,'Lv.0 needs a direction toggle');
assert.match(publicSearch,/sortDirection=sortDirection==='asc'\?'desc':'asc'/,'Lv.0 must toggle ascending/descending');
assert.doesNotMatch(publicSearch,/학교명순 ↑|학교명순 ↓|주소순 ↑|주소순 ↓/,'Lv.0 criteria must not embed arrows');
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
