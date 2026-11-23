import {readFileSync} from 'node:fs';
import {Script,runInNewContext} from 'node:vm';
import assert from 'node:assert/strict';
const read=name=>readFileSync(name,'utf8');
const pages=['search.html','search-lv1.html'];
const scripts=['js/school-search-card-v1.js','js/level-search.js','js/lv2-edited-search.js','js/school-mbti-v1.js','js/school-detail-groups-v1.js'];
for(const file of scripts)assert.doesNotThrow(()=>new Script(read(file),{filename:file}),file+' invalid JS');
for(const path of pages){
 const html=read(path);
 assert.match(html,/styles\/school-search-card-v1\.css/,path+' missing shared CSS');
 assert.match(html,/js\/school-search-card-v1\.js/,path+' missing shared component');
 assert.match(html,/v=20261031-independent5/,path+' stale shared script URL');
 assert.doesNotMatch(html,/학교 홈페이지 방문|🌐 학교 홈페이지/,path+' displays unnecessary homepage');
 const lines=html.match(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)||[];
 for(const block of lines){
  const js=block.replace(/^<script[^>]*>/,'').replace(/<\/script>$/,'');
  assert.doesNotThrow(()=>new Script(js,{filename:path}),path+' invalid inline JS');
 }
}
const sharedCardCSS=read('styles/school-search-card-v1.css');
assert.match(sharedCardCSS,/\.school-card\{[^}]*border:2px solid #2563eb/, 'Each complete search-result card must have a blue outer border');
for(const page of pages){
  assert.match(read(page),/styles\/school-search-card-v1\.css\?v=20261123-sort-primary1/,page+' must load updated shared card border');
}
// Public search contains an inline Lv.1 login without disclosing codes.
const publicHtml=read('search.html');
for(const id of ['lv1QuickForm','lv1QuickCode','lv1QuickSubmit','lv1QuickMessage','lv1QuickAuthenticated']){
  assert.match(publicHtml,new RegExp('id="'+id+'"'),'Missing first-screen Lv.1 login '+id);
}
assert.match(publicHtml,/id="lv1QuickCode" type="password"/,'Lv.1 code must be masked');
assert.match(publicHtml,/action==='login'\?\{action,code\}/,'Authenticate using server-side login');
assert.match(publicHtml,/Number\(data\.level\)<1/,'Reject weaker access codes');
assert.match(publicHtml,/sessionStorage\.setItem\(key,data\.token\)/,'Store only server session token');
assert.match(publicHtml,/window\.location\.replace\('search-lv1\.html(?:\?v=[a-z0-9-]+)?'\)/,'Auto-open Lv.1 search for new and stored verified sessions');
assert.doesNotMatch(publicHtml,/>Lv\.1 학교 검색하기<\/a>/,'No redundant Lv.1 search button after authentication');
assert.match(publicHtml,/if\(Number\(data\.level\)>=1 && sessionStorage\.getItem\(key\)===saved\)showAuthenticated\(\)/,'Saved sessions must also redirect only after verification');
assert.doesNotMatch(publicHtml,/localStorage\.setItem\(.*(?:code|password)/,'Do not store raw access codes');
const lv0=read('search.html');
assert.match(lv0,/data\/public-2023-2025-school-records-v2\.json/,'Lv.0 must show 2023-2025 historical presence');
assert.match(lv0,/publicParticipationByYear\[y\]\?\.has\(String\(school\.school_id\)\)/,'School list must show historical school-year presence');
assert.doesNotMatch(lv0,/\.select\('respondents'/,'Do not query private response counts in Lv.0');
assert.match(lv0,/id="searchInput"/,'Lv.0 browsing restored');
assert.match(read('search-lv1.html'),/id="searchPanel"/,'Lv.1 search route must remain available');
assert.match(read('search-lv2.html'),/search-lv1\.html/,'Lv.2 URL forwarded to Lv.1');
const lv1=read('js/level-search.js');
const lv2=read('js/lv2-edited-search.js');
const mbti=read('js/school-mbti-v1.js');
const report=read('school-report.html');
for(const [level,code] of [[0,lv0],[1,lv1],[2,lv2]]){
 assert.match(code,/BeaguSchoolSearchCard\.createCard\(/,'Lv.'+level+' not using canonical card');
 assert.match(code,level===1?/level:\s*viewerTier/:new RegExp('level:\\s*'+level),
   'Lv.'+level+' incorrect card privilege');
 assert.doesNotMatch(code,/🌐 학교 홈페이지|address,homepage/);
}
assert.match(mbti,/percentile\.insertAdjacentElement\('afterend',badge\)/);
assert.ok(lv2.indexOf("container.append(el('h3','school-history-heading','과거 상세자료')") < lv2.indexOf('container.append(newer)'),'Historical years must precede 2026');
assert.doesNotMatch(report,/schoolHomepage|학교 홈페이지 방문|,homepage,/);
assert.match(report,/id="latestYearMessage"/,'Lv.0 latest year explanation');
assert.ok(report.indexOf('id="yearGrid"') < report.indexOf('id="latestYearMessage"'),'Lv.0 year navigation precedes 2026 status banner');
assert.match(report,/현재.*2026|2026년 학교별 통계/,'Lv.0 current release status');
assert.match(lv1,/const YEARS = \[2023, 2024, 2025, 2026\]/,'Lv.1 has four-year timeline');
assert.match(lv1,/2026년 승인 결과 새로고침/,'Lv.1 supports fresh verified 2026 results');
assert.doesNotMatch(lv1,/section\.append\(newer, currentContent\)/,'Do not duplicate 2026 in UI');
assert.match(lv2,/const years=\[2023,2024,2025\]/,'Lv.2 history tab order');
assert.match(report,/function renderYearGrid\(\)\s*\{[\s\S]*?for\(const year of \[2023,2024,2025,2026\]\)/,'Lv.0 chronological selector');
assert.ok(lv2.indexOf('container.append(newer)') < lv2.indexOf('BeaguSchoolMBTI.createDetail'),'Lv.2 current report before MBTI');

for(const html of [read('search-lv1.html')]){
 assert.match(html,/js\/school-mbti-v1\.js/);
}
assert.doesNotMatch(lv0,/school-mbti-v1\.js/);
for(const page of ['search-lv1.html']){
 const html=read(page);
 assert.match(html,/styles\/school-detail-groups-v1\.css\?v=20261031-groups6/);
 assert.match(html,/js\/school-detail-groups-v1\.js\?v=20261119-teacher-groups2/);
 assert.ok(html.indexOf('school-detail-groups-v1.js')<html.indexOf(page.includes('lv1')?'js/level-search.js':'js/lv2-edited-search.js'),
  'Group utility must load before tier-specific renderer');
}
assert.match(lv1,/BeaguDetailGroups\.appendGrouped\(section,releasedMetrics/);
assert.doesNotMatch(lv1,/BeaguDetailGroups\.appendGrouped\(section,schoolScale/,'Lv.1 omits duplicated school profile and scale fields in the history disclosure');
assert.match(lv1,/historyPanel\.append\(detail\)/,'Lv.1 detail appears inside the tapped year-result panel');
assert.match(lv1,/BeaguDetailGroups\.appendGrouped\(section,vetted/);
assert.match(lv2,/BeaguDetailGroups\.appendGrouped\(root,approvedItems/);
assert.match(lv2,/BeaguDetailGroups\.appendGrouped\(newer,stats/);
assert.match(lv2,/releasedFields\(metadata,year,values\)/,'Lv.2 server-reviewed field allowlist remains enforced');
assert.doesNotMatch(lv0,/school-detail-groups-v1\.js/,'Lv.0 must not load protected detail controls');


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
 assert.equal(percentile.children.length,3,'Show only title, yearly values, and chart without repeated notes');
 const cells=percentile.children[1].children;
 assert.equal(cells.length,4);
 assert.deepEqual(cells.map(c=>c.dataset.year),['2023','2024','2025','2026']);
 assert.equal(cells[1].children[1].textContent,'자료 없음');
 assert.equal(cells[0].children[1].textContent,'38.3%');
 assert.equal(cells[2].children[1].textContent,'74.5%');
 if(level===0){
  assert.equal(open.tagName,'a');
  assert.equal(open.href,'school-report.html?school_id=7832070');
  assert.equal(detail,null);
  assert.equal(cells[3].children[1].textContent,'🔒 Lv.1+ 승인 시');
 }else{
  assert.equal(open.tagName,'button');
  assert.equal(open.attributes['aria-expanded'],'false');
  assert.equal(open.attributes['aria-controls'],detail.id);
  assert.equal(detail.hidden,true);
  assert.equal(card.children[5],detail);
  assert.equal(cells[3].children[1].textContent,'미공개');
 }
}
assert.equal(new Set(rendered.map(x=>x.replace(' | school-detail',''))).size,1,'All levels should have the same main card sections');
const pending=ui.percentiles({publicValues:[null,null,null],statuses:['REVIEW_PENDING','NO_PUBLISHED_VALUE'],locked:false});
assert.equal(pending.children[1].children[0].children[1].textContent,'검수 중');
assert.equal(pending.children[1].children[1].children[1].textContent,'자료 없음');
assert.equal(pending.children[1].children[2].children[1].textContent,'자료 없음');

// Missing, explicitly pending, unpublished, fetching, and failed are distinct.
const cell=(opts,index)=>ui.percentiles(opts).children[1].children[index];
assert.equal(cell({publicValues:[null,null,null]},0).dataset.state,'missing');
assert.equal(cell({publicValues:[null,null,null],statuses:['REVIEW_PENDING']},0).dataset.state,'review');
assert.equal(cell({publicValues:[null,null,null],publicError:true},0).dataset.state,'error');
assert.equal(cell({publicValues:[32.4,null,null],publicError:true},0).dataset.state,'published');
assert.equal(cell({publicValues:[null,null,null],status2026:'unpublished'},3).children[1].textContent,'미공개');
assert.equal(cell({publicValues:[null,null,null],status2026:'error'},3).children[1].textContent,'불러오기 실패');
assert.equal(cell({publicValues:[null,null,null],status2026:'review'},3).children[1].textContent,'검수 중');
assert.equal(cell({publicValues:[null,null,null],status2026:'loading'},3).children[1].textContent,'확인 중');
assert.equal(cell({publicValues:[null,null,null],locked:true,status2026:'error'},3).dataset.state,'locked');
assert.equal(cell({publicValues:[null,null,null],value2026:0,status2026:'error'},3).children[1].textContent,'0.0%');
assert.match(lv1,/current2026\.set\(id,\{status:'error'\}\)/,'Lv.1 network errors are not unpublished');
assert.match(lv2,/current2026\.set\(id,\{status:'error'\}\)/,'Lv.2 network errors are not unpublished');
assert.match(lv1,/publicLoadError=true/,'Lv.1 fallback errors must surface');
assert.match(lv2,/publicLoadError=true/,'Lv.2 fallback errors must surface');
assert.match(report,/yearLookupError/,'Detailed report must distinguish DB lookup failure');

// A graph of differently constructed yearly percentiles must never connect years.
const chartCode=read('js/percentile-chart.js');
assert.doesNotThrow(()=>new Script(chartCode));
const chartScope={};
runInNewContext(chartCode,chartScope);
const svg=chartScope.percentileChart([20,40,60,80]);
assert.match(svg,/연도별 개별 백분위/);
assert.match(svg,/직접 비교 불가/);
assert.match(svg,/2023년 20.0백분위; 2024년 40.0백분위; 2025년 60.0백분위; 2026년 80.0백분위/);
assert.equal((svg.match(/<circle /g)||[]).length,4);
assert.equal((svg.match(/<line /g)||[]).length,7,'Only 3 axis lines + 4 independent vertical stems');
for(const x of ['48','128','208','288']){
  assert.match(svg,new RegExp('<line x1="'+x+'" x2="'+x+'"'), 'Each dot has its own stem');
}
assert.doesNotMatch(svg,/백분위 변화|연도 간 변화|추세선/);
const svgMissing=chartScope.percentileChart([10,null,30,null],{blank2026:true,labels:['자료 없음','검수 중','미공개','미공개']});
assert.equal((svgMissing.match(/<circle /g)||[]).length,2,'Never draw a marker for a missing year');
assert.doesNotMatch(svgMissing,/fill="#cbd5e1"/,'No fake missing-value dot at zero');
assert.match(svgMissing,/2024년 검수 중/);
assert.match(svgMissing,/2026년 미공개/);
assert.doesNotMatch(svgMissing,/>null%|>NaN%/);
for(const page of pages)assert.match(read(page),/js\/percentile-chart\.js\?v=20261031-independent5b/);
assert.match(read('js/school-search-card-v1.js'),/for\(const i of \[0,1,2,3\]\)/);
assert.doesNotMatch(read('js/school-search-card-v1.js'),/표시 순서: 2023|각 점은 해당 연도의 독립적인 백분위|자료 기준: 2026\.10\.31|percentile-notes|percentile-note/);

// User-visible grouping must be mobile-friendly and never drop unrecognized approved fields.
runInNewContext(read('js/school-detail-groups-v1.js'),{window,document});
const groupUI=window.BeaguDetailGroups;
const examples=[
 {label:'학생 수',value:'350명'},
 {label:'교원지원공간',value:'3실'},
 {label:'우유급식',value:'미실시'},
 {label:'행정업무',value:'구분'},
 {label:'2025년 전국 백분위',value:'35%'}
];
assert.equal(groupUI.classify(examples[0]),'scale');
assert.equal(groupUI.classify(examples[1]),'facilities');
assert.equal(groupUI.classify(examples[2]),'meals');
assert.equal(groupUI.classify(examples[3]),'admin');
assert.equal(groupUI.classify(examples[4]),'other');
const groupHost=new FakeNode('div');
const n=groupUI.appendGrouped(groupHost,examples,(body,item)=>{
 const child=new FakeNode('div');child.textContent=item.label+' '+item.value;body.append(child);
});
assert.equal(n,5,'All approved rows remain visible after expanding');
assert.deepEqual(groupHost.children.map(g=>g.dataset.topic),['scale','facilities','meals','admin','other']);
for(const group of groupHost.children){
 assert.equal(group.tagName,'details');
 assert.equal(group.open,false,'Topic panels default collapsed to reduce mobile scrolling');
 assert.equal(group.children[0].tagName,'summary');
 assert.equal(group.children[1].children.length,1);
 assert.match(group.children[0].children[1].textContent,/1개 승인항목/);
}
assert.equal(groupUI.appendGrouped(new FakeNode('div'),[],()=>{}),0,'Empty sets do not expose fake topics');
assert.match(read('styles/school-detail-groups-v1.css'),/min-height:48px/,'Touch target must remain accessible');

const sync=read('scripts/beagu-2026-mbti-review-sync.gs');
assert.match(sync,/snapshot\|\|readBeagu2026SourceSnapshot\(\)/);
assert.match(read('scripts/beagu-2026-noon-sync.gs'),/1T_rEz1LqX97pC9gOv33SRmspK2IizTU3wFtxA8P1pC4/);
assert.match(sync,/2026-11-01/);
assert.doesNotMatch(sync,/\.from\('beagu_release_metrics_v2'\)/);
console.log('PASS: 6th priority collapsible grouped approved fields, 2023–2026 order, chart, access gates');
