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
 assert.match(html,/v=20261031-status4/,path+' stale shared script URL');
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
assert.match(report,/function renderYearGrid\(\)\s*\{[\s\S]*?for\(const year of \[2026,2025,2024,2023\]\)/,'Lv.0 detailed report year order');
assert.match(report,/id="latestYearMessage"/,'Lv.0 latest year explanation');
assert.match(report,/현재.*2026|2026년 학교별 통계/,'Lv.0 current release status');
assert.match(lv1,/const YEARS = \[2025, 2024, 2023\]/,'Lv.1 history tab order');
assert.match(lv1,/currentContent\.hidden = false/,'Lv.1 current report open by default');
assert.match(lv1,/newer\.setAttribute\('aria-controls',currentContent\.id\)/,'Lv.1 2026 panel accessible');
assert.ok(lv1.indexOf("const newer = make('button'") < lv1.indexOf("const profile = make('section'"),'Lv.1 2026 must precede old school facts');
assert.ok(lv1.indexOf('section.append(newer, currentContent)') < lv1.indexOf('BeaguSchoolMBTI.createDetail'),'Lv.1 2026 report before MBTI');
assert.match(lv2,/const years=\[2025,2024,2023\]/,'Lv.2 history tab order');
assert.ok(lv2.indexOf('container.append(newer)') < lv2.indexOf('BeaguSchoolMBTI.createDetail'),'Lv.2 current report before MBTI');

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
 assert.deepEqual(cells.map(c=>c.dataset.year),['2026','2025','2024','2023']);
 assert.equal(cells[2].children[1].textContent,'자료 없음');
 assert.equal(cells[3].children[1].textContent,'38.3%');
 assert.equal(cells[1].children[1].textContent,'74.5%');
 if(level===0){
  assert.equal(open.tagName,'a');
  assert.equal(open.href,'school-report.html?school_id=7832070');
  assert.equal(detail,null);
  assert.equal(cells[0].children[1].textContent,'🔒 Lv.1+ 승인 시');
 }else{
  assert.equal(open.tagName,'button');
  assert.equal(open.attributes['aria-expanded'],'false');
  assert.equal(open.attributes['aria-controls'],detail.id);
  assert.equal(detail.hidden,true);
  assert.equal(card.children[5],detail);
  assert.equal(cells[0].children[1].textContent,'미공개');
 }
}
assert.equal(new Set(rendered.map(x=>x.replace(' | school-detail',''))).size,1,'All levels should have the same main card sections');
const pending=ui.percentiles({publicValues:[null,null,null],statuses:['REVIEW_PENDING','NO_PUBLISHED_VALUE'],locked:false});
assert.equal(pending.children[1].children[3].children[1].textContent,'검수 중');
assert.equal(pending.children[1].children[2].children[1].textContent,'자료 없음');
assert.equal(pending.children[1].children[1].children[1].textContent,'자료 없음');

// Missing, explicitly pending, unpublished, fetching, and failed are distinct.
const cell=(opts,index)=>ui.percentiles(opts).children[1].children[index];
assert.equal(cell({publicValues:[null,null,null]},3).dataset.state,'missing');
assert.equal(cell({publicValues:[null,null,null],statuses:['REVIEW_PENDING']},3).dataset.state,'review');
assert.equal(cell({publicValues:[null,null,null],publicError:true},3).dataset.state,'error');
assert.equal(cell({publicValues:[32.4,null,null],publicError:true},3).dataset.state,'published');
assert.equal(cell({publicValues:[null,null,null],status2026:'unpublished'},0).children[1].textContent,'미공개');
assert.equal(cell({publicValues:[null,null,null],status2026:'error'},0).children[1].textContent,'불러오기 실패');
assert.equal(cell({publicValues:[null,null,null],status2026:'review'},0).children[1].textContent,'검수 중');
assert.equal(cell({publicValues:[null,null,null],status2026:'loading'},0).children[1].textContent,'확인 중');
assert.equal(cell({publicValues:[null,null,null],locked:true,status2026:'error'},0).dataset.state,'locked');
assert.equal(cell({publicValues:[null,null,null],value2026:0,status2026:'error'},0).children[1].textContent,'0.0%');
assert.match(lv1,/current2026\.set\(id,\{status:'error'\}\)/,'Lv.1 network errors are not unpublished');
assert.match(lv2,/current2026\.set\(id,\{status:'error'\}\)/,'Lv.2 network errors are not unpublished');
assert.match(lv1,/publicLoadError=true/,'Lv.1 fallback errors must surface');
assert.match(lv2,/publicLoadError=true/,'Lv.2 fallback errors must surface');
assert.match(report,/yearLookupError/,'Detailed report must distinguish DB lookup failure');

const sync=read('scripts/beagu-2026-mbti-review-sync.gs');
assert.match(sync,/1T_rEz1LqX97pC9gOv33SRmspK2IizTU3wFtxA8P1pC4/);
assert.match(sync,/2026-11-01/);
assert.doesNotMatch(sync,/\.from\('beagu_release_metrics_v2'\)/);
console.log('PASS: 4 status distinctions, three-level UI, 2026-first, safe publication and network failures');
