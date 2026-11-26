// Run the actual Apps Script functions in a sandbox with synthetic data only.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {createHash} from 'node:crypto';
import {parseVI13Sheet,validateVI13Push,verifySourceRecheckDigest,METHOD} from './_shared/vi13-sheet-sync.mjs';
const source=readFileSync(new URL('../../scripts/beagu-2026-noon-sync.gs',import.meta.url),'utf8');
const sync=readFileSync(new URL('./source/beagu-2026-vi13-sheet-sync.gs',import.meta.url),'utf8');
const header=['타임스탬프','B01. 지역','B02. 관할','B03. 학교','B04. 유형',...Array.from({length:13},(_,i)=>'Q'+String(i+1).padStart(2,'0')+'. fixture')];
const schools=Array.from({length:604},(_,i)=>({school_id:String(7000000+i),school_name:i===0?'과천가상초등학교':i===1?'별빛초등학교':'가상학교'+i+'초등학교',sido_standard:i===0?'경기':'충남',support_office:i===0?'안양과천교육지원청':'천안교육지원청',establishment:'공립',status:'운영'}));
const middle=Array(11).fill('③ 보통이다').concat('② 희망자만 참여한다','② 요청은 있지만 자유롭게 거절할 수 있다');
const row=(i,opts=middle,ts='2026. 11. 2. 오전 10:00:00',name=schools[i].school_name,type='공립')=>[ts,schools[i].sido_standard,schools[i].support_office,name,type,...opts];
const rows=[header];
for(let i=0;i<604;i++){
 let opts=[...middle];
 if(i===2)opts=Array(11).fill('① 전혀 그렇지 않다').concat(middle.slice(11));
 if(i===3){opts[0]='⑥ 판단하기 어렵다';opts[1]='⑥ 판단하기 어렵다';opts[5]='⑥ 판단하기 어렵다';opts[9]='⑥ 판단하기 어렵다';}
 if(i===4)opts[0]='invalid choice';
 rows.push(row(i,opts,'2026. 11. 2. 오전 10:00:00',i===0?'가상초':i===1?'별빛초등학':schools[i].school_name));
 if(i<120)rows.push(row(i,opts,i===5?'2026. 11. 2. 오전 10:00:00':'2026. 11. 2. 오전 10:00:01'));
}
rows.push(row(0,middle,'2026. 10. 31. 오전 10:00:00'));
rows.push(row(0,middle,'2026. 11. 2. 오전 10:00:02','가상초','사립'));
rows.push(row(1,Array(13).fill(''),'2026. 11. 2. 오전 10:00:03'));
const ctx={fixtureRows:rows,fixtureSchools:schools,Utilities:{DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(_a,s)=>Array.from(createHash('sha256').update(s,'utf8').digest(),b=>b>127?b-256:b)}};
const result=JSON.parse(runInNewContext(source+'\n'+sync+`\n
 const first=beagu26BuildVI13(fixtureRows,fixtureSchools,beagu26VI13Resolve);
 const ranked=beagu26VI13Rank(first.schools,fixtureSchools);
 const check=beagu26VI13SecondPass(fixtureRows,fixtureSchools,ranked);
 let rejected=false;try{beagu26VI13SecondPass(fixtureRows,fixtureSchools,ranked.map((r,i)=>i===0?{...r,sum_units:r.sum_units+1}:r));}catch(e){rejected=e.message==='VI13_INDEPENDENT_RECHECK_MISMATCH';}
 JSON.stringify({first,ranked,check,rejected});
 `,ctx,{timeout:10000}));
assert.equal(result.ranked.length,604);assert.equal(result.check.observations,724);
assert.equal(result.check.sourceRows,727);assert.equal(result.first.unmatched,1);assert.equal(result.first.invalid,1);assert.equal(result.first.excluded,1);
assert.equal(result.ranked.find(r=>r.school_id==='7000000').observations,2);
assert.equal(result.ranked.find(r=>r.school_id==='7000001').observations,2);
assert.equal(result.ranked.find(r=>r.school_id==='7000003').flags,0);
assert.equal(result.ranked.find(r=>r.school_id==='7000004').flags,2);
assert.equal(result.ranked.find(r=>r.school_id==='7000005').flags,2);
assert.ok(result.check.extremeIds.includes('7000002'));assert.equal(result.rejected,true);
const generatedAt=new Date().toISOString(),values=[['VI13_SYNC_V1',generatedAt,604,724,METHOD,727,'PRIVATE',JSON.stringify({...result.check,generatedAt})],['school_id','school_name','region','percentile','rank','observations','sum_units','flags'],...result.ranked.map(r=>[r.school_id,r.school_name,r.region,r.percentile,r.rank,r.observations,r.sum_units,r.flags])];
const verified=validateVI13Push({kind:'VI13_SHEET_PUSH_V1',values});
await verifySourceRecheckDigest(parseVI13Sheet(verified));
const changed=structuredClone(verified);changed[2][1]+=' changed';
await assert.rejects(verifySourceRecheckDigest(parseVI13Sheet(changed)),/DIGEST_MISMATCH/);
console.log('PASS actual first/second Apps Script aggregation: 604 synthetic schools, 724 observations; aliases, missing/domain, duplicate, extreme, mismatched snapshot, digest');
