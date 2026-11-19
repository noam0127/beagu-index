import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=path=>readFileSync(path,'utf8');
const backend=read('supabase/functions/beagu-level-api/index.ts');
const frontend=read('js/level-search.js');
const groups=read('js/school-detail-groups-v1.js');
const html=read('search-lv1.html');
const css=read('styles/beagu-search-details-v1.css');
const migration=read('supabase/migrations/20261119_2025_domain_comparisons_v1.sql');
assert.doesNotThrow(()=>new vm.Script(frontend));
assert.doesNotThrow(()=>new vm.Script(groups));
assert.match(html,/js\/level-search\.js\?v=20261119-lv1-graph1/);
assert.match(html,/js\/school-detail-groups-v1\.js\?v=20261119-teacher-groups2/);
assert.match(html,/beagu-search-details-v1\.css\?v=20261119-survey-empty1/);
assert.match(migration,/REVOKE ALL ON public\.beagu_2025_domain_comparisons_v1 FROM PUBLIC,anon,authenticated/);
assert.match(backend,/beagu_2025_domain_comparisons_v1/);
assert.match(backend,/n>=2\?'O':'X'/);
assert.match(backend,/n>=1\?'O':'X'/);
for(const key of ['vice_principals','lead_teachers','meal_place','milk_lunch'])
  assert.match(backend,new RegExp("'"+key+"'"));
assert.match(frontend,/circledOption\(value\)/);
assert.doesNotMatch(frontend,/beagu-benchmark-kind/);
assert.match(css,/beagu-school-only-row/);

class Node {
  constructor(tag,cls='',value=''){
    this.tag=tag;this.className=cls;this._text=String(value);
    this.children=[];this.attributes={};this.dataset={};this.style={};
    this.hidden=false;this.open=false;
    this.classList={add:v=>{this.className+=' '+v;}};
  }
  get textContent(){return this._text+this.children.map(c=>c.textContent||'').join('');}
  set textContent(value){this._text=String(value);this.children=[];}
  append(...children){this.children.push(...children);}
  setAttribute(key,value){this.attributes[key]=String(value);}
  addEventListener(){}
}
const document={
  createElement:tag=>new Node(tag),
  createTextNode:value=>new Node('#text','',value)
};
const window={BeaguHistoricalOriginalQuestions:{'2025':{
  Q01:'예시 질문',Q05:'보기 선택',Q06:'점수 선택'
}}};
new Function('window','document',groups)(window,document);
const classify=window.BeaguDetailGroups.classify;
const fields=[
  {factKey:'students'}, {factKey:'district_housing_price_mean'},
  {factKey:'teachers'}, {factKey:'junior_teacher_ratio'},
  {factKey:'male_teacher_ratio'}, {factKey:'september_participation_rate'},
  {factKey:'vice_principals'}, {factKey:'lead_teachers'},
  {factKey:'classes'}, {factKey:'meal_place'}, {factKey:'milk_lunch'}
];
const expected=['scale','scale','teachers','teachers','teachers','teachers',
  'teachers','teachers','classes','meals','meals'];
assert.deepEqual(fields.map(classify),expected);
assert.equal(classify({label:'업무부하',group:'2025년 조사 영역별 점수 · 응답 표본 참고'}),'domains');
const host=new Node('div');
const shuffled=[fields[6],fields[4],fields[8],fields[1],fields[7],fields[3],fields[2],
  fields[5],fields[0],fields[9],fields[10]];
window.BeaguDetailGroups.appendGrouped(host,shuffled,(body,item)=>body.append(new Node('value','',item.factKey)));
assert.deepEqual(host.children.map(c=>c.dataset.topic),['scale','teachers','classes','meals']);
assert.deepEqual(host.children[0].children[1].children.map(c=>c.textContent),
  ['students','district_housing_price_mean']);
assert.deepEqual(host.children[1].children[1].children.map(c=>c.textContent),
  ['teachers','junior_teacher_ratio','male_teacher_ratio','september_participation_rate',
   'vice_principals','lead_teachers']);

const make=(tag,cls,text)=>new Node(tag,cls,text??'');
const rowStart=frontend.indexOf('  function addRow(');
const rowEnd=frontend.indexOf('  function asPublicPercentiles(',rowStart);
assert.ok(rowStart>=0&&rowEnd>rowStart);
const addRow=new Function('make',frontend.slice(rowStart,rowEnd)+'\nreturn addRow;')(make);
const rows=new Node('div');
addRow(rows,'수석교사 유무','O',{group:'편집본 공식 학교정보',factKey:'lead_teachers',schoolOnly:true});
addRow(rows,'교감 2인 이상','X',{group:'편집본 공식 학교정보',factKey:'vice_principals',schoolOnly:true});
addRow(rows,'급식 장소','식당·교실 병행',{group:'편집본 공식 학교정보',factKey:'meal_place',schoolOnly:true});
addRow(rows,'우유급식','O',{group:'편집본 공식 학교정보',factKey:'milk_lunch',schoolOnly:true});
assert.equal(rows.children.length,4);
assert.equal(rows.children.every(r=>r.children.length===2),true,'school-only rows must not show regional/national columns');
assert.equal(rows.children[0].children[1].children[0].textContent,'O');
assert.equal(rows.children[1].children[1].children[0].textContent,'X');
assert.match(rows.children[2].textContent,/식당·교실 병행/);
assert.equal(rows.children[3].children[1].children[0].textContent,'O');
const compares=new Node('div');
addRow(compares,'2급 정교사 비율','12%',{
  group:'편집본 공식 학교정보',factKey:'junior_teacher_ratio',
  regionalAverage:'14%',nationalAverage:'17%',referenceYear:2024});
addRow(compares,'업무부하','53점',{
  group:'2025년 조사 영역별 점수 · 응답 표본 참고',
  regionalAverage:'51점',nationalAverage:'50점',referenceYear:2025});
const grids=compares.children.map(row=>row.children.find(el=>el.className==='compare-grid'));
assert.deepEqual(grids.map(g=>g.children.map(v=>v.children[0].textContent)),[
 ['우리 학교','지역 평균','전국 평균'],
 ['우리 학교','지역 평균','전국 평균']
]);
assert.deepEqual(grids[0].children.map(v=>v.children[1].textContent),['12%','14%','17%']);
assert.deepEqual(grids[1].children.map(v=>v.children[1].textContent),['53점','51점','50점']);

const start=frontend.indexOf('  function renderHistoricalBenchmarks(');
const end=frontend.indexOf('  function renderYear(',start);
const render=new Function('make','document','window','conciseQuestion','verifiedOptions',
 frontend.slice(start,end)+'\nreturn renderHistoricalBenchmarks;')(
 make,document,window,v=>v,()=>({values:[],source:'missing'}));
const questionHost=new Node('div');
render(questionHost,2025,{sido_standard:'부산'},[
 {year:2025,questionId:'Q01',modeOption:'있다'},
 {year:2025,questionId:'Q05',modeOption:'1, 2, 3'},
 {year:2025,questionId:'Q06',modeOption:'2점'}
],{items:{Q05:{
 regional:{mean:'1'},national:{mean:'2'}
}}},'ready');
function descendants(node,cls){
 return [node,...node.children.flatMap(child=>descendants(child,cls))]
   .filter(item=>item.className?.split(' ').includes(cls));
}
const cards=descendants(questionHost,'historical-question-row');
assert.equal(cards.length,3);
const fifth=cards[1];
const fifthGrid=descendants(fifth,'historical-benchmark-grid')[0];
assert.deepEqual(fifthGrid.children.map(c=>c.children[0].textContent),
  ['우리 학교','부산','전국']);
assert.match(fifthGrid.children[0].textContent,/① ② ③/);
assert.equal(fifthGrid.children[2].textContent.includes('②'),false,
  'numeric nationwide value must remain ordinary, not a school ordinal');
assert.match(cards[2].textContent,/2점/);
assert.equal(descendants(questionHost,'beagu-benchmark-kind').length,0);
console.log('PASS: school size, faculty order, school-only O/X, domain comparisons and circled school option numbers');
