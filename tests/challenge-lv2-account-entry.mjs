import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync('challenge.html','utf8');
const ui=readFileSync('js/beagu-participation-auth-v2.js','utf8');
assert.doesNotThrow(()=>new vm.Script(ui),'Participation code script must parse');

for(const id of ['challengeAccessPanel','challengeProtected','participantNo','identityCode','challengeReferralLink'])
 assert.ok(html.includes('id="'+id+'"'),'Challenge functionality still present: '+id);
assert.match(html,/js\\/challenge-access-v1\\.js\\?v=/,'Existing participation-code access is preserved');
assert.match(html,/js\\/challenge-referral-v1\\.js\\?v=/,'Referral flow is preserved');
assert.doesNotMatch(html,/challengeMemberOverlay|challengeMemberForm|challengeMemberSubmit|challengeMemberSwitch|challengeMemberSmsFields/,'No account entry or signup form on challenge page');
assert.doesNotMatch(html,/challenge-member-auth-v1\\.(?:js|css)/,'Account login/signup bundles not loaded');
assert.doesNotMatch(ui,/beagu:challenge-account-open|challengeLogin\\?/,'No dynamic Lv2 login action');
assert.doesNotMatch(ui,/로그인하기/,'No login button label');
assert.match(ui,/state\\.textContent=text;/,'Lv1/Lv2 badges retain verified level labels');
assert.match(ui,/heading\\.textContent=level>=2\\?'Lv2 참여 인증 완료':'참여코드 입력'/);
assert.match(ui,/const status=button\\('', 'beagu-participation-inline-status',open\\);/,'Lv2 status opens participation details instead of member login');
assert.match(html,/v=20261123-challenge-code-only1/,'Updated asset cache-bust required');
console.log('PASS: challenge account login and registration removed; code/level/referrals preserved');
