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
for (const lvl of [0,1,2]) assert.match(page,new RegExp('data-tier="'+lvl+'"'));
assert.match(page,/자동 승급·초대 링크 기능은 준비 중/,'Do not advertise unfinished referrals as live');
assert.match(script,/indicator\.setAttribute\('href','levels\.html'\)/);
assert.match(script,/result\.level>=2\?2:1/,'Show verified Lv2 rather than Lv1');
assert.match(script,/beagu:level-state-updated/);
assert.match(guide,/beagu:level-state-updated/);
assert.match(css,/@media\(max-width:700px\)/);
for (const path of ['js/beagu-level-state-v1.js','js/beagu-level-guide-v1.js'])
 assert.doesNotThrow(()=>new Script(read(path),{filename:path}));
for (const file of [
 'index.html','search.html','search-lv1.html','school-report.html',
 'statistics.html','challenge.html','release-policy.html',
 'teacher-volleyball.html','teacher-run.html','survey.html'
]) {
 const html=read(file);
 assert.match(html,/id="beaguLevelState"[^>]*href="levels\.html"/,file+' badge route');
 assert.match(html,/js\/beagu-level-state-v1\.js\?v=20261119-level-guide1/,file+' cache bust');
}
console.log('PASS: current-tier indicator, new level-guide route, 10 canonical page links, accessible mobile UI');
