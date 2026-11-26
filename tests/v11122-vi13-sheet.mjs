import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {METHOD,parseVI13Sheet,permittedVI13Values,publicVI13Top10} from '../supabase/functions/_shared/vi13-sheet-sync.mjs';
const ctx=vm.createContext({});vm.runInContext(readFileSync('scripts/beagu-2026-noon-sync.gs','utf8'),ctx);vm.runInContext(readFileSync('scripts/beagu-2026-vi13-sheet-sync.gs','utf8'),ctx);
const schools=Array.from({length:572},(_,i)=>({school_id:String(7000000+i),school_name:'fixture',sido_standard:'서울',support_office:'북부',status:'운영'}));
const groups=schools.map((s,i)=>({school_id:s.school_id,observations:1,sum_units:i<2?0:Math.min(i,100)*360360,flags:0}));
const rows=ctx.beagu26VI13Rank(groups,schools);
assert.equal(rows[0].percentile,99.8);assert.equal(rows[0].rank,1);assert.equal(rows[1].rank,1);assert.equal(rows[2].rank,3);
const prior=groups.map(g=>[g.school_id,g.observations,g.sum_units,360360]);assert.ok(ctx.beagu26VI13CheckBaseline(rows,prior).ok);assert.ok(!ctx.beagu26VI13CheckBaseline(rows.slice(1),prior).ok);
const stamp='2026-11-26T00:00:00Z',matrix=[['VI13_SYNC_V1',stamp,572,572,METHOD,572,'PRIVATE',''],['school_id','school_name','region','percentile','rank','observations','sum_units','flags'],...Array.from(rows,r=>[r.school_id,r.school_name,r.region,r.percentile,r.rank,r.observations,r.sum_units,r.flags])];
const snapshot=parseVI13Sheet(matrix,Date.parse(stamp)),approved=Object.fromEntries(snapshot.rows.map(r=>[r.school_id,r.percentile]));
assert.equal(publicVI13Top10(snapshot,approved).rows.length,10);assert.ok(publicVI13Top10(snapshot,approved).rows.every(r=>Object.keys(r).length===4&&!('percentile' in r)));
assert.throws(()=>publicVI13Top10(snapshot,{}));assert.deepEqual(permittedVI13Values(snapshot,[schools[0].school_id],{}),{});
assert.deepEqual(permittedVI13Values(snapshot,[schools[0].school_id],approved),{[schools[0].school_id]:99.8});
const numericMatrix=matrix.map((r,i)=>i<2?r:[Number(r[0]),...r.slice(1)]);
assert.deepEqual(parseVI13Sheet(numericMatrix,Date.parse(stamp)),snapshot);
const mixedMatrix=matrix.map((r,i)=>i<2||i%2?r:[Number(r[0]),...r.slice(1)]);
assert.deepEqual(parseVI13Sheet(mixedMatrix,Date.parse(stamp)),snapshot);
for(const id of [123456,12345678,7000000.5,null,true,' 7000000','07000000']){
 const bad=matrix.map(r=>r.slice());bad[2][0]=id;assert.throws(()=>parseVI13Sheet(bad,Date.parse(stamp)),/VI13_SHEET_ROW/);
}
const duplicate=matrix.map(r=>r.slice());duplicate[3][0]=Number(duplicate[2][0]);assert.throws(()=>parseVI13Sheet(duplicate,Date.parse(stamp)),/VI13_SHEET_ROW/);
assert.throws(()=>parseVI13Sheet(matrix,Date.parse(stamp)+49*3600000));
console.log('PASS VI13 cohort baseline, exact ties, freshness and disclosure');
