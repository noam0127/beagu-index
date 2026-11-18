import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=path=>readFileSync(path,'utf8');
const html=read('search-lv1.html');
const search=read('js/level-search.js');
const css=read('styles/beagu-search-details-v1.css');
assert.doesNotThrow(()=>new vm.Script(search));
assert.match(html,/styles\/beagu-search-details-v1\.css\?v=20261118-in-card-v2/);
assert.match(html,/js\/level-search\.js\?v=20261118-in-card-v2/);
assert.match(css,/historical-benchmark-grid/);
assert.match(css,/@media\(max-width:680px\)/);
assert.match(search,/event\.key==='ArrowRight'/);
assert.match(search,/event\.key==='ArrowLeft'/);
assert.match(search,/aria-labelledby/);
assert.match(search,/aria-busy/);
assert.match(search,/readyByYear/);
assert.doesNotMatch(search,/학교별 검증 설문 응답 분포/);
assert.match(search,/if\s*\(!comparison \|\| comparison\.group!=='편집본 공식 학교정보'\)/);
assert.match(search,/api\('school',\{schoolId:school\.school_id\}\)/);
assert.match(search,/vetted\.get\(id\)\|\|null/);
assert.match(search,/원자료에서 확인된 보기 \(전체 목록 미확인\)/);
assert.match(search,/학교별 문항 집계 미공개/);

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
  {year:2025,questionId:'Q01',modeOption:'예',
    roundedDistribution:[{label:'예',pct:70},{label:'아니오',pct:30}]}
],{items:{Q01:{
  national:{mode:'예',kind:'most_frequent'},
  regional:{mode:'아니오',kind:'most_frequent'}
}}},'ready');
const find=(node,cls)=>[node,...node.children.flatMap(child=>find(child,cls))]
  .filter(item=>item.className?.split(' ').includes(cls));
const cards=find(host,'historical-question-row');
assert.equal(cards.length,15,'one original question must create only one result card');
assert.equal(find(host,'beagu-question-distribution').length,1,
  'only approved school distributions are shown inline');
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
console.log('PASS: consolidated school detail, accessible year controls, vetted comparison, in-year question search');
