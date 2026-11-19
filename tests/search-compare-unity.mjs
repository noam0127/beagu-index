import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';

const read=path=>fs.readFileSync(path,'utf8');
const pages={
  public:read('search.html'),
  level1:read('search-lv1.html'),
  comparison:read('statistics.html')
};
const unityCSS=read('styles/beagu-search-compare-unity-v1.css');
const levelJS=read('js/beagu-level-state-v1.js');
const guideJS=read('js/beagu-level-guide-v1.js');
const postitJS=read('js/postit-v1.js');
const levels=read('levels.html');

for(const p of ['js/beagu-level-state-v1.js','js/beagu-level-guide-v1.js','js/postit-v1.js']){
  execFileSync(process.execPath,['--check',p],{stdio:'inherit'});
}
for(const [key,html] of Object.entries(pages)){
  assert.ok(html.includes('styles/beagu-search-compare-unity-v1.css?v=20261120-unity2'),
    key+' loads fresh common CSS');
  assert.ok(html.includes('class="beagu-levelup-') ||
    html.includes('beagu-levelup-card'),key+' uses shared level-up card');
  assert.ok(html.includes('data-beagu-open-levelup') || html.includes('compareLv1Form') ||
    html.includes('lv1QuickForm'),key+' retains functional levelup entry');
  assert.ok(html.includes('id="beaguLevelState"'),key+' retains fixed level status');
  assert.ok(html.includes('js/beagu-level-state-v1.js?v=20261120-auth-unity1'),
    key+' busts cache for temporary Lv2 label');
}
for(const key of ['public','level1']){
  const html=pages[key];
  assert.ok(html.includes('class="beagu-search-hero"'),key+' has comparison-style hero');
  assert.ok(html.includes('id="searchTitle"'),key+' has a search heading target');
  assert.ok(html.includes('class="beagu-search-card-title"'),key+' has a search-card title');
  assert.ok(html.includes('class="beagu-school-input-wrap"'),key+' has search icon wrapper');
  assert.ok(html.includes('id="searchInput"'),key+' retains live school search input');
  for(const id of ['schoolTab','regionTab','schoolPanel','regionPanel','resultCount','results','pager']){
    const count=html.split('id="'+id+'"').length-1;
    assert.equal(count,1,key+' keeps one live '+id+' element');
  }
}
assert.ok(pages.level1.includes('class="beagu-levelup-card beagu-levelup-status"'),
  'authenticated search status uses the same verification card');
assert.ok(pages.level1.includes('data-beagu-open-levelup>고유번호 인증</button>'),
  'authenticated Lv1 can open existing server-backed modal');
assert.ok(pages.level1.includes('id="logoutButton"'),'Lv1 logout intact');
assert.ok(pages.public.includes('id="lv1QuickForm"'),'public auth form intact');
assert.ok(pages.level1.includes('id="loginForm"'),'Lv1 form intact');
assert.ok(pages.comparison.includes('id="compareLv1Form"'),'compare form intact');
assert.ok(pages.comparison.includes('beagu-auth-card beagu-levelup-card'),
  'comparison uses the same verification card');
assert.ok(pages.comparison.includes('id="compareLv1Logout"'),'compare logout intact');
for(const marker of ['.beagu-search-hero','.beagu-levelup-card',
  '.beagu-levelup-trigger','.beagu-school-input-wrap','@media(max-width:720px)']){
  assert.ok(unityCSS.includes(marker),'shared visual CSS includes '+marker);
}
assert.ok(unityCSS.includes('body.beagu-page-compare main.shell'),'comparison hero styles also defined');
assert.ok(!unityCSS.includes('sessionStorage')&&!unityCSS.includes('authRequest('),
  'unified stylesheet changes presentation only');

for(const [p,source] of Object.entries({
  'js/beagu-level-state-v1.js':levelJS,
  'js/beagu-level-guide-v1.js':guideJS,
  'js/postit-v1.js':postitJS,
  'levels.html':levels
})){
  assert.ok(source.includes('Lv.2(임시)'),p+' shows provisional Lv2 in Korean');
  assert.ok(!source.includes('Lv.2(진)'),p+' must not show military-like final marker');
}
assert.ok(levelJS.includes("result.provisional===true"),'provisional status remains server-derived');
assert.ok(postitJS.includes('dataset.provisional!=="true"'),
  'provisional users still lack posting permissions');
console.log('PASS: unified search/compare UI and temporary Lv.2 naming without changing auth permissions');
