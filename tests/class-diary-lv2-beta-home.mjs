import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const home=read('index.html');
const css=read('styles/class-diary-home-entry-v2.css');
const server=read('supabase/functions/class-diary-guest-access-v1/index.ts');
const game=read('teacher-class-diary-play.html');
assert.match(home,/id="teacher-diary-feature"/);
assert.match(home,/id="teacher-diary-lock-title"/);
assert.match(home,/🌸 현재 준비 중입니다/);
assert.match(home,/시나리오와 플레이 화면을 다듬고 있습니다/);
assert.match(home,/게임은 준비가 완료된 후 공개됩니다/);
assert.match(home,/teacher-diary-coming-soon/);
assert.match(home,/background:linear-gradient\(138deg,#5d6170,#343d50\)/,'literary design preserved');
assert.match(home,/font:700 clamp\(19px,4vw,26px\)/,'serif heading preserved');
for(const id of ['homeDiarySchoolOpen','homeDiarySchoolDialog','homeDiarySchoolPicker',
 'homeDiaryLv2Form','homeDiaryLv2Code','homeDiaryLv2Submit',
 'homeDiaryGuestForm','homeDiaryCode','homeDiarySubmit']){
 assert.doesNotMatch(home,new RegExp('id="'+id+'"'),id+' must not appear on the public homepage');
}
assert.doesNotMatch(home,/src="js\/class-diary-home-entry-v1\.js/,'no inactive login logic');
assert.doesNotMatch(home,/teacher-class-diary-play\.html\?guest=1/,'no entry link on homepage');
assert.match(css,/#ead4e4/,'original lilac/rose design preserved');
assert.doesNotMatch(css,/background:\s*#7be3ca/,'do not convert diary to neon arcade styling');
assert.match(server,/if\(action==='verify-lv2'\)/,'existing secured game path stays unchanged');
assert.match(server,/await issueTicket\(PREVIEW_SUBJECT\)/,'internal developer PIN backend preserved');
assert.match(game,/if\(!isGuest\)\{location\.replace/,'direct game route remains protected');
console.log('PASS diary home coming-soon card, code inputs absent, literary theme and game security retained');
