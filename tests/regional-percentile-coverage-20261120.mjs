import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=path=>fs.readFileSync(path,'utf8');
const pub=JSON.parse(read('data/public-lv0-percentiles-v1.2.json'));
const presence=JSON.parse(read('data/public-2023-2025-school-records-v2.json'));
const versions=[2023,2024,2025];
const expected=[2807,3284,1458];
const expectedPresence=[2898,3358,1547];
const actual=versions.map((year,i)=>pub.rows.filter(r=>typeof r.percentiles?.[i]==='number').length);
assert.deepEqual(actual,expected,'All approved domestic school-year percentiles should appear in the public bundle');
assert.deepEqual(versions.map(y=>presence.schoolIdsByYear[String(y)].length),expectedPresence);
assert.equal(pub.rows.length,new Set(pub.rows.map(row=>row.school_id)).size,'school IDs must be unique');
for(const row of pub.rows){
 assert.match(row.school_id,/^[A-Z0-9]{7}$/);
 assert.deepEqual(Object.keys(row).sort(),['percentiles','school_id','statuses'].sort(),'Do not add respondent-level fields');
 assert.equal(row.percentiles.length,3);
 assert.equal(row.statuses.length,3);
 for(let i=0;i<3;i++){
  const value=row.percentiles[i];
  assert.ok(value===null||(typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=100));
  if(value!==null){
   assert.ok(presence.schoolIdsByYear[String(versions[i])].includes(row.school_id),
     'A publicly published school-year must be recorded in source presence index');
  }
 }
}
assert.equal(presence.verified_choice_only_20261120.new_school_years,233);
assert.deepEqual(presence.verified_choice_only_20261120.by_year,{'2023':91,'2024':57,'2025':85});
assert.equal(pub.restoration_20261120.restored_school_years,588);
assert.deepEqual(pub.restoration_20261120.by_year,{'2023':212,'2024':290,'2025':86});
assert.equal(pub.restoration_20261120.new_school_ids,237);
assert.equal(pub.restoration_20261120.raw_teacher_answers_included,false);
assert.equal(pub.restoration_20261120.survey_year_2026_changed,false);
assert.deepEqual(presence.schoolIdsByYear['2024'].filter(id=>id.startsWith('9900')).length,17);
assert.deepEqual(presence.schoolIdsByYear['2025'].filter(id=>id.startsWith('9900')).length,4);
for(const path of [
 'search.html','js/level-search.js','school-report.html',
 'js/statistics-table.js','js/statistics-directory-v2.js'
]) assert.match(read(path),/data\/public-lv0-percentiles-v1\.2\.json\?v=20261120-all-regions1/);
assert.match(read('statistics.html'),/js\/statistics-directory-v2\.js\?v=20261120-all-regions1/);
console.log('PASS: 17-region vetted school-years 2023='+actual[0]+', 2024='+actual[1]+', 2025='+actual[2]+', no raw answers exposed');