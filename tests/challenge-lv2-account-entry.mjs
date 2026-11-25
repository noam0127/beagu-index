import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync('challenge.html','utf8');
const ui=readFileSync('js/beagu-participation-auth-v2.js','utf8');
assert.doesNotThrow(()=>new vm.Script(ui),'Participation code script must parse');

for(const id of ['challengeAccessPanel','challengeProtected','participantNo','identityCode','challengeReferralLink'])
 assert.ok(html.includes('id="'+id+'"'),'Challenge functionality still present: '+id);
assert.match(html,/js\/challenge-access-v1\.js\?v=/,'Existing participation-code access is preserved');
assert.match(html,/js\/challenge-referral-v1\.js\?v=/,'Referral flow is preserved');
assert.doesNotMatch(html,/challengeMemberOverlay|challengeMemberForm|challengeMemberSubmit|challengeMemberSwitch|challengeMemberSmsFields/,'No account entry or signup form on challenge page');
assert.doesNotMatch(html,/challenge-member-auth-v1\.(?:js|css)/,'Account login/signup bundles not loaded');
assert.doesNotMatch(ui,/beagu:challenge-account-open|challengeLogin\?/,'No dynamic Lv2 login action');
assert.doesNotMatch(ui,/로그인하기/,'No login button label');
assert.match(ui,/headerUI\.inline\.hidden=!known\|\|level>=2/,'Header input disappears at highest tier');
assert.match(ui,/host\.classList\.add\('beagu-retired-auth-card'\)/,'Challenge legacy card retired');
assert.match(ui,/badge\.addEventListener\('click',e=>\{e\.preventDefault\(\);open\(\)\}/,'Badge opens authentication details');
assert.doesNotMatch(html,/Lv\.2 인증 후 이용/,'Redundant benefit copy removed');
assert.match(html,/beagu-participation-auth-v2\.js\?v=/,'Shared assets loaded');
console.log('PASS: challenge account login and registration removed; code/level/referrals preserved');
