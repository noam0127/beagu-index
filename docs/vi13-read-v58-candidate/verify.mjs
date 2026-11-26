import assert from 'node:assert/strict';
import {reconstructVI13,normalizeSourceTime,assessRevalidation} from './revalidate-source-v14.mjs';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {METHOD,parseVI13Sheet,validateVI13Push,verifySourceRecheckDigest} from './_shared/vi13-sheet-sync.mjs';
import {automaticVI13Values,autoSheetValues,autoSheetSelection,mergeVI13Selection,autoSheetTop10} from './_shared/vi13-read-projection.mjs';
import {normalizeTimeMinutes,sanitizeEditedQuestions} from './_shared/publication-v14-sanitize.mjs';
import {publicQuestionResults} from './_shared/results-2026.mjs';
globalThis.Deno={env:{get:()=> '1'}};
const n=604,stamp=new Date().toISOString(),rows=Array.from({length:n},(_,i)=>[String(7000000+i),'fixture','fixture',Math.round(1000*(n-i-1)/(n-1))/10,i+1,i<120?2:1,(i<120?2:1)*i*1000,0]);
rows[12][7]=1;
const values=[['VI13_SYNC_V1',stamp,604,724,METHOD,797,'PRIVATE',''],['school_id','school_name','region','percentile','rank','observations','sum_units','flags'],...rows];
const snap=parseVI13Sheet(values);
const c=r=>({percentile:r[3],identity:true,sourceAgreement:true,notice:true,smallSample:true,reidentification:true,priorCombination:true,manipulation:true,blocked:false});
let checks={generatedAt:stamp,schools:Object.fromEntries(rows.map(r=>[r[0],c(r)]))},calls=[];
const admin={rpc:async(name,params)=>{calls.push(name);if(name==='beagu_2026_vi13_sheet_read_v1')return {data:values};if(name==='beagu_2026_vi13_v14_checks')return {data:checks};throw Error(name);}};
const id='7000120',p=rows[120][3];
assert.deepEqual(await autoSheetValues(admin,[id],1),{});assert.equal(calls.length,0);
assert.deepEqual(await autoSheetValues(admin,[id],2),{[id]:p}); // n=1, no manual approval
assert.deepEqual(await autoSheetValues(admin,['7000012'],2),{}); // flagged
for(const key of ['identity','sourceAgreement','notice','smallSample','reidentification','priorCombination','manipulation']){
 const old=checks.schools[id][key];checks.schools[id][key]=null;assert.deepEqual(await autoSheetValues(admin,[id],2),{});checks.schools[id][key]=old;
}
checks.schools[id].blocked=true;assert.deepEqual(await autoSheetValues(admin,[id],2),{});checks.schools[id].blocked=false;
checks.schools[id].percentile=0;assert.deepEqual(await autoSheetValues(admin,[id],2),{});checks.schools[id].percentile=p;
assert.deepEqual(automaticVI13Values(snap,[id],{...checks,generatedAt:'stale'},2),{});
const top=await autoSheetTop10(admin,2);assert.equal(top.rows.length,10);assert.ok(top.rows.every(r=>Object.keys(r).sort().join(',')==='rank,region,school_id,school_name'));
await assert.rejects(autoSheetTop10(admin,1));checks.schools['7000000'].blocked=true;await assert.rejects(autoSheetTop10(admin,2));
assert.deepEqual(await autoSheetValues({rpc:async()=>({error:{}})},[id],2),{});
assert.equal(normalizeTimeMinutes('Q19',20*60+30),510);assert.equal(normalizeTimeMinutes('Q20',4*60+30),990);assert.equal(normalizeTimeMinutes('Q20',-1),null);
const q=(id,n,sum)=>({id,row:-1,valid:n,invalid:0,counts:[],minutes_sum:sum});
assert.deepEqual(publicQuestionResults([q('Q19',1,1230),q('Q20',1,270)]).map(x=>x.values[0]),['08:30','16:30']);
assert.deepEqual(publicQuestionResults([q('Q19',2,1000),q('Q31',1,0),q('Q50',1,0),q('Q51',1,0)]),[]);
assert.deepEqual(sanitizeEditedQuestions(['Q31','Q50','Q51','Q19'].map(questionId=>({questionId,row:-1,values:['private']}))),[]);
assert.deepEqual(sanitizeEditedQuestions([{questionId:'Q12',row:-1,values:['기타','free text','운영하지 않는다']}]),[{questionId:'Q12',row:-1,values:['운영하지 않는다']}]);
const source=readFileSync(new URL('beagu-level-api/index.ts',import.meta.url),'utf8');
assert.ok(source.indexOf('if(tier===1)return await sendSchoolProfiles({},{})')<source.indexOf('let sheetSelection:'));
assert.ok(source.includes('autoSheetSelection(admin,ids,tier)'));assert.ok(source.includes('sanitizeEditedQuestions(finalRow?.questions)'));
assert.ok(source.includes('const schoolQuestionResults2026=level!==2?[]'));assert.ok(source.includes('(m.year!==2026||(level===2&&tierPublished2026))'));assert.ok(!source.includes('lv1Approved2026'));
assert.ok(source.includes("Number(verified.access_level)<2"));assert.ok(!calls.some(x=>x.includes('approval')||x.includes('percentile_v13_values')));
const require=createRequire(import.meta.url),h=require('../../js/beagu-home-ranking-v1.js');assert.ok(h.validAuto(top));assert.equal(h.validAuto({...top,rows:top.rows.map(r=>({...r,percentile:100}))}),false);
console.log('PASS synthetic one-observation automatic gate, unknown/flagged/blocked denial, Lv0-1, time and private question protection');

const coreFixture=(n,idx=2)=>Array.from({length:13},(_,i)=>({id:'Q'+String(i+1).padStart(2,'0'),row:-1,valid:n,invalid:0,counts:Array.from({length:6},(_,j)=>j===idx?n:0)}));
const one=coreFixture(1),reconstructed=reconstructVI13(one,1);assert.ok(reconstructed&&Number.isSafeInteger(reconstructed.sumUnits));
const row={observations:1,sum_units:reconstructed.sumUnits,flags:0};
const older=assessRevalidation(row,one,'2026-11-23T08:00:00Z','2026-11-26T09:00:00Z');assert.equal(older.scoreAgreement,true);assert.equal(older.sourceAgreement,null);assert.equal(older.reidentification,null);
assert.equal(assessRevalidation(row,one,'2026-11-26T10:00:00Z','2026-11-26T09:00:00Z').sourceAgreement,true);
assert.equal(assessRevalidation({...row,sum_units:row.sum_units+1},one,'2026-11-26T10:00:00Z','2026-11-26T09:00:00Z').sourceAgreement,false);
const partial=coreFixture(2);partial[0].counts=[0,0,1,0,0,1];assert.equal(reconstructVI13(partial,2),null);
assert.equal(assessRevalidation({...row,flags:1},one,'2026-11-26T10:00:00Z','2026-11-26T09:00:00Z').manipulation,false);
assert.equal(reconstructVI13(coreFixture(1,0),1).extremePattern,true);
assert.equal(normalizeSourceTime('오후 8:30:00','Q19'),510);assert.equal(normalizeSourceTime('오전 4:30:00','Q20'),990);assert.equal(normalizeSourceTime('','Q19'),null);assert.equal(normalizeSourceTime('25:10','Q20'),null);
console.log('PASS read-only reconstruction and old-snapshot denial; source time normalization');

const preflight=readFileSync(new URL('./vi13-v14-preflight.sql',import.meta.url),'utf8');
assert.equal((preflight.match(/create or replace function/g)||[]).length,1);
assert.equal((preflight.match(/\$v14\$/g)||[]).length,2);
assert.ok(preflight.includes("'^Q(0[1-9]|1[0-3])$' and q->>'row'='-1'"));
assert.ok(preflight.includes("left join score_check v"));

// Cohort holds cannot be bypassed by edited/legacy values; non-cohort legacy remains.
const covered='7000120',outside='9999999';checks.schools[covered].blocked=true;
const selection=await autoSheetSelection(admin,[covered,outside],2);
assert.deepEqual(selection,{covered:[covered],values:{}});
assert.deepEqual(mergeVI13Selection({[covered]:99,[outside]:12},selection),{[outside]:12});
checks.schools[covered].blocked=false;
assert.deepEqual(mergeVI13Selection({[covered]:99},await autoSheetSelection(admin,[covered],2)),{[covered]:p});
await assert.rejects(autoSheetSelection({rpc:async()=>({error:{}})},[covered],2));
assert.ok(source.includes('autoSheetSelection(admin,[id],level)'));
assert.ok(source.includes("!(vi13Covered&&m.year===2026&&m.key==='percentile')"));
assert.ok(source.includes('mergeVI13Selection(values,sheetSelection)'));
assert.ok(source.includes('mergeVI13Selection(out,sheetSelection)'));
assert.ok(preflight.includes('exact_reproduced then true'));
assert.ok(preflight.includes('priorSurfaceOverlap'));
console.log('PASS cohort-specific fail-closed shared read path; historical legacy outside cohort preserved');

// Old snapshot remains valid; future source metadata is bounded and atomically retained.
const future=structuredClone(values),recheck={generatedAt:stamp,aggregateDigest:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(rows)))),b=>b.toString(16).padStart(2,'0')).join(''),version:'VI13_SOURCE_RECHECK_V1',source:'1T_rEz1LqX97pC9gOv33SRmspK2IizTU3wFtxA8P1pC4',sourceRows:797,schools:604,observations:724,extremeIds:['7000001']};
future[0][7]=JSON.stringify(recheck);
assert.deepEqual(parseVI13Sheet(future).verification,recheck);
assert.deepEqual(JSON.parse(validateVI13Push({kind:'VI13_SHEET_PUSH_V1',values:future})[0][7]),recheck);
for(const v of [{...recheck,observations:725},{...recheck,extremeIds:['9999999']},{...recheck,approval:true}]){
 const bad=structuredClone(future);bad[0][7]=JSON.stringify(v);assert.throws(()=>parseVI13Sheet(bad));
}
assert.equal(parseVI13Sheet(values).verification,null);
assert.ok(preflight.includes('UNRECOGNIZED_MANDATORY_ANSWER'));
assert.ok(preflight.includes('not exact_reproduced and verification is null'));
assert.ok(preflight.includes("verification->'extremeIds'"));
console.log('PASS source metadata schema, stale legacy and reason-specific blocker');

await verifySourceRecheckDigest(parseVI13Sheet(future));
const tampered=structuredClone(future);tampered[0][7]=JSON.stringify({...recheck,aggregateDigest:'0'.repeat(64)});
await assert.rejects(verifySourceRecheckDigest(parseVI13Sheet(tampered)),/DIGEST_MISMATCH/);
const copied=structuredClone(future);copied[0][1]=new Date(Date.parse(stamp)+1000).toISOString();assert.throws(()=>parseVI13Sheet(copied));
