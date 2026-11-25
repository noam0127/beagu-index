import fs from 'node:fs';import assert from 'node:assert/strict';import vm from 'node:vm';
const s=fs.readFileSync('js/level-search.js','utf8');const start=s.indexOf('function renderOfficial2026('),end=s.indexOf('function loadPagePercentiles(',start);
const run=vm.runInNewContext('('+s.slice(start,end).trim()+')',{viewerTier:1,make:()=>({textContent:''})});
function fixture(){const fields={};for(const k of ['student_count','male_teacher_ratio','junior_teacher_ratio']){const value={textContent:''},year={textContent:''};fields[k]={value,year,querySelector:s=>s.includes('value')?value:year};}const heading={};const facts={querySelector:s=>fields[s.match(/"([^"]+)"/)[1]]};return {fields,heading,card:{dataset:{accessLevel:'1'},querySelector:s=>s==='.glory-facts'?facts:heading}};}
const f=fixture();const school={official_basics_ranked:true,student_count:10,student_reference_year:2026,male_teacher_ratio:26.67,male_teacher_reference_year:2026,junior_teacher_ratio:40,junior_teacher_reference_year:2024};
run(f.card,{source_year:2026,student_count:999,ratio_basis:'ELEMENTARY_TEACHER_CERTIFIED',male_teacher_ratio:99,second_grade_teacher_ratio:99},'OK',school);
assert.equal(f.fields.student_count.value.textContent,'10명');assert.equal(f.fields.male_teacher_ratio.value.textContent,'26.67%');assert.equal(f.fields.junior_teacher_ratio.value.textContent,'40%');assert.equal(f.fields.junior_teacher_ratio.year.textContent,'2024년 기준');
run(f.card,null,'UNAVAILABLE',school);assert.equal(f.fields.student_count.value.textContent,'10명');
assert.match(fs.readFileSync('supabase/functions/beagu-level-api/index.ts','utf8'),/rpc\('beagu_official_basics_ranked_schools_v1'/);
console.log('PASS server-ranked snapshot remains unchanged after async official fetch and errors');
