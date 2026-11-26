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

// Account work remains on hold; the current challenge intentionally has no member signup.
assert.doesNotMatch(challenge,/id="challengeMember(?:SmsConsent|SmsPhone|Form|Overlay)"/);
assert.doesNotMatch(challenge,/challenge-member-auth-v1\.(?:js|css)/);
// New anonymous community must not collect phone/email or marketing consent.
// Legacy dormant challenge handler and private SMS storage remain protected.
assert.doesNotMatch(postit,/postitSmsConsent|postitSmsPhone|type="tel"|type="email"/);
assert.doesNotMatch(postitJs,/beagu_sms_opt_in|beagu_sms_phone|client\.auth\.updateUser|signInWithOAuth/);
for(const script of [challengeJs]){
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
