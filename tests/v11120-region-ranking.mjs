import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {readRegionRanking}=createRequire(import.meta.url)('../js/beagu-region-interest-v1.js');
const calls=[];const mock=(...responses)=>({rpc:async(name)=>{calls.push(name);return responses.shift();}});
const rows=Array.from({length:10},(_,i)=>({region:'fixture',office:String(i)}));
assert.deepEqual(await readRegionRanking(mock({data:rows,error:null})),{data:rows,limit:10});
assert.deepEqual(calls.splice(0),['beagu_region_interest_top10_v1']);
for(const code of ['PGRST202','42883']){
 assert.deepEqual(await readRegionRanking(mock({error:{code}},{data:rows.slice(0,5),error:null})),{data:rows.slice(0,5),limit:5});
 assert.deepEqual(calls.splice(0),['beagu_region_interest_top10_v1','beagu_region_interest_top5_v1']);
}
await assert.rejects(readRegionRanking(mock({error:{code:'42501'}})));
assert.deepEqual(calls.splice(0),['beagu_region_interest_top10_v1']);
await assert.rejects(readRegionRanking(mock({error:{code:'PGRST202'}},{error:{code:'42501'}})));
console.log('PASS region TOP10, legacy compatibility, denied access fail closed');
