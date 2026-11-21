import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=path=>readFileSync(path,'utf8');
const challenge=read('challenge.html');
const postit=read('postit.html');
const challengeJs=read('js/challenge-member-auth-v1.js');
const postitJs=read('js/postit-account-v1.js');
const schema=read('supabase/migrations/20261121090000_member_sms_opt_in_v1.sql');

assert.doesNotThrow(()=>new vm.Script(challengeJs));
assert.doesNotThrow(()=>new vm.Script(postitJs));

for(const [html, id] of [[challenge,'challengeMemberSmsConsent'],[postit,'postitSmsConsent']]){
  const tag=html.match(new RegExp('<input[^>]*id="'+id+'"[^>]*>'))?.[0];
  assert.ok(tag, 'Explicit checkbox required: '+id);
  assert.match(tag,/type="checkbox"/);
  assert.doesNotMatch(tag,/\\bchecked\\b/, 'Marketing checkbox must never default checked');
}
assert.match(challenge,/id="challengeMemberSmsPhone"/);
assert.match(postit,/id="postitSmsPhone"/);
assert.match(challenge,/동의하지 않아도 가입할 수 있으며/);
assert.match(postit,/미동의해도 가입 가능/);

for(const script of [challengeJs,postitJs]){
 assert.match(script,/beagu_sms_opt_in:wantsSms/,'Client must send explicit choice');
 assert.match(script,/beagu_sms_phone:wantsSms\\?mobile:null/,'No contact when unchecked');
 assert.match(script,/replace\\(\\/\\[\\^0-9\\]\\/g/,'Normalize Korean phone input');
 assert.match(script,/client\\.auth\\.updateUser\\(/,'Authenticated unsubscribe path required');
}
assert.match(schema,/create table if not exists beagu_private\\.member_sms_subscriptions_v1/);
assert.match(schema,/enable row level security/);
assert.match(schema,/revoke all on beagu_private\\.member_sms_subscriptions_v1 from public, anon, authenticated/);
assert.match(schema,/drop trigger if exists capture_member_sms_consent_v1 on auth\\.users/);
assert.match(schema,/phone_verified_at/);
assert.match(schema,/withdrawn_at = now\\(\\)/);
assert.doesNotMatch(schema,/grant (select|insert|update) on beagu_private\\.member_sms_subscriptions_v1 to (anon|authenticated)/i);
console.log('PASS: opt-in by choice, optional phone, unsubscribe, private RLS table, phone verification hold');
