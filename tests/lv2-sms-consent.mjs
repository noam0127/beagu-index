import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=path=>readFileSync(path,'utf8');
const challenge=read('challenge.html');
const postit=read('postit.html');
const account=read('account.html');
const accountJs=read('js/beagu-account-v1.js');
const postitJs=read('js/postit-account-v1.js');
const schema=read('supabase/migrations/20261121090000_member_sms_opt_in_v1.sql');

assert.doesNotThrow(()=>new vm.Script(accountJs));
assert.doesNotThrow(()=>new vm.Script(postitJs));

for (const [html,id] of [[postit,'postitSmsConsent']]) {
 const tag=html.match(new RegExp('<input[^>]*id="'+id+'"[^>]*>'))?.[0];
 assert.ok(tag, 'SMS consent checkbox missing: '+id);
 assert.ok(tag.includes('type="checkbox"'));
 assert.equal(tag.includes('checked'),false,'Marketing consent must begin unchecked');
}
for (const [html,id] of [[postit,'postitSmsPhone']]) {
 assert.ok(html.includes('id="'+id+'"'), 'Phone input absent: '+id);
}
// The new account entry deliberately collects no phone or marketing consent.
assert.doesNotMatch(challenge,/challengeMemberSmsConsent|challengeMemberSmsPhone|challenge-member-auth-v1\.js/);
assert.doesNotMatch(account,/type="tel"|SmsConsent|SmsPhone/);
assert.doesNotMatch(accountJs,/beagu_sms_phone|beagu_sms_opt_in/);
assert.ok(postit.includes('미동의해도 가입 가능'));
for (const script of [postitJs]) {
 assert.ok(script.includes('beagu_sms_opt_in:wantsSms'));
 assert.ok(script.includes('beagu_sms_phone:wantsSms?mobile:null'));
 assert.ok(script.includes("replace(/[^0-9]/g,'')"));
 assert.ok(script.includes('client.auth.updateUser('));
}
assert.ok(schema.includes('create table if not exists beagu_private.member_sms_subscriptions_v1'));
assert.ok(schema.includes('enable row level security'));
assert.ok(schema.includes('revoke all on beagu_private.member_sms_subscriptions_v1 from public, anon, authenticated'));
assert.ok(schema.includes('drop trigger if exists capture_member_sms_consent_v1 on auth.users'));
assert.ok(schema.includes('phone_verified_at'));
assert.ok(schema.includes('withdrawn_at = now()'));
assert.equal(schema.includes('grant select on beagu_private.member_sms_subscriptions_v1 to authenticated'),false);
console.log('PASS: optional unchecked SMS consent, private storage, revocation and verification gate');
