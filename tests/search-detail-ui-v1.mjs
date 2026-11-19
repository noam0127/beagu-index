import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=path=>readFileSync(path,'utf8');
const html=read('search-lv1.html');
const search=read('js/level-search.js');
const css=read('styles/beagu-search-details-v1.css');
assert.doesNotThrow(()=>new vm.Script(search));
assert.match(html,/styles\/beagu-search-details-v1\.css\?v=20261119-domain-note1/);
assert.match(html,/js\/level-search\.js\?v=20261120-[a-z0-9-]+/);
assert.match(css,/historical-benchmark-grid/);
assert.match(css,/@media\(max-width:680px\)/);
assert.match(search,/event\.key==='ArrowRight'/);
assert.match(search,/event\.key==='ArrowLeft'/);
assert.match(search,/aria-labelledby/);
assert.match(search,/aria-busy/);
assert.match(search,/readyByYear/);
assert.doesNotMatch(search,/학교별 검증 설문 응답 분포/);
assert.match(search,/const domain=comparison\?\.group==='2025년 조사 영역별 점수/);
assert.match(search,/api\('school',\{schoolId:school\.school_id\}\)/);
assert.match(search,/vetted\.get\(id\)\|\|null/);
assert.match(search,/원자료에서 확인된 보기 \(전체 목록 미확인\)/);
assert.match(search,/학교별 문항 집계 미공개/);
assert.doesNotMatch(search,/beagu-benchmark-kind/);
assert.match(search,/circledOption\(value\)/);
assert.match(search,/\['우리 학교',value,'school'\]/);
assert.match(search,/\['지역 '\+kind,comparison\?\.regionalAverage/);
assert.match(search,/\['전국 '\+kind,comparison\?\.nationalAverage/);

class Node{
  constructor(tag,cls='',value=''){
    this.tag=tag;
    this.className=cls;
    this._text=String(value);
    this.value='';
    this.children=[];
    this.hidden=false;
    this.style={};
    this.events={};
    this.attributes={};
    this.classList={add:name=>{this.className+=' '+name;}};
  }
  append(...nodes){this.children.push(...nodes);}
  get textContent(){return this._text+this.children.map(x=>x.textContent||'').join('');}
  set textContent(v){this._text=String(v);this.children=[];}
  setAttribute(key,value){this.attributes[key]=String(value);}
  addEventListener(event,callback){this.events[event]=callback;}
}
const make=(tag,cls,text)=>new Node(tag,cls,text??'');
const document={createTextNode:value=>new Node('#text','',value)};
const questions=Object.fromEntries(Array.from({length:15},(_,i)=>[
  'Q'+String(i+1).padStart(2,'0'),'질문 '+(i+1)
]));
const window={BeaguHistoricalOriginalQuestions:{'2025':questions}};
const start=search.indexOf('  function renderHistoricalBenchmarks(');
const end=search.indexOf('  function renderYear(',start);
assert.ok(start>=0&&end>start,'renderer section must remain available');
const renderer=new Function('make','document','window','conciseQuestion','verifiedOptions',
  search.slice(start,end)+'\n return renderHistoricalBenchmarks;')(
  make,document,window,x=>x,()=>({values:['예','아니오'],source:'verified'})
);
const host=make('div');
renderer(host,2025,{sido_standard:'부산'},[
  {year:2025,questionId:'Q01',modeOption:'예'}
],{items:{Q01:{
  national:{mode:'예',kind:'most_frequent'},
  regional:{mode:'아니오',kind:'most_frequent'}
}}},'ready');
const find=(node,cls)=>[node,...node.children.flatMap(child=>find(child,cls))]
  .filter(item=>item.className?.split(' ').includes(cls));
const cards=find(host,'historical-question-row');
assert.equal(cards.length,15,'one original question must create only one result card');
assert.equal(find(host,'beagu-question-distribution').length,0,
  'option distributions must not be shown in school detail');
assert.equal(find(host,'historical-answer-choices').length,15,
  'original verified answer options remain available');
assert.equal(find(host,'historical-benchmark-grid').length,15,
  'every original question has a three-scope comparison grid');
const finder=find(host,'beagu-question-input')[0];
assert.ok(finder,'15+ question years must have in-page search');
assert.equal(cards.filter(card=>!card.hidden).length,15);
finder.value='질문 7';
finder.events.input();
assert.equal(cards.filter(card=>!card.hidden).length,1,
  'query filter must hide nonmatching question cards');
finder.value='';
finder.events.input();
assert.equal(cards.filter(card=>!card.hidden).length,15,
  'clearing the filter restores all original questions');

const observedScope={window:{}};
vm.runInNewContext(read('js/2025-observed-choices.js'),observedScope);
const q15Options=observedScope.window.Beagu2025ObservedChoices?.Q15;
assert.ok(q15Options?.includes('① 1회미만'),'Use the actually verified Q15 options');
const circledRenderer=new Function('make','document','window','conciseQuestion','verifiedOptions',
  search.slice(start,end)+'\n return renderHistoricalBenchmarks;')(
    make,document,{BeaguHistoricalOriginalQuestions:{'2025':{Q15:'[담임교사 공문량] 기안 공문 수'}}},
    x=>x,()=>({values:q15Options,source:'observed'})
  );
function actualCardValues(schoolAnswer){
 const sample=make('div');
 circledRenderer(sample,2025,{sido_standard:'세종'},[
   {year:2025,questionId:'Q15',modeOption:schoolAnswer}
 ],{items:{Q15:{
   national:{mode:'③ 2~3회',kind:'most_frequent'},
   regional:{mode:'③ 2~3회',kind:'most_frequent'}
 }}},'ready');
 const grid=find(sample,'historical-benchmark-grid')[0];
 return grid.children.map(cell=>cell.children[1].textContent);
}
assert.deepEqual(actualCardValues('1 1회미만'),['① 1회미만','③ 2~3회','③ 2~3회'],
 'Q15 verified school-choice prefix must display a circled number like region/nation');
assert.equal(actualCardValues('2 1회')[0],'② 1회');
assert.equal(actualCardValues('3 2~3회')[0],'③ 2~3회');
assert.equal(actualCardValues('1 99점')[0],'1 99점',
 'Unverified numeric content must not be mistaken for a choice number');
assert.equal(actualCardValues('12%')[0],'12%','Percentages are never choice labels');
assert.equal(actualCardValues('2점')[0],'2점','Score values are never choice labels');
assert.equal(actualCardValues('1 임의보기')[0],'1 임의보기',
 'Do not create ordinal claims for choices absent from source options');

console.log('PASS: consolidated school detail, accessible year controls, vetted comparison, in-year question search');
