import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';

const read=path=>fs.readFileSync(path,'utf8');
const code=read('js/beagu-sms-consent-v1.js');
function element({checked=false,value=''}={}){
 const events=new Map();
 return {checked,value,disabled:false,
  addEventListener(type,callback){events.set(type,callback)},
  change(){events.get('change')?.()}
 };
}
function harness(){
 const phone=element({value:'010-9999-8888'});
 const collectionConsent=element({checked:true});
 const marketingConsent=element({checked:true});
 const window={};
 vm.runInNewContext(code,{window},{timeout:1000});
 const sms=window.BeaguSmsConsent.create({phone,collectionConsent,marketingConsent});
 return {sms,phone,collectionConsent,marketingConsent};
}
test('both choices start unchecked; optional phone field is blank and disabled',()=>{
 const h=harness();
 assert.equal(h.collectionConsent.checked,false);
 assert.equal(h.marketingConsent.checked,false);
 assert.equal(h.phone.disabled,true);
 assert.equal(h.phone.value,'');
 const p=h.sms.payload();
 assert.equal(p.ok,true);
 assert.deepEqual(JSON.parse(JSON.stringify(p.consent)),{
  beagu_sms_opt_in:false,beagu_phone_collection_opt_in:false,beagu_sms_phone:null
 });
});
test('account signup is allowed without either consent, even if a phone was typed',()=>{
 const h=harness();h.phone.value='01012345678';
 const p=h.sms.payload();
 assert.equal(p.ok,true);
 assert.equal(p.consent.beagu_sms_phone,null);
 assert.equal(p.consent.beagu_sms_opt_in,false);
 assert.equal(p.consent.beagu_phone_collection_opt_in,false);
});
test('phone collection consent alone is not enough to collect or transmit a number',()=>{
 const h=harness();
 h.collectionConsent.checked=true;h.collectionConsent.change();
 assert.equal(h.phone.disabled,true);
 assert.equal(h.sms.payload().ok,false);
 assert.equal(h.sms.payload().reason,'consent-incomplete');
});
test('SMS receipt consent alone never authorizes collection',()=>{
 const h=harness();
 h.marketingConsent.checked=true;h.marketingConsent.change();
 assert.equal(h.phone.disabled,true);
 assert.equal(h.sms.payload().reason,'consent-incomplete');
});
test('two explicit choices enable phone, and valid digits are normalized',()=>{
 const h=harness();
 h.collectionConsent.checked=true;h.collectionConsent.change();
 h.marketingConsent.checked=true;h.marketingConsent.change();
 assert.equal(h.phone.disabled,false);
 h.phone.value='010-2345-6789';
 const p=h.sms.payload();
 assert.equal(p.ok,true);
 assert.deepEqual(JSON.parse(JSON.stringify(p.consent)),{
  beagu_sms_opt_in:true,beagu_phone_collection_opt_in:true,beagu_sms_phone:'01023456789'
 });
});
test('malformed number, foreign dial prefix and blank number cannot be sent',()=>{
 const h=harness();
 h.collectionConsent.checked=true;h.marketingConsent.checked=true;h.sms.sync();
 for(const number of ['', '010-1234', '011-2345-6789','+82-10-2345-6789','010-2345-67890']){
  h.phone.value=number;
  const p=h.sms.payload();
  assert.equal(p.ok,false,number);
  assert.equal(p.reason,'phone-input');
 }
});
test('revoking either consent clears any typed phone and disables input',()=>{
 for(const field of ['collectionConsent','marketingConsent']){
  const h=harness();h.collectionConsent.checked=true;h.marketingConsent.checked=true;h.sms.sync();
  h.phone.value='01023456789';
  h[field].checked=false;h[field].change();
  assert.equal(h.phone.value,'');
  assert.equal(h.phone.disabled,true);
  assert.notEqual(h.sms.payload().ok,true);
 }
});
test('clear after signup erases phone, both choices, and browser entry eligibility',()=>{
 const h=harness();h.collectionConsent.checked=true;h.marketingConsent.checked=true;
 h.sms.sync();h.phone.value='01023456789';
 h.sms.clear();
 assert.equal(h.collectionConsent.checked,false);
 assert.equal(h.marketingConsent.checked,false);
 assert.equal(h.phone.value,'');
 assert.equal(h.phone.disabled,true);
});
test('both signup pages clearly disclose collection, marketing and withdrawal separately',()=>{
 const pages=[
  ['challenge.html','challengeMemberSmsCollectionConsent','challengeMemberSmsConsent','challengeMemberSmsPhone'],
  ['postit.html','postitSmsCollectionConsent','postitSmsConsent','postitSmsPhone']
 ];
 for(const [page,collection,marketing,phone] of pages){
  const html=read(page);
  for(const id of [collection,marketing]){
   const checkbox=html.match(new RegExp('<input[^>]*id="'+id+'"[^>]*>'))?.[0];
   assert.ok(checkbox,id);
   assert.match(checkbox,/type="checkbox"/);
   assert.doesNotMatch(checkbox,/\bchecked(?:\s|=|>)/);
  }
  const tel=html.match(new RegExp('<input[^>]*id="'+phone+'"[^>]*>','s'))?.[0];
  assert.ok(tel,page);
  assert.match(tel,/disabled/);
  assert.match(tel,/autocomplete="off"/);
  assert.match(html,/보유 기간/);
  assert.match(html,/불이익이 없습니다/);
  assert.match(html,/동의를 철회/);
  assert.match(html,/광고성 정보/);
  assert.ok(html.indexOf('js/beagu-sms-consent-v1.js')>=0);
  assert.ok(html.indexOf('js/beagu-sms-consent-v1.js')<
    html.indexOf(page==='challenge.html'?'js/challenge-member-auth-v1.js':'js/postit-account-v1.js'));
 }
});
test('signup handlers use shared consent payload and clear both choices on unsubscribe',()=>{
 for(const path of ['js/challenge-member-auth-v1.js','js/postit-account-v1.js']){
  const js=read(path);
  assert.match(js,/window\.BeaguSmsConsent\.create/);
  assert.match(js,/smsPrivacy\.payload\(\)/);
  assert.match(js,/data:selection\.consent/);
  assert.match(js,/smsPrivacy\.clear\(\)/);
  assert.match(js,/beagu_phone_collection_opt_in:false,beagu_sms_phone:null/);
  assert.doesNotMatch(js,/beagu_sms_phone:wantsSms\?mobile:null/);
 }
 assert.doesNotMatch(code,/localStorage|sessionStorage|console\.log|innerHTML/);
});
test('one incomplete opt-in has safe actionable feedback and does not imply signup rejection',()=>{
 const errorSource=read('js/beagu-auth-errors-v1.js');
 const window={};vm.runInNewContext(errorSource,{window},{timeout:1000});
 const node={dataset:{},textContent:''};
 const state=window.BeaguAuthErrorUI.show(node,'sms-consent-incomplete');
 assert.equal(state,'sms-consent-incomplete');
 assert.match(node.textContent,/두 항목을 모두 해제하면/);
 assert.doesNotMatch(node.textContent,/필수 동의|가입할 수 없습니다/);
});
