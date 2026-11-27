/**
 * 2026 school-result withdrawal flow using the actual browser view/controller
 * functions and deterministic synthetic DOM/API fixtures.
 *
 * NOT a live-browser, deployed-site, or real-person survey test.
 * No operational school rows, respondent data, Supabase calls or secrets.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=path=>readFileSync(path,'utf8');
const search=read('js/level-search.js');
const comparison=read('js/statistics-compare.js');
const qid='Q01';
const schoolId='ABC1234';

class Node {
  constructor(tag,cls='',value=''){
    this.tag=tag;
    this.className=cls;
    this.textContent=String(value);
    this.children=[];
    this.events={};
    this.attrs={};
    this.dataset={};
    this.parent=null;
    this.hidden=false;
    this.isConnected=true;
    this.style={};
    this.classList={add(){},remove(){},toggle(){}};
  }
  append(...nodes){
    for(const node of nodes){
      if(node===null||node===undefined)continue;
      if(typeof node!=='object')this.children.push(new Node('#text','',node));
      else{node.parent=this;this.children.push(node);}
    }
  }
  replaceChildren(...nodes){
    for(const child of this.children)child.parent=null;
    this.children=[];
    this.append(...nodes);
  }
  setAttribute(name,value){this.attrs[name]=String(value);}
  getAttribute(name){return this.attrs[name]??null;}
  removeAttribute(name){delete this.attrs[name];}
  addEventListener(name,cb){this.events[name]=cb;}
  closest(selector){
    const cls=selector.startsWith('.')?selector.slice(1):selector;
    let p=this;
    while(p){if(p.className.split(' ').includes(cls))return p;p=p.parent;}
    return null;
  }
  querySelectorAll(selector){
    // No percentile cards or metric groups appear in this synthetic fixture.
    if(selector==='.percentile-cell'||selector==='.beagu-detail-group')return [];
    return find(this,()=>false);
  }
}
const make=(tag,cls,value)=>new Node(tag,cls,value===undefined?'':value);
function find(root,predicate){
  const all=[root];
  for(let i=0;i<all.length;i++)all.push(...all[i].children);
  return all.filter(predicate);
}
function visibleText(root){
  return find(root,()=>true).map(node=>node.textContent).join(' ');
}
const browser={window:{},document:{
  createElement:tag=>new Node(tag),
  createTextNode:text=>new Node('#text','',text)
}};
vm.createContext(browser);
vm.runInContext(read('js/2026-questionnaire-options-v1.2.js'),browser);
vm.runInContext(read('js/2026-approved-question-results.js'),browser);
const choice=browser.window.Beagu2026Questionnaire.Q01.options[0];
const answer={questionId:qid,row:-1,values:[choice]};
const sensitive={questionId:'Q31',row:-1,values:[choice]};
const approvedResponse={
  level:1,
  rows:[],
  schoolQuestionModes:[],
  schoolQuestionSelections:[],
  schoolQuestionResults2026:[answer,sensitive]
};
const withheldResponse={...approvedResponse,schoolQuestionResults2026:[]};

const rendererStart=search.indexOf('  function renderYear(');
const rendererEnd=search.indexOf('  function percentile2026(',rendererStart);
const viewStart=search.indexOf('  function showDetails(');
const viewEnd=search.indexOf('  function render(',viewStart);
assert.ok(rendererStart>0&&rendererEnd>rendererStart&&viewStart>rendererEnd&&viewEnd>viewStart,
  'Find the actual production school-detail functions');

const approved2026Views=new WeakMap();
const renderYear=new Function(
  'window','make','BeaguDetailGroups','addRow','metricValue','api','loggedOut',
  'renderHistoricalBenchmarks','approved2026Views','metrics2026',
  search.slice(rendererStart,rendererEnd)+'\nreturn renderYear;'
)(
  browser.window,make,{appendGrouped(){}},()=>{},()=>'',async()=>withheldResponse,
  ()=>{},()=>{},approved2026Views,()=>[]
);
const renderWrapped=(host,year,...args)=>{
  if(year!==2026){
    host.replaceChildren(make('p','synthetic-previous-year','2025년 이전 검증 자료'));
    return;
  }
  return renderYear(host,year,...args);
};
const showDetails=new Function(
 'make','renderYear','asPublicPercentiles','YEARS','level',
 'loadGeographyComparisons','session','approved2026Views','window','yearlyPercentileHistory','current2026',
 search.slice(viewStart,viewEnd)+'\nreturn showDetails;'
)(
 make,renderWrapped,()=>[null,null,null,null],[2023,2024,2025,2026],
 1,async()=>({}),'synthetic-session',approved2026Views,browser.window,()=>make('section','synthetic-yearly-history'),new Map()
);
const card=make('article','school-card');
const detail=make('div','school-detail');
card.append(detail);
const school={school_id:schoolId,school_name:'가상검증초등학교',sido_standard:'가상지역'};
showDetails(detail,approvedResponse.rows,school,[],[],approvedResponse.schoolQuestionResults2026,1);
const tabs=find(detail,node=>node.tag==='button' && node.dataset.year);
const tab2025=tabs.find(node=>node.dataset.year==='2025');
const tab2026=tabs.find(node=>node.dataset.year==='2026');
assert.ok(tab2025&&tab2026,'Actual school-search 2025/2026 tabs must be wired');
assert.ok(visibleText(detail).includes(choice),'Approved synthetic Q01 should display');
assert.ok(!visibleText(detail).includes('Q31.'),'Q31 must stay private');
const synchronize=approved2026Views.get(detail);
assert.equal(typeof synchronize,'function','Actual search detail must register an approval refresh controller');

// The approval is withdrawn in a normal server response.
synchronize(withheldResponse,false);
assert.ok(!visibleText(detail).includes(choice),'Withheld Q01 must disappear');
tab2025.events.click();
await new Promise(resolve=>setImmediate(resolve)); // geography comparison resolves asynchronously
assert.ok(visibleText(detail).includes('2025년 이전 검증 자료'));
tab2026.events.click();
assert.ok(!visibleText(detail).includes(choice),'Tab switch must not resurrect a withdrawn answer');

// Simulate reapproval on a synthetic snapshot, then an API failure.
synchronize(approvedResponse,false);
assert.ok(visibleText(detail).includes(choice));
synchronize(null,true);
assert.ok(!visibleText(detail).includes(choice));
assert.ok(visibleText(detail).includes('최신 공개 승인 상태를 확인하지 못했습니다'));
tab2025.events.click();
tab2026.events.click();
assert.ok(!visibleText(detail).includes(choice),'An error cannot resurrect an old closure value');
synchronize(withheldResponse,false);
assert.ok(!visibleText(detail).includes(choice));

// The comparison page calls the real authenticated school-loading code.
const loadStart=comparison.indexOf('  async function loadApprovedSchool(');
const loadEnd=comparison.indexOf('  function renderSuggestions(',loadStart);
assert.ok(loadStart>0&&loadEnd>loadStart,'Comparison loader must be locatable');
const comparisonState={
  sessionToken:'synthetic-session',authLevel:1,authEpoch:1,
  approvedLoading:new Set(),approvedBySchool:new Map(),
  public2026:new Map(),public2026Checked:new Set(),
  public2026Error:new Set(),public2026Loading:new Set()
};
let apiMode='approved';
const history={year:2025,questionId:'Q01',modeOption:'2025년 승인된 예시 선택'};
// Use a deterministic closed-choice validator for the synthetic historical fixture.
browser.window.BeaguHistoricalClosedChoice=(year,qid,value)=>year===2025&&qid==='Q01'&&value===history.modeOption?value:null;
const authenticatedReply=()=>{
  if(apiMode==='offline')throw Object.assign(new Error('synthetic timeout'),{status:503});
  return {level:1,rows:[],schoolQuestionModes:[history],
    schoolQuestionResults2026:apiMode==='approved'?[answer]:[]};
};
let renderCount=0;
const loadApprovedSchool=new Function(
 'state','authRequest','renderTable','YEARS','validServerText','basicFactKeys',
 'window','SUPABASE_URL','clearAuth','console',
 comparison.slice(loadStart,loadEnd)+'\nreturn loadApprovedSchool;'
)(
 comparisonState,async()=>authenticatedReply(),()=>{renderCount++;},
 [2023,2024,2025,2026],(x,max)=>typeof x==='string'&&x.length>0&&x.length<=max,
 new Set(),browser.window,'https://synthetic.example.invalid',()=>assert.fail('unexpected auth reset'),console
);
await loadApprovedSchool(schoolId);
assert.equal(comparisonState.approvedBySchool.get(schoolId).items[2026].Q01,choice);
assert.equal(comparisonState.approvedBySchool.get(schoolId).items[2025].Q01,history.modeOption);
apiMode='withheld';
await loadApprovedSchool(schoolId,true);
assert.deepEqual(Object.keys(comparisonState.approvedBySchool.get(schoolId).items[2026]),[]);
assert.equal(comparisonState.approvedBySchool.get(schoolId).items[2025].Q01,history.modeOption);
apiMode='approved';
await loadApprovedSchool(schoolId,true);
assert.equal(comparisonState.approvedBySchool.get(schoolId).items[2026].Q01,choice);
apiMode='offline';
await loadApprovedSchool(schoolId,true);
assert.deepEqual(Object.keys(comparisonState.approvedBySchool.get(schoolId).items[2026]),[]);
assert.equal(comparisonState.approvedBySchool.get(schoolId).items[2025].Q01,history.modeOption);
assert.ok(renderCount>=8,'Comparison should rerender around approval changes');

// Public 2026 percentile path: approved, withdrawn, connection failure.
const publicStart=comparison.indexOf('  async function loadPublic2026(');
const publicEnd=comparison.indexOf('  function percentile(',publicStart);
assert.ok(publicStart>0&&publicEnd>publicStart);
let percentileMode='approved';
const supabaseClient={from(){assert.fail('Public comparison must not query raw school rows');}};
const percentileRequest=async(action,payload,token)=>{
  assert.equal(action,'percentiles');
  assert.deepEqual(payload.schoolIds,[schoolId]);
  assert.equal(token,'synthetic-session');
  if(percentileMode==='offline')throw new Error('synthetic network error');
  return {values:percentileMode==='approved'?{[schoolId]:73.5}:{}};
};
const loadPublic2026=new Function('state','supabaseClient','renderTable','console','authRequest',
 comparison.slice(publicStart,publicEnd)+'\nreturn loadPublic2026;'
)(comparisonState,supabaseClient,()=>{renderCount++;},console,percentileRequest);
await loadPublic2026([schoolId]);
assert.equal(comparisonState.public2026.get(schoolId),73.5);
percentileMode='withheld';
await loadPublic2026([schoolId],true);
assert.ok(!comparisonState.public2026.has(schoolId),'A revoked public percentile must disappear');
percentileMode='approved';
await loadPublic2026([schoolId],true);
assert.equal(comparisonState.public2026.get(schoolId),73.5);
percentileMode='offline';
await loadPublic2026([schoolId],true);
assert.ok(!comparisonState.public2026.has(schoolId));
assert.ok(comparisonState.public2026Error.has(schoolId));
assert.ok(!comparisonState.public2026Checked.has(schoolId));
console.log('PASS: Synthetic school search detail -> 2026 answer -> year tab -> withdrawal -> recheck error');
console.log('PASS: Synthetic authenticated comparison -> withdrawal -> API error preserves 2025, hides 2026');
console.log('PASS: Synthetic public comparison percentile -> withdrawal/error clears stale 2026 value');
