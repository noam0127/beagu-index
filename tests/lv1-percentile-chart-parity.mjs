import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script,runInNewContext} from 'node:vm';
const read=p=>readFileSync(p,'utf8');
const source=read('js/level-search.js');
const lv1=read('search-lv1.html');
const lv0=read('search.html');
const cards=read('js/school-search-card-v1.js');
const sharedChart=read('js/percentile-chart.js');

assert.doesNotThrow(()=>new Script(source));
assert.match(lv0,/js\/percentile-chart\.js\?v=20261031-independent5b/);
assert.match(lv1,/js\/percentile-chart\.js\?v=20261031-independent5b/);
assert.match(lv1,/js\/level-search\.js\?v=/);
assert.match(source,/percentile:percentilePanel\(school\)/);
assert.match(sharedChart,/No cross-year line/);
assert.match(source,/host\.replaceChildren\(facilities,yearlyPercentileHistory\(school,viewerTier\)\)/);
assert.match(source,/common2026:null/,'Representative mean must not change on 2026 release');
assert.doesNotMatch(cards,/percentileChart\(/,'Yearly chart lives in expanded detail, not the basic card');

class Node {
 constructor(tag){this.tag=tag;this.children=[];this.dataset={};this.style={};this.attrs={};this.className='';this.textContent='';this.classList={add(){}};}
 append(...nodes){this.children.push(...nodes);}
 setAttribute(k,v){this.attrs[k]=String(v);}
}
const document={createElement:tag=>new Node(tag)};
const window={};
runInNewContext(cards,{window,document});
const cardRenderer=window.BeaguSchoolSearchCard;
const flatten=node=>[node,...node.children.flatMap(flatten)];
const panel=tier=>cardRenderer.percentiles({publicValues:[10,20,30],value2026:57.5,common2026:null,viewerTier:tier});
const score=node=>flatten(node).find(n=>n.className==='glory-score').textContent;
assert.equal(score(panel(0)),'30.0%');
assert.equal(score(panel(1)),'20.0%');
assert.equal(score(panel(2)),'20.0%');
assert.equal(flatten(panel(1)).filter(n=>n.className==='glory-year-row').length,0);
const rows=flatten(panel(2)).filter(n=>n.className==='glory-year-row');
assert.equal(rows.length,4);
assert.equal(rows.map(n=>n.dataset.year).join(','),'2026,2025,2024,2023');
assert.equal(rows[0].children.at(-1).textContent,'57.5%');
const missing=cardRenderer.percentiles({publicValues:[10,20,30],status2026:'unpublished',viewerTier:2});
assert.equal(flatten(missing).find(n=>n.className==='glory-year-row').children.at(-1).textContent,'미공개');

const start=source.indexOf('  function loadPagePercentiles(');
const mid=source.indexOf('  function yearlyPercentileHistory(',start);
const end=source.indexOf('  function showDetails(',mid);
assert.ok(start>0&&mid>start&&end>mid);
const current2026=new Map();
const school={school_id:'ABC1234'};
const chartCalls=[];
const historyBuilder=new Function('make','asPublicPercentiles','current2026','YEARS','percentileChart',
 source.slice(mid,end)+'\nreturn yearlyPercentileHistory;');
const history=historyBuilder((tag,cls,text)=>Object.assign(new Node(tag),{className:cls||'',textContent:text||''}),()=>[10,20,30],current2026,[2023,2024,2025,2026],
 (values,opts)=>{chartCalls.push({values:[...values],blank:opts.blank2026});return '<svg></svg>';});
let mode='published',requestId=1;
let panelUpdates=0,historyUpdates=0,footerUpdates=0,officialUpdates=0;
let latestHistory=null;
const detail={role:'expanded-detail'};
const card={dataset:{schoolId:school.school_id},querySelector(sel){
 if(sel==='.percentile-panel')return {replaceWith(){panelUpdates++;}};
 if(sel==='.beagu-yearly-percentiles')return {replaceWith(node){historyUpdates++;latestHistory=node;}};
 if(sel==='.school-detail')return detail;
 return null;
}};
const api=async(action,args)=>{
 assert.equal(action,'percentiles');
 assert.deepEqual(args,{schoolIds:['ABC1234']});
 if(mode==='error')throw Error('synthetic offline');
 return {values:mode==='published'?{ABC1234:57.5}:{}};
};
const build=new Function('serial','api','current2026','$','percentilePanel','loggedOut','viewerTier','BeaguSchoolSearchCard','yearlyPercentileHistory','renderOfficial2026',
 source.slice(start,mid)+'\nreturn loadPagePercentiles;');
const refresh=build(1,api,current2026,()=>({querySelectorAll:()=>[card]}),()=>panel(1),()=>assert.fail('unexpected auth reset'),1,
 {updateRecordedYears(c){assert.equal(c,card);footerUpdates++;}},history,()=>{officialUpdates++;});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
for(const status of ['published','unpublished','error']){
 mode=status;
 refresh([school],requestId);
 await tick();
 assert.equal(current2026.get(school.school_id).status,status);
 assert.equal(chartCalls.at(-1).values[3],status==='published'?57.5:null);
 assert.equal(chartCalls.at(-1).blank,status!=='published');
 assert.equal(latestHistory.className,'beagu-yearly-percentiles');
 assert.equal(card.querySelector('.school-detail'),detail,'Expanded detail is preserved');
}
assert.equal(panelUpdates,3);assert.equal(historyUpdates,3);assert.equal(footerUpdates,3);assert.equal(officialUpdates,3);
refresh([school],2);await tick();assert.equal(panelUpdates,3,'Obsolete requests cannot repaint');
console.log('PASS: tier-specific basic cards, detail-only independent yearly chart, signed refresh, withdrawal and error clearing without replacing expanded detail.');
