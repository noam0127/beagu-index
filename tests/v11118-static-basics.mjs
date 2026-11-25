import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const ctx={window:{}};
vm.runInNewContext(fs.readFileSync('js/public-school-basics-2026-v1.js','utf8'),ctx);
const api=ctx.window.BeaguPublicSchoolBasics2026;
const data=JSON.parse(fs.readFileSync('data/public-school-basics-2026-v1.json','utf8'));
const index=api.parseIndex(data);
assert.equal(index.size,6277);
assert.equal(data.rows.reduce((n,r)=>n+r[1],0),2217424);
for(const [id,n,t,m,s] of data.rows){const p=index.get(id);assert.equal(p.student_count,n);assert.equal(p.teacher_total,t);assert.equal(p.male_teacher_ratio,Math.round(m*10000/t)/100);assert.equal(p.second_grade_teacher_ratio,Math.round(s*10000/t)/100);}
assert.throws(()=>api.parseIndex({...data,rows:[...data.rows.slice(0,-1),data.rows[0]]}));
assert.throws(()=>api.parseIndex({...data,rows:data.rows.map((r,i)=>i===0?[r[0],r[1],0,0,0]:r)}));
ctx.window.BeaguPublic={values:r=>r||[null,null,null]};
const rows=[{school_id:'1000001',school_name:'A'},{school_id:'1000002',school_name:'B'},{school_id:'1000003',school_name:'C'},{school_id:'1000004',school_name:'D'}];
const basics=new Map([['1000001',{student_count:100,male_teacher_ratio:20,second_grade_teacher_ratio:5}],['1000002',{student_count:0,male_teacher_ratio:80,second_grade_teacher_ratio:25}],['1000003',{student_count:40,male_teacher_ratio:0,second_grade_teacher_ratio:0}]]);
const historical=new Map([['1000001',[100,null,20]],['1000002',[0,null,null]],['1000003',[20,30,40]]]);
const ids=x=>Array.from(x,r=>r.school_id);
for(const [metric,asc] of [['student_count',['1000002','1000003','1000001','1000004']],['male_teacher_ratio',['1000003','1000001','1000002','1000004']],['junior_teacher_ratio',['1000003','1000001','1000002','1000004']],['beagu_percentile_2025',['1000002','1000003','1000001','1000004']]]){
 assert.deepEqual(ids(api.rank(rows,metric,'asc',basics,historical)),asc);
 assert.deepEqual(ids(api.rank(rows,metric,'desc',basics,historical)),[...asc.slice(0,3).reverse(),'1000004']);
}
const client=fs.readFileSync('js/level-search.js','utf8');
assert.match(client,/await api\('verify'\)/);
assert.match(client,/ordered\.slice\(page\*LIMIT,\(page\+1\)\*LIMIT\)/);
assert.match(client,/common2026:null/);
assert.match(client,/official\?\.student_count/);
assert.doesNotMatch(client,/beagu_historical_mean_ranked_schools_v1|beagu_official_basics_ranked_schools_v1/);
console.log('PASS 6277 static official facts, all four global sorts, nulls, auth and existing public scope');
