import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('js/beagu-sms-account-settings-v2.js','utf8');
const sql=fs.readFileSync('supabase/migrations/20261121230000_beagu_member_sms_consent_secure_v2.sql','utf8');
const api=fs.readFileSync('supabase/functions/beagu-member-sms-api-v2/index.ts','utf8');
const flush=async()=>{for(let n=0;n<5;n++)await new Promise(r=>setImmediate(r));};
function node(){
 const handlers=new Map();
 return {hidden:false,disabled:false,textContent:'',value:'',
  addEventListener(type,fn){handlers.set(type,fn)},
  async click(){const fn=handlers.get('click');assert.ok(fn);await fn();}
 };
}
function create({error=false,initialConsent=false}={}){
 const container=node(),save=node(),withdraw=node(),status=node();
 let choice={ok:true,consent:{beagu_sms_phone:'01023456789',beagu_sms_opt_in:true}};
 const records=[],consent={payload(){return choice},clear(){records.push('clear')}};
 const requests=[];
 const client={functions:{
  async invoke(name,opts){
   requests.push({name,body:opts.body});
   if(error)return {data:null,error:{message:'SECRET_DO_NOT_SHOW'}};
   if(opts.body.action==='status'){
    return {data:{ok:true,consented:initialConsent},error:null};
   }
   if(opts.body.action==='opt_in')
    return {data:{ok:true,consented:true,phoneVerified:false,sendEligible:false},error:null};
   if(opts.body.action==='withdraw')
    return {data:{ok:true,consented:false},error:null};
   return {data:null,error:{message:'unsupported'}};
  }
 }};
 const window={};
 vm.runInNewContext(source,{window},{timeout:1300});
 const settings=window.BeaguSmsAccountSettings.create({
  client,container,save,withdraw,status,consent
 });
 return {settings,container,save,withdraw,status,requests,records,
  changeChoice(v){choice=v}};
}
const identity={user:{id:'fake-user',email_confirmed_at:'2026-11-21'},token:'synthetic-token'};
test('unverified user never sees active consent settings or calls API',async()=>{
 const h=create();
 await h.settings.showFor({user:{id:'fake-user',email_confirmed_at:null},token:'fake'});
 assert.equal(h.container.hidden,true);
 assert.equal(h.requests.length,0);
});
test('verified login fetches only a non-PII consent status',async()=>{
 const h=create({initialConsent:true});
 await h.settings.showFor(identity);
 assert.equal(h.container.hidden,false);
 assert.equal(h.requests.length,1);
 assert.equal(h.requests[0].name,'beagu-member-sms-api-v2');
 assert.deepEqual(JSON.parse(JSON.stringify(h.requests[0].body)),{action:'status'});
 assert.equal(h.withdraw.hidden,false);
 assert.doesNotMatch(h.status.textContent,/01023456789|synthetic-token/);
});
test('opt-in sends phone only to authenticated protected endpoint after both choices',async()=>{
 const h=create();
 await h.settings.showFor(identity);
 await h.save.click();
 const q=h.requests.find(x=>x.body.action==='opt_in');
 assert.ok(q);
 assert.equal(q.body.phone,'01023456789');
 assert.equal(q.body.collectionConsent,true);
 assert.equal(q.body.smsConsent,true);
 assert.equal(q.body.user_id,undefined);
 assert.equal(q.body.phoneVerified,undefined);
 assert.equal(q.body.policyVersion,undefined);
 assert.equal(h.withdraw.hidden,false);
 assert.ok(h.records.length>=2);
 assert.doesNotMatch(h.status.textContent,/01023456789/);
});
test('partial or invalid opt-in is blocked locally and reveals no phone',async()=>{
 const h=create();
 await h.settings.showFor(identity);
 h.changeChoice({ok:false,reason:'consent-incomplete'});
 await h.save.click();
 assert.equal(h.requests.filter(x=>x.body.action==='opt_in').length,0);
 assert.match(h.status.textContent,/모두 동의/);
 h.changeChoice({ok:false,reason:'phone-input'});
 await h.save.click();
 assert.equal(h.requests.filter(x=>x.body.action==='opt_in').length,0);
 assert.match(h.status.textContent,/11자리/);
});
test('withdrawal calls protected endpoint and only then confirms phone deletion',async()=>{
 const h=create({initialConsent:true});
 await h.settings.showFor(identity);
 await h.withdraw.click();
 assert.deepEqual(JSON.parse(JSON.stringify(h.requests.at(-1).body)),{action:'withdraw'});
 assert.equal(h.withdraw.hidden,true);
 assert.match(h.status.textContent,/번호 삭제가 서버에서 확인/);
});
test('error cannot claim successful deletion nor expose API error internals',async()=>{
 const h=create({error:true,initialConsent:true});
 await h.settings.showFor(identity);
 assert.match(h.status.textContent,/상태를 확인할 수 없습니다/);
 await h.withdraw.click();
 assert.match(h.status.textContent,/확인하지 못했습니다/);
 assert.doesNotMatch(h.status.textContent,/SECRET_DO_NOT_SHOW/);
});
test('signing out hides form and revokes retained phone entry',async()=>{
 const h=create();
 await h.settings.showFor(identity);
 h.settings.hide();
 assert.equal(h.container.hidden,true);
 assert.equal(h.withdraw.hidden,true);
 assert.equal(h.records.length>=2,true);
});
test('only approved server-verified client can authorize SMS API, never signup metadata',()=>{
 assert.match(api,/db\.auth\.getUser\(jwt\)/);
 assert.match(api,/user\.email_confirmed_at/);
 assert.match(api,/user\.is_anonymous/);
 assert.match(api,/p_user:user\.id/);
 assert.match(api,/p_request_id:crypto\.randomUUID\(\)/);
 assert.match(api,/db\.rpc\("beagu_member_sms_grant_v2"/);
 assert.match(api,/db\.rpc\("beagu_member_sms_withdraw_v2"/);
 assert.match(api,/db\.auth\.admin\.updateUserById/);
 assert.match(api,/beagu_sms_phone:null/);
 assert.doesNotMatch(api,/console\.log|console\.error|raw_user_meta_data/);
 assert.doesNotMatch(api,/await db\.auth\.getUser\([^)]+body\./);
 assert.doesNotMatch(source,/localStorage|sessionStorage|user_metadata/);
});
test('private migration replaces mutable Auth metadata trigger and restricts RPC to service role',()=>{
 assert.match(sql,/drop trigger if exists capture_member_sms_consent_v1 on auth\.users/);
 assert.match(sql,/drop function if exists beagu_private\.capture_member_sms_consent_v1/);
 assert.match(sql,/beagu_private\.member_sms_subscriptions_v1/);
 assert.match(sql,/beagu_private\.member_sms_consent_events_v2/);
 assert.match(sql,/enable row level security/g);
 assert.match(sql,/revoke all on function public\.beagu_member_sms_grant_v2/);
 assert.match(sql,/grant execute on function public\.beagu_member_sms_grant_v2[\s\S]*?to service_role/);
 assert.match(sql,/on delete cascade/);
 assert.match(sql,/phone_e164=null/);
 assert.match(sql,/phone_verified_at=null/);
 assert.doesNotMatch(sql,/grant (?:all|select|update|insert) on beagu_private\.[^\s]+ to (?:anon|authenticated)/i);
});
test('all user signup forms no longer submit SMS phone to untrusted Auth metadata',()=>{
 for(const page of ['challenge.html','postit.html']){
  const html=fs.readFileSync(page,'utf8');
  const settings=html.indexOf(page==='challenge.html'?'id="challengeMemberSmsFields"':'id="postitSmsFields"');
  const formEnd=html.indexOf('</form>',html.indexOf(page==='challenge.html'?'id="challengeMemberForm"':'id="postitAccountForm"'));
  assert.ok(settings>formEnd, page+' SMS setting must be outside signup form');
  assert.ok(html.includes('js/beagu-sms-account-settings-v2.js'));
 }
 for(const client of ['js/challenge-member-auth-v1.js','js/postit-account-v1.js']){
  const script=fs.readFileSync(client,'utf8');
  assert.match(script,/window\.BeaguSmsAccountSettings\.create/);
  assert.doesNotMatch(script,/data:selection\.consent/);
  assert.doesNotMatch(script,/beagu_sms_phone:wantsSms/);
  assert.doesNotMatch(script,/user_metadata\?\.beagu_sms_opt_in/);
 }
});
