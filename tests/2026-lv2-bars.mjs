import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=p=>readFileSync(p,'utf8');
const source=read('js/2026-lv2-horizontal-bars-v1.js');
const search=read('js/level-search.js');
const html=read('search-lv1.html');
const css=read('styles/2026-lv2-horizontal-bars-v1.css');
assert.doesNotThrow(()=>new vm.Script(source));
assert.doesNotThrow(()=>new vm.Script(search));
assert.match(html,/js\/2026-lv2-horizontal-bars-v1\.js\?v=/);
assert.match(html,/styles\/2026-lv2-horizontal-bars-v1\.css\?v=/);
assert.match(css,/@media\(max-width:480px\)/);
assert.match(css,/\.beagu-lv2-bar-track/);
assert.match(search,/Number\(data\.level\)/,'Tier must come from the verified school API result');
assert.match(search,/Number\(fresh\.level\)/,'Refresh must use the returned tier, not page state');
assert.match(search,/Number\(r\.access_level\)<=Number\(viewerTier\)/,'Lv1 must not render Lv2 metrics');
assert.doesNotMatch(source,/\.innerHTML\s*=/,'Avoid introducing HTML injection');

class Node {
  constructor(tag,text=''){
    this.tag=tag;this.textContent=text;this.className='';this.children=[];
    this.style={};this.attrs={};this.events={};
  }
  append(...children){this.children.push(...children)}
  replaceChildren(...children){this.children=[...children]}
  setAttribute(name,value){this.attrs[name]=String(value)}
  addEventListener(type,fn){this.events[type]=fn}
  querySelectorAll(){return []}
}
const document={
  createElement:tag=>new Node(tag),
  createTextNode:text=>new Node('#text',String(text))
};
const browser={window:{
  Beagu2026Questionnaire:{
    Q01:{question:'교육 관련 문항',kind:'choice',options:['전혀 그렇지 않다','보통이다','매우 그렇다'],rows:[],columns:[]},
    Q14:{question:'학교 환경 문항',kind:'choice',options:['첫 번째','두 번째'],rows:[],columns:[]},
    Q31:{question:'비공개',kind:'choice',options:['비밀'],rows:[],columns:[]}
  }
},document};
vm.createContext(browser);
vm.runInContext(source,browser);
vm.runInContext(read('js/2026-approved-question-results.js'),browser);
const bars=browser.window.Beagu2026Lv2Bars;
const metric={key:'Q01',label:'자율성 점수',value:62.5,unit:'점'};
assert.equal(bars.scoreValue(metric),62.5);
assert.equal(bars.scoreValue({...metric,value:'0'}),0);
for(const faulty of [
  {...metric,value:101},{...metric,value:-1},{...metric,value:'NaN'},
  {...metric,value:'12%$$'},{...metric,unit:'%'},{...metric,key:'Q14'},
  {...metric,value:'0; alert(1)'},{...metric,value:null}
])assert.equal(bars.scoreValue(faulty),null,'Unvetted metric cannot produce a bar');
const flatten=(node)=>[node,...node.children.flatMap(child=>flatten(child))];
const byClass=(node,key)=>flatten(node).filter(n=>n.className?.split(' ').includes(key));
const host=new Node('div');
assert.equal(bars.appendMetric(host,metric),true);
assert.equal(byClass(host,'beagu-lv2-bar-track').length,1);
assert.equal(byClass(host,'beagu-lv2-bar-track')[0].attrs['aria-valuenow'],'62.5');
assert.equal(byClass(host,'beagu-lv2-bar-fill')[0].style.width,'62.5%');
assert.equal(bars.appendMetric(new Node('div'),{...metric,value:102}),false);
const comparison=new Node('div');
bars.appendMetric(comparison,{...metric,referenceYear:2026,comparisonKind:'average',
  regionalAverage:'55점',nationalAverage:'61점'});
assert.equal(byClass(comparison,'beagu-lv2-bar-track').length,3);
const wrongBenchmark=new Node('div');
bars.appendMetric(wrongBenchmark,{...metric,referenceYear:2025,comparisonKind:'average',
  regionalAverage:'55점',nationalAverage:'61점'});
assert.equal(byClass(wrongBenchmark,'beagu-lv2-bar-track').length,1,'Different source-year comparisons must be hidden');
const original={questionId:'Q14',row:-1,values:['두 번째']};
const choice=new Node('article');
assert.equal(bars.appendChoices(choice,original,browser.window.Beagu2026Questionnaire.Q14),true);
assert.equal(byClass(choice,'beagu-lv2-choice').length,2);
assert.equal(byClass(choice,'beagu-lv2-choice').filter(n=>n.className.includes('is-selected')).length,1);
assert.equal(byClass(choice,'beagu-lv2-bar-fill').length,0,'Never invent choice distribution bars');
const malicious=new Node('article');
assert.equal(bars.appendChoices(malicious,{...original,values:['미등록 응답']},browser.window.Beagu2026Questionnaire.Q14),false);
assert.equal(malicious.children.length,0);
const reader=browser.window.Beagu2026ApprovedResults;
const r1=new Node('div');reader.render(r1,[original],{level:1});
assert.equal(byClass(r1,'beagu-lv2-choice-group').length,0);
const r2=new Node('div');reader.render(r2,[original],{level:2});
assert.equal(byClass(r2,'beagu-lv2-choice-group').length,1);
const privateResult=new Node('div');reader.render(privateResult,[{questionId:'Q31',row:-1,values:['비밀']}],{level:2});
assert.equal(byClass(privateResult,'beagu-question-block').length,0);

// Use the real 2026 year rendering fragment to verify that only a server-verified
// Lv2 tier switches from approved metric text to a horizontal score chart.
const a=search.indexOf('  function renderYear(');
const b=search.indexOf('  function percentile2026(',a);
assert.ok(a>0&&b>a);
const make=(tag,cls,value)=>{
  const node=new Node(tag,String(value??''));node.className=cls||'';return node;
};
const groups={appendGrouped(target,metrics,render){
  for(const m of metrics)render(target,m);
}};
const draw=new Function('window','make','BeaguDetailGroups','addRow','metricValue','api','loggedOut','renderHistoricalBenchmarks',
  search.slice(a,b)+'\nreturn renderYear;')(
  browser.window,make,groups,(target,label,value)=>target.append(make('p','metric-text',label+value)),
  metric=>String(metric.value)+(metric.unit||''),async()=>({rows:[]}),()=>{},()=>{});
const rows=[
  {year:2026,access_level:1,summary:{metrics:[metric]}},
  {year:2026,access_level:2,summary:{metrics:[{key:'Q14',label:'승인된 Lv2 참고지표',value:44,unit:'점'}]}}
];
const lv1=new Node('div');draw(lv1,2026,rows,null,'ABC1234',[],null,null,'ready',[],[],1);
assert.equal(byClass(lv1,'beagu-lv2-score-card').length,0);
assert.equal(byClass(lv1,'metric-text').length,1,'Lv1 sees only approved Lv1 metrics as text');
assert.equal(byClass(lv1,'beagu-year-release-note').length,1);
const lv2=new Node('div');draw(lv2,2026,rows,null,'ABC1234',[],null,null,'ready',[],[],2);
assert.equal(byClass(lv2,'beagu-lv2-score-card').length,1);
assert.equal(byClass(lv2,'metric-text').length,1,'Approved but non-chartable metric must remain visible as text');
const empty=new Node('div');draw(empty,2026,[],null,'ABC1234',[],null,null,'ready',[],[],2);
assert.equal(byClass(empty,'beagu-lv2-score-card').length,0,'Never plot withheld school data');
assert.equal(byClass(empty,'beagu-year-survey-link').length,1,'Existing empty-state call to action stays');
console.log('PASS Lv2 chart: score scale, valid comparisons, hidden rates, verified tier, responsive/empty state');