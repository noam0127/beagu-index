import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(path,'utf8');
const source=JSON.parse(read('data/public-2023-2025-school-records-v2.json'));
const overseas2024=[
 '9900001','9900005','9900006','9900007','9900008','9900010',
 '9900012','9900013','9900015','9900016','9900017','9900018',
 '9900019','9900020','9900021','9900028','9900034'
];
const overseas2025=['9900015','9900016','9900020','9900027'];
assert.deepEqual(source.schoolIdsByYear['2023'].filter(id=>/^9900\d{3}$/.test(id)),[]);
assert.deepEqual(source.schoolIdsByYear['2024'].filter(id=>/^9900\d{3}$/.test(id)),overseas2024);
assert.deepEqual(source.schoolIdsByYear['2025'].filter(id=>/^9900\d{3}$/.test(id)),overseas2025);

for(const year of ['2023','2024','2025']){
 const ids=source.schoolIdsByYear[year];
 assert.ok(Array.isArray(ids));
 assert.equal(new Set(ids).size,ids.length,year+' must not contain duplicate school IDs');
 assert.ok(ids.every(id=>/^[A-Z0-9]{7}$/.test(id)),year+' contains invalid ID');
}
assert.deepEqual(source.overseas_20261120.byYear,{'2024':17,'2025':4});
assert.equal(source.overseas_20261120.percentilesUnchanged,true);
assert.equal(source.overseas_20261120.sourceResponseValuesNotIncluded,true);
assert.deepEqual(Object.keys(source.schoolIdsByYear).sort(),['2023','2024','2025']);
assert.ok(!JSON.stringify(source).includes('validRows'),'public history file must never contain response counts');

const lv0=read('search.html'),lv1=read('js/level-search.js');
const markup=read('search-lv1.html');
const api=read('supabase/functions/beagu-level-api/index.ts');
for(const file of [lv0,lv1]){
 assert.ok(file.includes('data/public-2023-2025-school-records-v2.json?v=20261120-overseas1'));
 assert.ok(file.includes('school-participation'));
 assert.ok(file.includes('조사 기록 있음'));
}
assert.match(lv1,/historicalPresenceByYear\[y\]\?\.has\(String\(school\.school_id\)\)/);
assert.match(lv1,/showDetails\(detail,data\.rows,school,data\.schoolQuestionModes/);
assert.ok(markup.includes('school-participation'));
assert.match(api,/OWNER_AUTHORIZED_CLOSED_CHOICE/);
assert.match(api,/schoolQuestionModes=\[\.\.\.modeIndex\.values\(\)\]/);
assert.match(api,/\.eq\('school_id',id\)\.eq\('review_status','OWNER_AUTHORIZED_CLOSED_CHOICE'\)/);
console.log('PASS: overseas 2024 (17) and 2025 (4) history is visible in Lv0/Lv1 without changing percentiles or raw survey disclosures');