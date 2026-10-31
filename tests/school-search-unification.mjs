import {readFileSync} from 'node:fs';
import {Script,runInNewContext} from 'node:vm';
import assert from 'node:assert/strict';
const read=name=>readFileSync(name,'utf8');
const pages=['search.html','search-lv1.html','search-lv2.html'];
const scripts=['js/school-search-card-v1.js','js/level-search.js','js/lv2-edited-search.js','js/school-mbti-v1.js'];
for(const file of scripts)assert.doesNotThrow(()=>new Script(read(file),{filename:file}),file+' invalid JS');
for(const path of pages){
 const html=read(path);
 assert.match(html,/styles\/school-search-card-v1\.css/,path+' missing shared CSS');
 assert.match(html,/js\/school-search-card-v1\.js/,path+' missing shared component');
 assert.doesNotMatch(html,/학교 홈페이지 방문|🌐 학교 홈페이지/,path+' displays unnecessary homepage');
 const lines=html.match(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)||[];
 for(const block of lines){
  const js=block.replace(/^<script[^>]*>/,'').replace(/<\/script>$/,'');
  assert.doesNotThrow(()=>new Script(js,{filename:path}),path+' invalid inline JS');
 }
}
const lv0=read('search.html');
const lv1=read('js/level-search.js');
const lv2=read('js/lv2-edited-search.js');
const mbti=read('js/school-mbti-v1.js');
const report=read('school-report.html');
for(const code of [lv0,lv1,lv2]){
 assert.match(code,/BeaguSchoolSearchCard\.addHeader\(/);
 assert.match(code,/BeaguSchoolSearchCard\.percentiles\(/);
 assert.doesNotMatch(code,/🌐 학교 홈페이지/);
 assert.doesNotMatch(code,/address,homepage/);
}
assert.match(mbti,/percentile\.insertAdjacentElement\('afterend',badge\)/);
assert.ok(lv1.indexOf('card.append(percentilePanel(school))') < lv1.indexOf('actions.append(open)'), 'Lv.1 order');
assert.ok(lv2.indexOf('card.append(percentilePanel(s))') < lv2.indexOf('actions.append(open)'), 'Lv.2 order');
assert.ok(lv2.indexOf('container.append(newer)') < lv2.indexOf("container.append(el('h3','school-history-heading','과거 상세자료')"), '2026 must precede history');
assert.doesNotMatch(report,/schoolHomepage|학교 홈페이지 방문|,homepage,/);
const sync=read('scripts/beagu-2026-mbti-review-sync.gs');
assert.match(sync,/1T_rEz1LqX97pC9gOv33SRmspK2IizTU3wFtxA8P1pC4/);
assert.match(sync,/2026-11-01/);
assert.doesNotMatch(sync,/\.from\('beagu_release_metrics_v2'\)/);
console.log('PASS: three-tier shared UI, no homepage links, MBTI only above Lv.0, 2026 source and approval gate');
