import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
const read=path=>readFileSync(path,'utf8');
const page=read('levels.html'),shell=read('js/beagu-level-state-v1.js');
const guide=read('js/beagu-level-guide-v1.js'),css=read('styles/beagu-level-guide-v1.css');
for(const level of [0,1,2])assert.ok(page.includes('data-tier="'+level+'"'),'level '+level+' must be described');
assert.match(page,/id="beaguLevelState"/);
assert.match(page,/유효한 추천 설문 1건/,'Only earned referrals qualify for Lv2');
assert.match(page,/href="challenge.html">Lv2 달성하기/,'Earn challenge link visible');
assert.match(page,/href="search.html">참여코드 입력/,'Lv1 unified code input route');
assert.match(page,/회원가입이나 로그인이 필요하지 않아요/);assert.match(page,/유효한 추천 설문 1건과 익명 계정 생성·로그인/);
assert.doesNotMatch(page,/정식 계정 준비중|정식 계정 생성|Lv\.2\(임시\)|Lv\.2\(진\)/);
assert.doesNotMatch(css,/pointer-events:none|cursor:not-allowed/,'Lv2 challenge link must remain enabled');
assert.match(css,/@media\(max-width:700px\)/);
assert.match(shell,/result\.level>=2\?2:1/,'Never infer level from typed code');
assert.match(shell,/beagu:level-state-updated/);
assert.match(guide,/beagu:level-state-updated/);
assert.doesNotMatch(guide,/정식 계정 생성/);
for(const path of ['js/beagu-level-state-v1.js','js/beagu-level-guide-v1.js','js/beagu-participation-auth-v2.js'])
 assert.doesNotThrow(()=>new Script(read(path),{filename:path}));
const pages=['index.html','search.html','search-lv1.html','school-report.html','statistics.html','challenge.html','release-policy.html','teacher-volleyball.html','teacher-run.html','survey.html','postit.html','arcade-history.html','levels.html'];
for(const path of pages){
 const html=read(path);
 assert.match(html,/id="beaguLevelState"/,'Common level badge on '+path);
 assert.match(html,/js\/beagu-level-state-v1\.js/,'Server-verified level state on '+path);
 assert.match(html,/js\/beagu-participation-auth-v2\.js/,'Shared participation dialog on '+path);
 assert.match(html,/styles\/beagu-participation-auth-v2\.css/,'Shared responsive styles on '+path);
}
console.log('PASS: 13 pages share one Lv1/Lv2 control; earned Lv2 guide is active.');
