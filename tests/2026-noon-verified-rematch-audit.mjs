import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const script=readFileSync('scripts/beagu-2026-noon-sync.gs','utf8');
const ctx={Date,Map,Set,Number,Object,Array,String,Math,RegExp,Error,JSON,Logger:{log:()=>{}}};
runInNewContext(script,ctx,{timeout:3000,filename:'beagu-2026-noon-sync.gs'});

const header=Array(51).fill('');
header[0]='타임스탬프';
header[1]='B01. 시도';
header[4]='B02. 학교지원청';
header[21]='B03. 공식 학교명';
header[22]='B04. 학교유형';
for(let n=1;n<=13;n++)header[23+n]='Q'+String(n).padStart(2,'0')+'. 문항';
const response=Array(51).fill('');
response[0]='2026. 11. 23 오후 5:05:00';
response[1]='부산';
response[4]='② 동래교육지원청';
response[21]='검증초등학교';
response[22]='공립';
const schools=[{school_id:'7000001',school_name:'검증초등학교',sido_standard:'부산',support_office:'부산광역시동래교육지원청',establishment:'공립'}];
const auditHead=['원본행','기존 보류 사유','최신 학교 MASTER 재분류','공식학교ID(정확 일치만)','원본행 대조','공개 상태','후속 처리'];
const good=[2,'학교 MASTER 미매칭','UNIQUE_EXACT_MATCH_RECHECK','7000001','원본 기본정보 일치','공개 증빙 미확인 · 비공개','재집계'];
let rows=[auditHead,good];
const log=[];
ctx.Logger={log:value=>log.push(value)};
ctx.SpreadsheetApp={openById:id=>{
  assert.equal(id,'1I9SXXmOCnyeWP3RjoBHW5Tfvg0RpgR4RjnEVoxZvpp8');
  return {getSheetByName:name=>{
    assert.equal(name,'2026_학교매칭_재검증_1124');
    return {getLastRow:()=>rows.length,getRange:(r,c,n,k)=>{
      assert.deepEqual([r,c,n,k],[1,1,rows.length,7]);
      return {getDisplayValues:()=>rows};
    }};
  }};
}};
const values=[header,response];
const fresh=ctx.readBeagu2026VerifiedRematches(values,schools);
assert.equal(fresh.verified,1);
assert.equal(fresh.stale,0);
assert.equal(fresh.verifiedRematches.get(2).schoolId,'7000001');
assert.equal(ctx.resolveSchool(response,ctx.questionColumns(header),schools,fresh.verifiedRematches,2).school.school_id,'7000001');
assert.ok(log.join(' ').includes('유효 1건'));

rows=[auditHead,[...good.slice(0,3),'7000002',...good.slice(4)]];
const changedId=ctx.readBeagu2026VerifiedRematches(values,schools);
assert.equal(changedId.verified,0);
assert.equal(changedId.stale,1);
assert.equal(ctx.resolveSchool(response,ctx.questionColumns(header),schools,changedId.verifiedRematches,2).school,undefined);

rows=[auditHead,good];
const editedResponse=[...response];editedResponse[21]='다른초등학교';
const changedResponse=ctx.readBeagu2026VerifiedRematches([header,editedResponse],schools);
assert.equal(changedResponse.verified,0);
assert.equal(changedResponse.stale,1);
assert.equal(ctx.resolveSchool(editedResponse,ctx.questionColumns(header),schools,changedResponse.verifiedRematches,2).school,undefined);

rows=[auditHead,[2,'학교명 확인 필요','SCHOOL_IDENTITY_REVIEW','','원본 기본정보 일치','비공개','수동 검토']];
const notApproved=ctx.readBeagu2026VerifiedRematches(values,schools);
assert.equal(notApproved.verifiedRematches.size,0);

rows=[auditHead,good,good];
assert.throws(()=>ctx.readBeagu2026VerifiedRematches(values,schools),/중복·부정확/);
rows=[auditHead,[...good.slice(0,4),'원본 변경',...good.slice(5)]];
const staleFlag=ctx.readBeagu2026VerifiedRematches(values,schools);
assert.equal(staleFlag.stale,1);

assert.match(script,/readBeagu2026VerifiedRematches\(values,schools\)/);
assert.match(script,/resolveSchool\(r,columns,schools,verifiedRematches,i\+1\)/);
assert.match(script,/resolveSchool\(r,c,schools,verifiedRematches,sourceIndex\+1\)/);
assert.match(script,/beagu26BuildResults\(values,schools,BEAGU26_QUESTION_CATALOG,verifiedRematches\)/);
assert.match(script,/last=headers\.findIndex\(h=>\/\^Q50/);
assert.doesNotMatch(script,/getRange\(1,1,Math\.max\(1,rowCount\),source\.getLastColumn\(\)\)/);
console.log('PASS: 2026 verified rematches feed both private aggregators with source/ID check and no forced publication');
