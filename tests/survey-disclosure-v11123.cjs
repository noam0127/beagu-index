const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const notice="본 수치는 익명·자발적 설문 응답을 바탕으로 산출된 인식조사 결과입니다. 응답자의 교원 신분과 실제 학교 소속이 확인되지 않았을 수 있으며, 해당 학교 전체의 교직문화를 대표하지 않습니다.";
for(const p of ['index.html','school-report.html','statistics.html','js/school-search-card-v1.js','js/beagu-home-schools-v1.js']) assert.ok(read(p).includes(notice),p);
for(const p of ['index.html','search.html','search-lv1.html','school-report.html','statistics.html'])assert.ok(read(p).includes('styles/beagu-survey-disclosure-v1.css'),p);
assert.ok(read('js/school-search-card-v1.js').includes('simple_report'));
assert.ok(read('js/statistics-compare.js').includes('1,458개교'));
assert.equal(JSON.parse(read('release-info.json')).version,'v1.11.23');
console.log('survey disclosure static contract passed');
