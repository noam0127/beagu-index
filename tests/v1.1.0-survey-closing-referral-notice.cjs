const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const gs=fs.readFileSync('scripts/beagu-2026-referral-integration.gs','utf8');
const survey=fs.readFileSync('survey.html','utf8');
const linkJs=fs.readFileSync('js/beagu-referral-form-v1.js','utf8');
const config=fs.readFileSync('js/beagu-referral-form-config-v1.js','utf8');

const SHEET='1T_rEz1LqX97pC9gOv33SRmspK2IizTU3wFtxA8P1pC4';
const CODE_TITLE='배구지수 추천 확인코드 (전용 링크 자동입력 · 수정하지 마세요)';
const NOTICE_TITLE='링크를 알려주신 선생님께 선물을 보내주세요!';
function fixture(){
 let nextId=300,add=0,moved=0,changed=0,submit=0;
 const items=[];
 function item(type,title,id=++nextId){
  const o={type,title,id,help:'',required:type==='TEXT',
   getType(){return this.type},getId(){return this.id},getTitle(){return this.title},
   getIndex(){return items.indexOf(this)},getHelpText(){return this.help},
   setTitle(s){changed++;this.title=s;return this},setHelpText(s){changed++;this.help=s;return this},
   setRequired(v){this.required=v;return this},asTextItem(){return this}};
  return o;
 }
 const q1=item('TEXT','2026 필수 항목 Q01'),q2=item('TEXT','2026 필수 항목 Q13');
 const code=item('TEXT',CODE_TITLE,741258);code.required=false;
 items.push(q1,q2,code);
 const form={
  getDestinationId:()=>SHEET,
  getItems(type){return type?items.filter(it=>it.type===type):[...items]},
  addSectionHeaderItem(){add++;const o=item('SECTION_HEADER','');items.push(o);return o},
  moveItem(o,index){moved++;const original=items.indexOf(o);assert.ok(original>=0);
   assert.ok(index>=0&&index<items.length);items.splice(original,1);items.splice(index,0,o);return o},
  createResponse(){submit++;throw Error('NO_FORM_RESPONSE_MUST_BE_CREATED')},
  getPublishedUrl:()=> 'https://docs.google.com/forms/d/e/TEST/viewform',
  getId:()=> 'form-test'
 };
 const calls=[], logs=[];
 const ctx={SpreadsheetApp:{openById(id){assert.equal(id,SHEET);return{getSheetByName:name=>{
  assert.equal(name,'설문지 응답 시트1');return {getFormUrl:()=> 'https://docs.google.com/forms/d/test/edit'};
 }}}},
  FormApp:{openByUrl:url=>{assert.equal(url,'https://docs.google.com/forms/d/test/edit');return form},
   ItemType:{TEXT:'TEXT',SECTION_HEADER:'SECTION_HEADER'}},
  Logger:{log:v=>logs.push(v)},
  PropertiesService:{getScriptProperties:()=>({getProperty:()=>'',setProperty:()=>{}})},
  Object,Number,String,Date,Error,Map,Set,JSON
 };
 vm.createContext(ctx);vm.runInContext(gs,ctx,{filename:'beagu-2026-referral-integration.gs'});
 return{ctx,form,items,q1,q2,code,logs,calls,
  count:()=>({add,moved,changed,submit})};
}
function assertNoChanges(before,after){assert.deepEqual(after,before)}
const f=fixture();
const before={items:f.items.map(it=>it.id),...f.count()};
const planned=f.ctx.previewBeaguReferralFormClosingNotice();
assert.equal(planned.ready,true);
assert.equal(planned.exists,false);
assert.equal(planned.questionId,741258);
assertNoChanges(before,{items:f.items.map(it=>it.id),...f.count()});
f.ctx.prepareBeaguReferralFormClosingNotice();
assert.equal(f.items.length,4);
assert.deepEqual(f.items.map(it=>it.id).slice(0,2),[f.q1.id,f.q2.id]);
assert.equal(f.items[2].title,NOTICE_TITLE);
assert.equal(f.items[2].type,'SECTION_HEADER');
assert.equal(f.items[3].id,741258,'existing code question must remain last');
assert.equal(f.code.required,false);
assert.equal(f.items.filter(it=>it.title===NOTICE_TITLE).length,1);
assert.ok(f.items[2].help.includes('자동 입력된 추천 확인코드는 수정하지 않고'));
assert.ok(f.items[2].help.includes('유효성이 확인된 경우에만'));
assert.ok(f.items[2].help.includes('Lv2 참여코드(비활성)'));
assert.ok(f.items[2].help.includes('Lv.1 인증'));
assert.ok(f.items[2].help.includes('챌린지'));
assert.equal(f.count().submit,0,'never manufacture responses');
const afterFirst=f.count();
assert.equal(f.ctx.previewBeaguReferralFormClosingNotice().exists,true);
f.ctx.prepareBeaguReferralFormClosingNotice();
assert.equal(f.items.length,4);
assert.equal(f.count().add,afterFirst.add,'repeated install must not add another header');
assert.equal(f.count().moved,afterFirst.moved,'repeated install must not reorder questions');
assert.equal(f.count().submit,0);

const missing=fixture();
missing.items.pop();
assert.throws(()=>missing.ctx.previewBeaguReferralFormClosingNotice(),/정확히 1개/);
assert.throws(()=>missing.ctx.prepareBeaguReferralFormClosingNotice(),/정확히 1개/);
assert.equal(missing.count().add,0);
const duplicate=fixture();
duplicate.items.push(duplicate.code);
assert.throws(()=>duplicate.ctx.prepareBeaguReferralFormClosingNotice(),/정확히 1개/);
assert.equal(duplicate.count().add,0);
const notLast=fixture();
notLast.items.push(notLast.items.shift());
assert.throws(()=>notLast.ctx.prepareBeaguReferralFormClosingNotice(),/마지막 문항이 아닙니다/);
assert.equal(notLast.count().add,0);

assert.match(gs,/form\.getDestinationId\(\)!==BEAGU_REFERRAL_2026\.spreadsheetId/);
assert.match(gs,/function previewBeaguReferralFormClosingNotice\(/);
assert.match(gs,/function prepareBeaguReferralFormClosingNotice\(/);
assert.match(gs,/form\.moveItem\(notice,plan\.code\.getIndex\(\)\)/);
assert.doesNotMatch(gs,/\.setConfirmationMessage\(|\.submit\(\)|getRespondentEmail/);
assert.match(linkJs,/location\.replace\(form\.toString\(\)\)/);
assert.match(config,/entryName: 'entry\.2096012680'/);
assert.ok(survey.includes('id="surveyFormLink"'));
assert.ok(!gs.includes('approval_status=\'APPROVED\''));
console.log('PASS: stage26 read-only preview; idempotent final Form header; no question changes, auto-credit or form writes without owner action');
