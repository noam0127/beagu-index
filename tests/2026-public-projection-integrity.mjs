import assert from 'node:assert/strict';
import {catalog} from '../supabase/functions/_shared/questionnaire-2026.mjs';
import {publicQuestionResults} from '../supabase/functions/_shared/results-2026.mjs';
const q={id:'Q01',row:-1,valid:1,invalid:0,counts:catalog.Q01.options.map((_,i)=>i===0?1:0),minutes_sum:0};
assert.deepEqual(publicQuestionResults([q]),[{questionId:'Q01',row:-1,values:[catalog.Q01.options[0]]}]);
for(const change of [x=>({...x,valid:-1}),x=>({...x,valid:1.5}),x=>({...x,valid:50001}),x=>({...x,invalid:1}),x=>({...x,row:0}),x=>({...x,counts:[]}),x=>({...x,counts:x.counts.map(()=>0)}),x=>({...x,counts:x.counts.map(()=>1)}),x=>({...x,counts:[...x.counts.slice(0,-1),-1]}),x=>({...x,minutes_sum:1}),x=>({...x,raw_answers:['private']}),x=>({...x,id:'Q31'}),x=>({...x,id:'Q51'}),x=>({...x,id:'__proto__'})]){
 assert.deepEqual(publicQuestionResults([change(q)]),[]);
}
assert.deepEqual(publicQuestionResults([q,{...q}]),[]);
assert.deepEqual(publicQuestionResults([null,q]),publicQuestionResults([q]));
assert.deepEqual(publicQuestionResults(null),[]);
const other=Object.entries(catalog).find(([id,m])=>!['Q31','Q51'].includes(id)&&m.kind!=='grid'&&m.options.includes('기타'));
assert.ok(other);
const [id,m]=other;
assert.deepEqual(publicQuestionResults([{...q,id,counts:m.options.map(v=>v==='기타'?1:0)}]),[]);
console.log('PASS: malformed and duplicate aggregates withheld; Q31/Q51 and free-form choices excluded; approved ordinary result retained');
