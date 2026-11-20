import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {Script} from 'node:vm';
const read=p=>readFileSync(p,'utf8');
const active=['index.html','search.html','search-lv1.html','school-report.html','statistics.html','challenge.html','release-policy.html','teacher-volleyball.html','teacher-run.html','survey.html'];
for(const p of active){
 const s=read(p);
 assert.doesNotMatch(s,/VOLLEYBALL INDEX/,p+' old brand');
 assert.match(s,/styles\/beagu-design-system-v1\.css/,p+' design tokens');
 assert.match(s,/beagu-unified-mark/,p+' unified B mark');
 assert.match(s,/BAEGU<span class="beagu-unified-name-accent">INDEX<\/span>/,p+' uppercase wordmark');
 assert.equal((s.match(/id="beaguLevelState"/g)||[]).length,1,p+' exactly one level state');
 assert.match(s,/class="beagu-level-state"/,p+' shared level indicator');
 assert.match(s,/styles\/beagu-level-state-v1\.css/,p+' shared level stylesheet');
 assert.match(s,/js\/beagu-level-state-v1\.js/,p+' shared level verification');
 for(const block of s.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)){
   if(!block[1].trim() || /type="application\/json"/.test(block[0].split('>')[0]))continue;
   assert.doesNotThrow(()=>new Script(block[1],{filename:p}),p+' script syntax');
 }
}
for(const p of ['index.html','search.html','search-lv1.html','school-report.html','statistics.html','challenge.html']){
 assert.match(read(p),/beagu-unified-nav/,p+' shared navigation');
}
const navPages=[...active,'arcade-history.html','levels.html'];
for(const p of navPages) {
 const page=read(p);
 const start=page.indexOf('<nav class="beagu-unified-nav"');
 const end=page.indexOf('</nav>',start);
 assert.ok(start>=0&&end>start,p+' includes unified navigation');
 const nav=page.slice(start,end);
 assert.ok(nav.includes('>챌린지</a>'),p+' menu must say 챌린지');
 assert.ok(!nav.includes('>인증</a>'),p+' old top menu label is absent');
}
const levelGuide=read('levels.html');
assert.ok(levelGuide.includes('<span class="beagu-level-guide-title-line">참여할수록 더</span><span class="beagu-level-guide-title-line">넓어지는 학교정보</span>'),'The level heading keeps exact two-line wording');
assert.ok(read('styles/beagu-level-guide-v1.css').includes('.beagu-level-guide-title-line{display:block;white-space:nowrap'),'Prevent mid-word wrap on mobile');

const search=read('search.html');
assert.match(search,/publicSort\.addEventListener\('change'/,'Lv0 sorting must query server');
assert.match(search,/\.order\(sortColumn,\{ascending,nullsFirst:false\}\)/,'Regional sort must happen before pagination');
const report=read('school-report.html');
assert.doesNotMatch(report,/class="symbol-dot"/,'No symbol decorations');
assert.match(report,/다른 학교 검색/);
assert.match(report,/자료 해석 기준/);
const survey=read('survey.html');
assert.doesNotMatch(survey,/submit_survey|supabaseClient|테스트 응답 제출/);
assert.match(survey,/2026 배구지수 공식 설문/);
const css=read('styles/beagu-design-system-v1.css');
assert.match(css,/\.beagu-brand-mark/);
assert.match(css,/@media\(max-width:700px\)/);

const badgeCSS=read('styles/beagu-level-state-v1.css');
const badgeJS=read('js/beagu-level-state-v1.js');
assert.match(badgeCSS,/\\.beagu-level-state-container\\{\\s*position:relative;/,'Badge wrapper stays in normal document flow');
assert.match(badgeCSS,/\\.beagu-level-state-container > \\.beagu-level-state\\{\\s*position:static;/,'Badge anchor is not fixed to the viewport');
assert.match(badgeCSS,/grid-template-columns:minmax\\(0,1fr\\) max-content/,'Header reserves a dedicated logo/status row');
assert.match(badgeCSS,/grid-column:1 \\/ -1;\\s*grid-row:2;/,'Mobile navigation occupies its own full-width second row');
assert.match(badgeJS,/headerInner\\.appendChild\\(badgeContainer\\)/,'Move badge inside the logo header');
for(const page of [...active,'arcade-history.html','postit.html','levels.html']){
  assert.ok(read(page).includes('styles/beagu-level-state-v1.css?v=20261121-logo-grid2'),page+' loads updated header layout');
  assert.ok(read(page).includes('js/beagu-level-state-v1.js?v=20261121-logo-grid2'),page+' loads badge relocation code');
}
assert.match(badgeCSS,/@media\(max-width:760px\)/,'Badge does not overlap mobile navigation');
assert.match(badgeCSS,/\.beagu-embedded \.beagu-level-state\{display:none!important\}/,'No duplicate badge in embedded games');
assert.doesNotThrow(()=>new Script(badgeJS),'Level indicator syntax');
assert.match(badgeJS,/beagu-level-session-v1/,'Use existing participant session');
assert.match(badgeJS,/action:'verify'/,'Check with existing signed session endpoint');
assert.match(badgeJS,/Number\.isInteger\(result\?\.level\)&&result\.level>=1/,'Level 1 requires verified server response');
assert.match(badgeJS,/response\.status===401\|\|response\.status===403/,'Expired sessions cannot be shown as authenticated');
assert.match(badgeJS,/beagu:level-state-change/,'Auth changes refresh the badge');
for(const p of ['js/level-search.js','js/statistics-compare.js','search.html','school-report.html'])
 assert.match(read(p),/beagu:level-state-change/,p+' updates badge on login/logout');

console.log('PASS: B lettermark, common menus, logo-row level badge, unobstructed mobile navigation, safe survey route');
