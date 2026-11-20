/* Regression contract: compact information drawer and touch-only next action. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const html=read('teacher-class-diary-play.html');
const css=read('styles/class-diary-hud-tidy-v1.css');
const js=read('js/class-diary-hud-tidy-v1.js');
new vm.Script(js,{filename:'class-diary-hud-tidy-v1.js'});
assert(html.includes('styles/class-diary-hud-tidy-v1.css?v=20261120-1'),'HUD CSS must load after prototype styles');
assert(html.includes('js/class-diary-hud-tidy-v1.js?v=20261120-1'),'HUD behavior script must load');
assert(html.indexOf('class-diary-hud-tidy-v1.css')>html.indexOf('class-diary-interface-rebalance-v1.css'),'Latest HUD CSS should win cascade');
assert(html.indexOf('class-diary-hud-tidy-v1.js')>html.indexOf('class-diary-ui-v2.js'),'HUD script runs after UI assembly');
for(const id of ['vnHeaderSlot','vnBottom','vnHud','vnMore','nextBtn','diaryHudFold','diaryHomeReturn','diarySaveNow','diaryContinueNow']){
 assert(html.includes('id="'+id+'"'),'Do not delete a functional game control: '+id);
}
assert(css.includes('top:calc(env(safe-area-inset-top,0px) + 48px)!important'),'Opened left title must anchor near top');
assert(css.includes('top:var(--diary-open-reader-top'),'Reader offset must follow measured title and controls');
assert(css.includes('body.is-playing #novelCard #vnMore')&&css.includes('body.is-playing #novelCard #nextBtn'));
assert(css.includes('display:none!important;')&&css.includes('pointer-events:none!important;'),'Next buttons must not remain clickable or visible');
assert(js.includes("reader.addEventListener('click'"),'Clicking prose must advance');
assert(js.includes('stage.click()'),'Reuse original scene turn event handlers');
assert(js.includes("setProperty('--diary-open-reader-top'"),'Avoid hardcoded expanded reader gaps');
assert(js.includes("setAttribute('aria-hidden','true')"),'Removed buttons must be hidden from screen readers');
assert(!/localStorage|sessionStorage|indexedDB|fetch\(/.test(js),'UI layout must not store or transmit player data');
console.log('PASS: expanded HUD anchored near top, no right next button, prose taps and existing auth/data intact');
