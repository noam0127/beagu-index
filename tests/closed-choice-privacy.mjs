import assert from 'node:assert/strict';
import {historicalChoice,comparisonMean,sanitize2026Results,historicalOptions} from '../supabase/functions/_shared/closed-choice-privacy.mjs';
import {catalog} from '../supabase/functions/_shared/questionnaire-2026.mjs';
for(const [year,qs] of Object.entries(historicalOptions)){
 for(const [id,options] of Object.entries(qs)){
  for(const v of options)assert.equal(historicalChoice(Number(year),id,v),v);
  for(const v of ['기타: 테스트 서술','임의의 학교 내부 사정','① 테스트 서술','1 테스트 서술','기타(테스트 서술)'])assert.equal(historicalChoice(Number(year),id,v),null);
 }
}
assert.equal(historicalChoice(2025,'Q02','2 1회'),'② 1회');
assert.equal(historicalChoice(2024,'Q03','임의 응답'),null);
assert.equal(comparisonMean(2025,'Q01','32.5점'),'32.5점');
assert.equal(comparisonMean(2025,'Q01','기타: 테스트 서술'),null);
for(const [id,m] of Object.entries(catalog)){
 const row=m.kind==='grid'?0:-1;
 const options=m.kind==='grid'?m.columns:m.options;
 const valid=m.kind==='time'?'08:30':options[0];
 const actual=sanitize2026Results([{questionId:id,row,values:[valid,'기타: 테스트 서술'],privateText:'임의 서술',otherText:'임의 서술'}]);
 if(id==='Q31'||id==='Q51')assert.deepEqual(actual,[]);
 else if(valid)assert.deepEqual(actual,[{questionId:id,row,values:[valid]}]);
}
assert.deepEqual(sanitize2026Results([{questionId:'Q51',row:-1,values:['테스트 서술']}]),[]);
assert.deepEqual(sanitize2026Results([{questionId:'Q01',row:-1,values:['기타: 테스트 서술']}]),[]);
console.log('PASS closed-choice output, rejected arbitrary text, no extra fields, 2026 Q31/Q51 gate');
