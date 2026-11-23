import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const home=read('index.html'),css=read('styles/class-diary-home-entry-v2.css');
const client=read('js/class-diary-home-entry-v1.js');
const server=read('supabase/functions/class-diary-guest-access-v1/index.ts');
const game=read('teacher-class-diary-play.html');
for(const id of ['homeDiarySchoolOpen','homeDiarySchoolDialog','homeDiarySchoolPicker',
 'homeDiarySchoolPicked','homeDiaryLv2Form','homeDiaryLv2Code','homeDiaryLv2Submit',
 'homeDiaryGuestForm','homeDiaryCode','homeDiarySubmit']){
 assert.match(home,new RegExp('id="'+id+'"'),id+' missing');
}
assert.match(home,/현재 시험 중입니다/);
assert.match(home,/Lv\.2 · 시험 운영/);
assert.match(home,/background:linear-gradient\(138deg,#5d6170,#343d50\)/,'Original literary theme must remain');
assert.match(home,/font:700 clamp\(19px,4vw,26px\)/,'Original serif font must remain');
assert.match(css,/#ead4e4/);
assert.doesNotMatch(css,/background:\s*#7be3ca/,'Do not use arcade mint on Class Diary');
assert.match(client,/new window\.ArcadeSchoolPicker/);
assert.match(client,/schoolId:school.school_id/);
assert.match(client,/action:'verify-lv2'/);
assert.match(client,/action:'verify-code'/,'Legacy PIN must still be verified');
assert.match(client,/sessionStorage\.setItem\(HANDOFF,data\.ticket\)/,'Only scoped ticket can cross to game');
assert.match(server,/async function verifiedLv2\(req:Request\)/);
assert.match(server,/beagu_has_earned_challenge_visitor/);
assert.match(server,/if\(action==='verify-lv2'\)/);
assert.match(server,/if\(action==='verify-ticket'\)/);
assert.match(server,/session\.sub!==valid\.sub/);
assert.match(server,/await eligiblePublicSchool\(id\)/);
assert.match(server,/await issueTicket\(PREVIEW_SUBJECT\)/,'Keep original PIN branch');
assert.match(game,/await validateHomeSchool\(result.schoolId\)/);
assert.match(game,/enterSchoolSetup\(\)/);
assert.match(game,/Lv\.2 시험 운영 · 진행 기록 미저장/);
assert.match(game,/if\(progressSession\)\{/,'No false saves for Lv2');
assert.match(game,/if\(!isGuest\)\{location\.replace/,'Direct route still denied');
console.log('PASS: literary style, school picker, Lv2 server gate and legacy PIN protected');
