/* Stage 7 semester interface contract (no game logic mutation or persistence). */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const html=read('teacher-class-diary-play.html');
const script=read('js/class-diary-semester-ui-v1.js');
const hud=read('js/class-diary-ui-v2.js');
const css=read('styles/class-diary-semester-ui-v1.css');
const engine=require('../js/class-diary-semester-v1.js');
assert.deepEqual(
 Object.values(engine.validate()).slice(0,4),[36,6,108,5],
 'Semester engine contract must be unchanged'
);
for(const marker of [
 'id="semesterStart"','id="openingStart"','id="choiceSection"',
 'id="vnMore"','id="nextBtn"','id="opening"',
 'src="js/class-diary-semester-v1.js',
 'src="js/class-diary-semester-ui-v1.js',
 'href="styles/class-diary-semester-ui-v1.css',
 'if(storyMode===\'semester\')return renderSemester()',
 'semester.createGame(baseGame)',
 'semester.choose(game,choice.id)',
 'semester.advance(game)'
])assert(html.includes(marker),'Missing semester/preview UI integration '+marker);
assert(html.includes("params.get('guest')==='1'"),'Preissued code guest route must remain intact');
assert(html.includes("sessionStorage.getItem('beagu-level-session-v1')"),'Existing Level2 session must be preserved');
assert(html.includes('aria-modal="true" aria-label="선택지"'),'Choices must remain a centered modal');
assert(html.includes('class="vn-arrow-mark"'),'Dialogue arrows must remain animated');
assert(!html.includes('당신의 선택이 남긴 장면'),'Removed intro text must not return');
for(const marker of ['mode(\'semester\')','mode(\'week\')','diarySemesterFinish','diary-opening-stat','setup-story-note','diary-semester-acts'])
 assert(script.includes(marker)||html.includes(marker),'Missing semester display contract '+marker);
assert(hud.includes('36'),'The HUD must handle 36 chapters');
assert(hud.includes('diarySemesterMeta'),'Season chip must exist');
assert(hud.includes('전체 6부 중'),'Six-act progress must have accessible aria labels');
assert(hud.includes('diarySeason'),'Season must drive palette');
for(const month of ['march','april','may','june','july'])assert(css.includes('data-diary-season="'+month+'"'),'Missing seasonal CSS '+month);
for(const src of [script,hud,css]){
 assert(!/localStorage\.setItem\(|sessionStorage\.setItem\(|indexedDB|navigator\.sendBeacon/.test(src),'UI must not persist player data');
}
assert(!script.includes('fetch('),'New semester UI must not send game data to servers');
console.log('PASS semester UI: 36 chapters, 6 acts, spring-to-summer HUD, original 7-day mode, centered choices, arrows, no saves');
