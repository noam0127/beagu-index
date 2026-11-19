import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';

const source=readFileSync('js/level-search.js','utf8');
const lv1=readFileSync('search-lv1.html','utf8');
const lv0=readFileSync('search.html','utf8');
const cards=readFileSync('js/school-search-card-v1.js','utf8');
const sharedChart=readFileSync('js/percentile-chart.js','utf8');

assert.doesNotThrow(()=>new Script(source),'Lv.1 script is valid JavaScript');
assert.match(lv0,/js\/percentile-chart\.js\?v=20261031-independent5b/);
assert.match(lv1,/js\/percentile-chart\.js\?v=20261031-independent5b/);
assert.match(lv1,/js\/level-search\.js\?v=/);
assert.match(source,/percentile:percentilePanel\(school\)/,
  'Lv.1 reuses the same canonical percentile renderer as Lv.0');
assert.match(cards,/percentileChart\(values,\{/,
  'Shared card renderer produces the independent yearly vertical chart');
assert.match(sharedChart,/No cross-year line/,'Never pretend different surveys are a continuous trend');
assert.doesNotMatch(source,/graphic\?\.remove\(\)/,
  'Lv.1 must not remove the newly generated graph');
assert.match(source,/historyPanel\.append\(detail\)/,
  'Existing in-card detail disclosure must remain available');

const start=source.indexOf('  function loadPagePercentiles(');
const end=source.indexOf('  function showDetails(',start);
assert.ok(start>0&&end>start,'Approved percentile refresh function must exist');
const build=new Function('serial','api','current2026','$','percentilePanel','loggedOut',
  source.slice(start,end)+'\nreturn loadPagePercentiles;');

async function exercise({existing,latest}){
  const changes={replacedGrid:null,replacedGraph:null,removedGraph:false,insertedGraph:null,
    beforeNode:null,selectedYear:null};
  const oldGraph=existing?{
    replaceWith(node){changes.replacedGraph=node;},
    remove(){changes.removedGraph=true;}
  }:null;
  const newGraph=latest?{role:'yearly-vertical-chart'}:null;
  const selectedCell={dataset:{year:'2025'}};
  const newCell={classList:{add(v){if(v==='is-current-year')changes.selectedYear='2025';}}};
  const oldGrid={
    querySelector(sel){return sel==='.percentile-cell.is-current-year'?selectedCell:null;},
    replaceWith(node){changes.replacedGrid=node;}
  };
  const newGrid={
    querySelector(sel){return sel==='.percentile-cell[data-year="2025"]'?newCell:null;}
  };
  const detail={role:'expanded-school-detail'};
  const oldPanel={
    querySelector(sel){
      if(sel==='.percentile-grid')return oldGrid;
      if(sel==='.percentile-graph')return oldGraph;
      if(sel==='.school-detail')return detail;
      return null;
    },
    insertBefore(node,before){changes.insertedGraph=node;changes.beforeNode=before;}
  };
  const card={
    dataset:{schoolId:'ABC1234'},
    querySelector(sel){return sel==='.percentile-panel'?oldPanel:null;}
  };
  const $=id=>{
    assert.equal(id,'results');
    return {querySelectorAll(sel){
      assert.equal(sel,'.school-card');
      return [card];
    }};
  };
  const current2026=new Map();
  const api=async (action,args)=>{
    assert.equal(action,'percentiles');
    assert.deepEqual(args,{schoolIds:['ABC1234']});
    return {values:{ABC1234:57.5}};
  };
  const getFreshPanel=()=>{
    assert.equal(current2026.get('ABC1234')?.value,57.5);
    return {querySelector(sel){
      if(sel==='.percentile-grid')return newGrid;
      if(sel==='.percentile-graph')return newGraph;
      return null;
    }};
  };
  const refresh=build(1,api,current2026,$,getFreshPanel,()=>assert.fail('unexpected auth error'));
  refresh([{school_id:'ABC1234'}],1);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(current2026.get('ABC1234').status,'published');
  assert.equal(changes.replacedGrid,newGrid,'approved numbers must refresh without replacing card');
  assert.equal(changes.selectedYear,'2025','selected detail year must be preserved');
  if(existing&&latest)assert.equal(changes.replacedGraph,newGraph,
    'existing vertical chart must update with approved 2026 values');
  if(!existing&&latest){
    assert.equal(changes.insertedGraph,newGraph,
      'chart must be added when 2026 is the first released percentile');
    assert.equal(changes.beforeNode,detail,'new chart must precede, not replace, expanded details');
  }
  if(existing&&!latest)assert.equal(changes.removedGraph,true,
    'stale chart must not remain visible when no values are renderable');
  assert.ok(!changes.replacedGraph||!changes.insertedGraph,
    'must not duplicate vertical graph containers');
}
await exercise({existing:true,latest:true});
await exercise({existing:false,latest:true});
await exercise({existing:true,latest:false});
console.log('PASS: Lv.1 restores Lv.0 vertical chart; updates/reveals/clears approved yearly markers without resetting expanded details.');
