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
assert.match(ui,/state\.textContent=stateText;/,'Lv1/Lv2 badges retain verified level labels');
assert.match(ui,/const stateText=level===1\?text\+[^;]+:text;/,'Lv1 upgrade hint preserves verified label');
assert.match(ui,/href="account\.html"/,'Account entry is a separate page, not an inline challenge signup');
assert.match(ui,/heading\.textContent=level>=2\?'Lv2 참여 인증 완료':'참여코드 입력'/);
assert.match(ui,/const status=button\('', 'beagu-participation-inline-status',open\);/,'Lv2 status opens participation details instead of member login');
assert.match(html,/js\/beagu-participation-auth-v2\.js\?v=20261124-v111-dual-entry/,'Updated account entry asset cache-bust required');
assert.match(html,/id="challengeAccountJoin"/);assert.match(html,/나의 고유번호가 로그인 아이디입니다/);assert.match(ui,/beaguEntryConfirm/);assert.match(ui,/verifyLogin\(id,password\)/);assert.match(ui,/beaguEntryLegacy/);assert.match(ui,/beagu:challenge-device-verified/);assert.match(ui,/owner':'legacy'/);assert.match(ui,/Lv\.1 참여코드 인증 \(회원가입 없이\)/);assert.match(ui,/기존 Lv\.2 고유번호 \(전환용\)/);const referral=readFileSync('js/challenge-referral-v1.js','utf8');
assert.doesNotThrow(()=>new vm.Script(referral));
for(const id of ['challengeBenefitsTitle','challengeMissionReferral','challengeMissionAccount','challengeMissionSummary'])assert.ok(html.includes('id="'+id+'"'));
assert.match(referral,/const achieved=referralComplete&&accountComplete&&serverPromotion/);
assert.match(referral,/기존 Lv\.2 달성 · 혜택 유지/);
assert.match(ui,/ownerToken===own\(\)/);
assert.match(ui,/beagu:challenge-account-state/);
const logic=referral.slice(referral.indexOf('  function missionState(){'),referral.indexOf('  function renderMissions(){'));
const decide=new Function('get','referralKnown','lastReferrals','serverPromotion','ownerSessionMatches','active',logic+';return missionState()');
for(const [state,known,count,promoted,level,achieved,legacy] of [
 ['unverified',true,1,false,1,false,false],['verified',true,0,false,1,false,false],
 ['verified',true,1,true,2,true,false],['verified',true,1,false,1,false,false],
 ['unverified',true,1,true,2,false,true],['checking',true,1,true,2,false,false],
 ['verified',false,1,true,2,false,false],['unverified',true,0,false,2,false,true]
]){
 const result=decide(id=>id==='challengeAccountStatus'?{dataset:{accountState:state}}:{getAttribute:()=>String(level)},known,count,promoted,()=>true,true);
 assert.equal(result.achieved,achieved);assert.equal(result.legacy,legacy);
}
console.log('PASS: independent Lv1 access, anonymous account login, two missions and legacy transition');
