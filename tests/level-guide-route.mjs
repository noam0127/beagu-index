import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
const read=path=>readFileSync(path,'utf8');
const page=read('levels.html');
const script=read('js/beagu-level-state-v1.js');
const guide=read('js/beagu-level-guide-v1.js');
const css=read('styles/beagu-level-guide-v1.css');
assert.match(page,/<main id="main-content"/);
assert.match(page,/href="styles\/beagu-level-guide-v1\.css/);
assert.match(page,/js\/beagu-level-guide-v1\.js/);
assert.match(page,/id="beaguLevelState"/);
for(const level of [0,1,2])
 assert.ok(page.includes('data-tier="'+level+'"'),'level '+level+' has guide card');
assert.match(page,/Lv\.2\(임시\)/,'Temporary challenge code Level 2 is clearly named');
assert.doesNotMatch(page,/Lv\.2\(진\)/,'Do not revive old temporary badge label');
assert.ok(page.includes('정식 계정 준비중'),'Permanent Level 2 signup is not claimed live');
assert.ok(page.includes('포스트잇 작성: 정식 Lv.2 계정 생성 후 가능'),'Do not imply provisional posting permission');
assert.ok(page.includes('href="challenge.html">챌린지 · 고유번호 확인</a>'),'Provide available challenge route');
assert.ok(!page.includes('레벨업 인증창에 고유번호를 입력해요.'),'No removed code authentication entry in guide');
assert.ok(page.includes('href="search.html">레벨1 인증</a>'),'Guide links directly to Level1 login');
assert.ok(page.includes('정식 레벨2 인증은 준비 중이에요.'),'Describe disabled new identity verification accurately');
assert.ok(!page.includes('자동 승급 가능합니다'),'Do not advertise unfinished referral automation');
assert.match(script,/indicator\.setAttribute\('href','levels\.html'\)/);
assert.match(script,/result\.level>=2\?2:1/,'Show verified Lv2 rather than Lv1');
assert.ok(script.includes('provisional=tier===2&&result.provisional===true'),'Server verifies provisional status');
assert.match(script,/beagu:level-state-updated/);
assert.match(guide,/beagu:level-state-updated/);
assert.ok(guide.includes('Lv.2(임시)'),'Guide displays consistent badge');
assert.match(css,/@media\(max-width:700px\)/);
assert.ok(css.includes('.beagu-level-guide-card[data-tier="2"]'),'Tier2 remains visually distinct');
assert.ok(css.includes('background:#e7e9ee'),'Unreleased permanent features remain visually subdued');
for(const path of ['js/beagu-level-state-v1.js','js/beagu-level-guide-v1.js'])
 assert.doesNotThrow(()=>new Script(read(path),{filename:path}));
for(const file of [
 'index.html','search.html','search-lv1.html','school-report.html',
 'statistics.html','challenge.html','release-policy.html',
 'teacher-volleyball.html','teacher-run.html','survey.html'
]){
 const html=read(file);
 const badge=html.match(/<a[^>]*id="beaguLevelState"[^>]*>/)?.[0];
 assert.ok(badge&&badge.includes('href="levels.html"'),file+' badge links to levels');
 assert.ok(html.includes('js/beagu-level-state-v1.js?v=20261120-lv1-plain1'),file+' loads latest badge labels');
}
console.log('PASS: Lv.2(임시), current-level guide, 10 page links and restricted Lv2 actions');
