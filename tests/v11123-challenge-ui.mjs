import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
for(const p of ['js/beagu-survey-fold-v1.js','js/challenge.js','js/challenge-level3-v1.js','js/challenge-referral-v1.js','js/challenge-access-v1.js','js/beagu-participation-auth-v2.js','js/beagu-level-state-v1.js']){
 execFileSync(process.execPath,['--check',new URL('../'+p,import.meta.url).pathname]);
}
const fold=read('js/beagu-survey-fold-v1.js'),pattern=/^(.+?[.!?])(?:\s+)([\s\S]+)$/;
assert.ok(fold.includes(String(pattern)));
assert.deepEqual('첫 문장입니다. 나머지 안내입니다.'.match(pattern).slice(1),['첫 문장입니다.','나머지 안내입니다.']);
const html=read('challenge.html'),capture=read('js/challenge.js'),referral=read('js/challenge-referral-v1.js'),access=read('js/challenge-access-v1.js'),account=read('js/challenge-level3-v1.js'),header=read('js/beagu-participation-auth-v2.js');
assert.match(html,/<button id="level3Upgrade"[^>]*>계정 생성<\/button>/);
assert.ok(html.includes('id="challengeLoginCode"'));
assert.ok(referral.includes("const visualTier=premiumVisual?2:1;")); // Lv.3 display deferred; preserve Lv.2 tier
assert.ok(referral.includes("'확장 학교 상세자료 열람','최신 조사자료 열람','행정동 공동주택 평균 공시가격 열람','좋아요 누르기'"));
assert.ok(referral.includes('const loginCard=verifiedLoginLevel>=2&&(account3||!upgraded||!upgradedFromLv1);'));
assert.ok(referral.includes('identityPanel.hidden=loginCard'));
assert.match(html,/<section id="level3-account" hidden inert aria-hidden="true"/);
assert.ok(access.includes('next.accountLevel,next.provisional===true'));
assert.ok(account.includes('open.disabled=busy'));
assert.ok(account.includes('if(register&&!eligible())'));
assert.ok(account.includes('provisional===false&&!!verifiedToken&&session()===verifiedToken'));
assert.ok(header.includes('if(rebinding&&(level!==2||checked.provisional!==false))'));
assert.ok(account.includes('checked.accountLevel!==3'));
assert.ok(capture.includes('boundIdentity=data.lv2Access===true'));
assert.ok(capture.includes("saved?.token===activeSession"));
assert.ok(header.includes("mask:value.slice(0,2)+'*'.repeat(value.length-2)"));
const certificate=html.slice(html.indexOf('id="certificate"'),html.indexOf('class="together-save"'));
assert.ok(!certificate.includes('challengeLoginCode'));
assert.ok(!certificate.includes('identityCode'));
console.log('v1.11.23 challenge UI contracts passed');
