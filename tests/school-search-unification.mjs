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
 assert.match(html,/v=20261031-unify2/,path+' stale shared script URL');
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
for(const [level,code] of [[0,lv0],[1,lv1],[2,lv2]]){
 assert.match(code,/BeaguSchoolSearchCard\.createCard\(/,'Lv.'+level+' not using canonical card');
 assert.match(code,new RegExp('level:\\s*'+level),'Lv.'+level+' incorrect card privilege');
 assert.doesNotMatch(code,/🌐 학교 홈페이지|address,homepage/);
}
assert.match(mbti,/percentile\.insertAdjacentElement\('afterend',badge\)/);
assert.ok(lv2.indexOf('container.append(newer)') < lv2.indexOf("container.append(el('h3','school-history-heading','과거 상세자료')"),'2026 must precede history');
assert.doesNotMatch(report,/schoolHomepage|학교 홈페이지 방문|,homepage,/);
for(const html of [read('search-lv1.html'),read('search-lv2.html')]){
 assert.match(html,/js\/school-mbti-v1\.js/);
}
assert.doesNotMatch(lv0,/school-mbti-v1\.js/);

// The same canonical DOM card, not merely similar CSS. No external packages required.
class FakeNode{
 constructor(tag){
  this.tagName=tag;this.className='';this.children=[];this.dataset={};this.attributes={};this.hidden=false;
  this.classList={contains:c=>this.className.split(/\s+/).includes(c),add:c=>{this.className+=(this.className?' ':'')+c}};
 }
 append(...children){this.children.push(...children);}
 setAttribute(name,value){this.attributes[name]=String(value);}
}
const window={};
const document={
 createElement:tag=>new FakeNode(tag),
 createTextNode:text=>({tagName:'#text',textContent:text})
};
runInNewContext(read('js/school-search-card-v1.js'),{window,document,percentileChart:()=>'<svg></svg>'});
const ui=window.BeaguSchoolSearchCard;
assert.ok(ui&&typeof ui.createCard==='function');
const school={school_id:'7832070',sido_standard:'강원',school_name:'테스트초등학교',support_office:'강릉교육지원청',address:'강원특별자치도'};
const rendered=[];
for(const level of [0,1,2]){
 const percentile=ui.percentiles({publicValues:[38.3,null,74.5],statuses:['EXISTING_PUBLIC_VALUE_PRESERVED','NO_PUBLISHED_VALUE','EXISTING_PUBLIC_VALUE_PRESERVED'],locked:level===0});
 const {card,open,detail}=ui.createCard(school,{level,percentile});
 rendered.push(card.children.map(node=>node.className||node.tagName).join(' | '));
 assert.equal(card.tagName,'article');
 assert.equal(card.dataset.schoolId,'7832070');
 assert.deepEqual(card.children.slice(0,5).map(x=>x.className),['region-badge','school-name','school-meta','percentile-panel','school-actions']);
 assert.ok(!JSON.stringify(card).includes('홈페이지'));
 const cells=percentile.children[1].children;
 assert.equal(cells.length,4);
 assert.equal(cells[1].children[1].textContent,'자료 없음');
 assert.equal(cells[0].children[1].textContent,'38.3%');
 if(level===0){
  assert.equal(open.tagName,'a');
  assert.equal(open.href,'school-report.html?school_id=7832070');
  assert.equal(detail,null);
  assert.equal(cells[3].children[1].textContent,'🔒 Lv.1 전용');
 }else{
  assert.equal(open.tagName,'button');
  assert.equal(open.attributes['aria-expanded'],'false');
  assert.equal(open.attributes['aria-controls'],detail.id);
  assert.equal(detail.hidden,true);
  assert.equal(card.children[5],detail);
  assert.equal(cells[3].children[1].textContent,'자료 준비 중');
 }
}
assert.equal(new Set(rendered.map(x=>x.replace(' | school-detail',''))).size,1,'All levels should have the same main card sections');
const pending=ui.percentiles({publicValues:[null,null,null],statuses:['REVIEW_PENDING','NO_PUBLISHED_VALUE'],locked:false});
assert.equal(pending.children[1].children[0].children[1].textContent,'검수 중');
assert.equal(pending.children[1].children[1].children[1].textContent,'자료 없음');
assert.equal(pending.children[1].children[2].children[1].textContent,'자료 없음');

const sync=read('scripts/beagu-2026-mbti-review-sync.gs');
assert.match(sync,/1T_rEz1LqX97pC9gOv33SRmspK2IizTU3wFtxA8P1pC4/);
assert.match(sync,/2026-11-01/);
assert.doesNotMatch(sync,/\.from\('beagu_release_metrics_v2'\)/);
console.log('PASS: 3-tier canonical DOM, accessibility, states, no homepage, privacy gate, current 2026 source');
