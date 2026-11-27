const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const notice="본 수치는 익명·자발적 설문 응답을 바탕으로 산출된 인식조사 결과입니다. 응답자의 교원 신분과 실제 학교 소속이 확인되지 않았을 수 있으며, 해당 학교 전체의 교직문화를 대표하지 않습니다.";
for(const p of ['index.html','school-report.html','statistics.html','js/school-search-card-v1.js','js/beagu-home-schools-v1.js']) assert.ok(read(p).includes(notice),p);
for(const p of ['index.html','search.html','search-lv1.html','school-report.html','statistics.html'])assert.ok(read(p).includes('styles/beagu-survey-disclosure-v1.css'),p);
assert.ok(read('js/school-search-card-v1.js').includes('simple_report'));
assert.ok(read('js/statistics-compare.js').includes('1,458개교'));
const releaseVersion=JSON.parse(read('release-info.json')).version;
assert.ok(['v1.11.22','v1.11.23','v1.11.23.1','v1.12.01','v1.12.01.1','v1.12.02','v1.12.02.1','v1.12.02.2','v1.12.04','v1.12.05','v1.12.05.1','v1.12.06'].includes(releaseVersion),'Supported disclosure-preserving release');
console.log('survey disclosure static contract passed');
const snapshot=JSON.parse(read('data/public-lv0-percentiles-v1.2.json'));
assert.match(snapshot.percentile_methods['2025'],/1,458개교/);
assert.ok(read('index.html').includes('교육부·교육청의 공식 평가가 아닙니다'));
for(const p of ['js/statistics-compare.js','school-report.html'])assert.ok(read(p).includes('공개 자료에서 확인되지 않음'),p);
for(const p of ['js/school-search-card-v1.js','js/beagu-home-schools-v1.js']){if(['v1.11.23.1','v1.12.01','v1.12.01.1','v1.12.02','v1.12.02.1','v1.12.02.2','v1.12.04','v1.12.05','v1.12.05.1','v1.12.06'].includes(releaseVersion)){assert.doesNotMatch(read(p),/유효 응답 건수: 공개 자료에서 확인되지 않음/,p);assert.match(read(p),/1,458개교/,p);}else assert.ok(read(p).includes('공개 자료에서 확인되지 않음'),p);}
if(['v1.11.23.1','v1.12.01','v1.12.01.1','v1.12.02','v1.12.02.1','v1.12.02.2','v1.12.04','v1.12.05','v1.12.05.1','v1.12.06'].includes(releaseVersion))assert.match(read('js/school-search-card-v1.js'),/if\(metadata\)card\.append\(el\('p','beagu-survey-meta',metadata\)\)/,'No empty metadata paragraph');

assert.ok(read('index.html').includes('개별 사실의 확인이나 학교·교직원의 우열을 판정한 결과가 아닙니다.'));
assert.equal(JSON.parse(read('release-candidate.json')).version,releaseVersion,'Candidate and release metadata must agree');

for(const p of ['games.html','js/arcade-school-picker-v1.js','js/arcade-result-share-v1.js'])assert.ok(read(p).includes("게임 속 상황과 난이도는 실제 학교의 근무환경이나 특정 교직원의 행동을 재현·평가한 결과가 아닙니다."),p);
assert.ok(read('js/arcade-result-share-v1.js').includes('가상 게임 기록 · 실제 학교의 근무환경 및 교직원 행동 평가가 아님'));
for(const p of ['search.html','search-lv1.html'])assert.ok(read(p).includes('관심도 집계이며 학교의 교직문화 평가나 우열을 뜻하지 않습니다.'),p);
assert.doesNotMatch(read('index.html'),/aria-label="(?:상위권|하위권) 학교"/);
