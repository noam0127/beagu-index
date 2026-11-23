import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const pages=[
 ['index.html','index.html'],
 ['search.html','search.html'],
 ['search-lv1.html','search.html'],
 ['statistics.html','statistics.html'],
 ['challenge.html','challenge.html']
];
const css=read('styles/beagu-site-header-v1.css');
const navRegex=/<nav class="beagu-unified-nav beagu-core-nav" aria-label="주요 메뉴">([\s\S]*?)<\/nav>/;
let reference=null;
for(const [page,active] of pages){
 const html=read(page);
 const match=html.match(navRegex);
 assert.ok(match,page+' missing shared main menu');
 assert.ok(html.includes('styles/beagu-site-header-v1.css?v=20261123-challenge-core-nav1'),page+' stale shared nav asset');
 const links=[...match[1].matchAll(/<a href="([^"]+)"(?: aria-current="page")?>([^<]+)<\/a>/g)]
   .map(m=>({href:m[1],label:m[2]}));
 const core=links.filter(x=>x.href!=='postit.html');
 assert.deepEqual(core.map(x=>x.href),['index.html','search.html','statistics.html','challenge.html']);
 assert.deepEqual(core.map(x=>x.label),['홈','학교검색','비교하기','챌린지']);
 const selected=[...match[1].matchAll(/<a href="([^"]+)" aria-current="page">/g)].map(m=>m[1]);
 assert.deepEqual(selected,[active],page+' wrong selected tab');
 if(reference)assert.deepEqual(core,reference,page+' has different menu appearance/order');
 else reference=core;
}
assert.match(css,/\.beagu-unified-nav\.beagu-core-nav/);
assert.match(css,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
assert.match(css,/min-height:42px/);
assert.match(css,/min-height:40px/);
assert.match(css,/\.beagu-unified-nav a\[aria-current="page"\]/);
assert.match(css,/\.beagu-unified-header \.beagu-unified-nav>a\[href="postit.html"\]\{display:none!important\}/);
console.log('PASS: all four navigation links, challenge-style geometry, desktop/mobile alignment, correct active page');
