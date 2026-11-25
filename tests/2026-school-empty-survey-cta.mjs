import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read=path=>readFileSync(path,'utf8');
const script=read('js/level-search.js');
const page=read('search-lv1.html');
const css=read('styles/beagu-search-details-v1.css');
const url='https://forms.gle/TPyCakK6Sj2zchRy7';

assert.doesNotThrow(()=>new vm.Script(script));
assert.ok(read('index.html').includes(url),'Survey URL must match the official homepage link');
assert.match(page,/js\/level-search\.js\?v=/);
assert.match(page,/styles\/beagu-search-details-v1\.css\?v=/);
assert.match(css,/beagu-year-survey-link/);
assert.match(css,/beagu-year-survey-link:focus-visible/);

const a=script.indexOf('  function renderYear(');
const b=script.indexOf('  function percentile2026(',a);
assert.ok(a>0&&b>a,'2026 renderer and approved metrics helper must be present');

class Node{
  constructor(tag,cls='',value=''){
    this.tag=tag;
    this.className=cls;
    this.textContent=String(value);
    this.children=[];
    this.events={};
    this.attrs={};
  }
  replaceChildren(...nodes){this.children=[...nodes];}
  append(...nodes){this.children.push(...nodes);}
  addEventListener(type,handler){this.events[type]=handler;}
  setAttribute(name,value){this.attrs[name]=value;}
  querySelectorAll(){return [];}
}
const make=(tag,cls,text)=>new Node(tag,cls,text??'');
const BeaguDetailGroups={
  appendGrouped(host,items,render){
    for(const m of items)render(host,m);
  }
};
const api=async()=>({rows:[]});
const browser={window:{},document:{createElement:tag=>new Node(tag)}};
vm.createContext(browser);
vm.runInContext(read('js/2026-questionnaire-options-v1.2.js'),browser);
vm.runInContext(read('js/2026-approved-question-results.js'),browser);
const draw=new Function('window','make','BeaguDetailGroups','addRow','metricValue','api','loggedOut','renderHistoricalBenchmarks',
  script.slice(a,b)+'\nreturn renderYear;')(
  browser.window,make,BeaguDetailGroups,(host,label,value)=>host.append(make('p','',label+' '+value)),
  m=>String(m.value),api,()=>{},()=>{}
);
function find(node,cls){
  return [node,...node.children.flatMap(child=>find(child,cls))]
    .filter(item=>item.className?.split(' ').includes(cls));
}
const pending=new Node('div');
draw(pending,2026,[],null,'ABC1234',[],null,null,'ready',[],[],2);
const links=find(pending,'beagu-year-survey-link');
assert.equal(links.length,1,'No public result must show exactly one survey link');
assert.equal(links[0].tag,'a');
assert.equal(links[0].href,url);
assert.equal(links[0].target,'_blank');
assert.equal(links[0].rel,'noopener noreferrer');
assert.ok(find(pending,'beagu-year-empty').length===1);
assert.ok(find(pending,'year-2026-button').length===1,'Keep the existing result refresh button');

const released=new Node('div');
draw(released,2026,[{
 year:2026,access_level:1,
 summary:{metrics:[{key:'percentile',label:'2026 배구지수',value:54,unit:'%'}]}
}],null,'ABC1234',[],null,null,'ready',[],[],2);
assert.equal(find(released,'beagu-year-survey-link').length,0,
  'Approved results must not show a survey CTA');
assert.equal(find(released,'beagu-year-empty').length,0);
assert.ok(find(released,'beagu-approved-section').length===1);
assert.equal(find(released,'year-2026-button').length,1);
console.log('PASS: Lv.2 empty 2026 school details link to the official survey, released details do not');

const questionOnly=new Node('div');
draw(questionOnly,2026,[],null,'ABC1234',[],null,null,'ready',[],[{questionId:'Q01',row:-1,values:['보통이다']}],2);
assert.equal(find(questionOnly,'beagu-year-survey-link').length,0);
assert.equal(find(questionOnly,'beagu-question-block').length,1);

const locked=new Node('div');
draw(locked,2026,[{year:2026,access_level:1,summary:{metrics:[{key:'percentile',label:'2026 배구지수',value:54,unit:'%'}]}}],null,'ABC1234',[],null,null,'ready',[],[{questionId:'Q01',row:-1,values:['보통이다']}],0);
assert.equal(find(locked,'beagu-approved-section').length,0);assert.equal(find(locked,'beagu-question-block').length,0);assert.equal(find(locked,'beagu-year-release-note').length,1);

// Lv1 can see approved ordinary choices, but neither sensitive answers nor Lv2-only metrics.
const approvedLv1=new Node('div');
draw(approvedLv1,2026,[{year:2026,access_level:1,summary:{metrics:[{key:'percentile',label:'2026 배구지수',value:54,unit:'%'}]}},{year:2026,access_level:2,summary:{metrics:[{key:'Q20',label:'LV2_ONLY_FIXTURE',value:44}]}}],null,'ABC1234',[],null,null,'ready',[],[{questionId:'Q01',row:-1,values:['보통이다']},{questionId:'Q31',row:-1,values:['PRIVATE_FIXTURE']},{questionId:'Q51',row:-1,values:['PRIVATE_FIXTURE']}],1);
assert.equal(find(approvedLv1,'beagu-question-block').length,1);
assert.ok(JSON.stringify(approvedLv1).includes('2026 배구지수'));
assert.doesNotMatch(JSON.stringify(approvedLv1),/LV2_ONLY_FIXTURE|PRIVATE_FIXTURE/);
assert.equal(find(approvedLv1,'beagu-year-survey-link').length,0);
