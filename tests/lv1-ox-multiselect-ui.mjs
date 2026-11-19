import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=p=>readFileSync(p,'utf8');
const html=read('search-lv1.html');
const js=read('js/level-search.js');
const edge=read('supabase/functions/beagu-level-api/index.ts');
const css=read('styles/beagu-search-details-v1.css');
assert.doesNotThrow(()=>new vm.Script(js));
assert.match(html,/20261119-ox-multi1/);
assert.match(js,/schoolQuestionSelections/);
assert.match(edge,/SOURCE_VERIFIED_MULTI_SELECTION/);
assert.match(edge,/checkboxAllowed\[questionId\]/);
assert.match(edge,/ownerHistory\?\.some/);
assert.match(edge,/selected_options/);
assert.match(edge,/schoolQuestionModes,schoolQuestionSelections/);
assert.doesNotMatch(edge,/\.select\('[^']*verified_rows|\.select\('[^']*source_rows/);
assert.doesNotMatch(edge,/schoolDistributions|roundedDistribution:/);
assert.match(css,/beagu-ox-pill\.is-yes/);
assert.match(css,/beagu-ox-pill\.is-no/);
assert.match(css,/beagu-selected-choice/);

class MockNode{
 constructor(tag,cls='',value=''){
  this.tag=tag;this.className=cls;this.value='';this._text=String(value);
  this.children=[];this.attributes={};this.events={};this.style={};this.hidden=false;
  this.classList={add:s=>{this.className+=' '+s;}};
 }
 append(...items){this.children.push(...items);}
 setAttribute(k,v){this.attributes[k]=String(v);}
 addEventListener(k,callback){this.events[k]=callback;}
 get textContent(){return this._text+this.children.map(c=>c.textContent||'').join('');}
 set textContent(value){this._text=String(value);this.children=[];}
}
const make=(tag,cls,text)=>new MockNode(tag,cls,text??'');
const document={createTextNode:s=>new MockNode('#text','',s)};
const window={BeaguHistoricalOriginalQuestions:{'2025':{
  Q03:'교사가 담당하는 행정업무(복수선택)',
  Q04:'진행하는 학교행사(복수선택)',
  Q31:'학습준비물실이 있다.',
  Q32:'교실급식이 있다.',
  Q33:'연구실 정수기가 있다.'
}}};
const start=js.indexOf('  function renderHistoricalBenchmarks('),end=js.indexOf('  function renderYear(',start);
assert.ok(start>0&&end>start);
const renderer=new Function('make','document','window','conciseQuestion','verifiedOptions',
 js.slice(start,end)+'\n return renderHistoricalBenchmarks;')(
 make,document,window,v=>v,()=>({source:'observed',values:['선택지 A','선택지 B']}));
const host=make('div');
renderer(host,2025,{sido_standard:'부산'},[
 {year:2025,questionId:'Q03',modeOption:'예산 품의'},
 {year:2025,questionId:'Q04',modeOption:'운동회'},
 {year:2025,questionId:'Q31',modeOption:'있다'},
 {year:2025,questionId:'Q32',modeOption:'없다'},
 {year:2025,questionId:'Q33',modeOption:'모름'}
],{items:{Q31:{national:{kind:'most_frequent',mode:'있다'},regional:{kind:'most_frequent',mode:'없다'}}}},'ready',[
 {year:2025,questionId:'Q03',selectedOptions:['예산 품의','정보공시','교과서 구입']},
 {year:2025,questionId:'Q04',selectedOptions:['운동회','학예회']}
]);
function find(node,cls){return [node,...node.children.flatMap(n=>find(n,cls))]
 .filter(n=>n.className?.split(' ').includes(cls));}
const blocks=find(host,'historical-question-row');
assert.equal(blocks.length,5);
assert.equal(find(blocks[0],'beagu-selected-choice').length,3);
assert.equal(find(blocks[1],'beagu-selected-choice').length,2);
assert.ok(blocks[0].textContent.includes('정보공시'));
assert.ok(blocks[1].textContent.includes('학예회'));
assert.equal(find(host,'beagu-checkbox-original-options').length,2);
assert.equal(find(host,'beagu-ox-pill').length,5);
assert.equal(find(blocks[2],'is-yes').length,2);
assert.equal(find(blocks[2],'is-no').length,1);
assert.equal(find(blocks[3],'is-no').length,1);
assert.equal(find(blocks[4],'is-unknown').length,1);
assert.equal(find(host,'beagu-question-distribution').length,0);
const missing=make('div');
renderer(missing,2025,{sido_standard:'부산'},[
 {year:2025,questionId:'Q03',modeOption:'예산 품의'}
],{items:{}},'ready',[]);
const missingCheckbox=find(missing,'historical-question-row')[0];
assert.equal(find(missingCheckbox,'beagu-selected-choice').length,0);
assert.ok(missingCheckbox.textContent.includes('검증된 체크 항목 없음'));
console.log('PASS: O/X/? badges and ALL verified school-level checkbox options, no single-mode fallback');
