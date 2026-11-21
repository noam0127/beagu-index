import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read=file=>fs.readFileSync(file,'utf8');
const source=read('js/beagu-home-tier-benefits-v1.js');
const index=read('index.html');
const css=read('styles/beagu-home-tier-benefits-v1.css');
const header=read('js/beagu-level-state-v1.js');

function harness({realHeader=false}={}){
 const listeners=new Map(),cards=new Map(),nodes={};
 const on=(type,fn)=>(listeners.get(type)||listeners.set(type,[]).get(type)).push(fn);
 const dispatch=event=>{for(const fn of listeners.get(event.type)||[])fn(event)};
 for(let n=0;n<=3;n++){
  const state={textContent:''};
  const card={dataset:{tierState:'pending'},attrs:{},
   querySelector:x=>x==='[data-home-tier-state]'?state:null,
   setAttribute(k,v){this.attrs[k]=v}};
  cards.set(n,{card,state});
 }
 const host={dataset:{},querySelector:selector=>{
  const match=selector.match(/^\[data-home-tier="([0-3])"\]$/);
  return match?cards.get(Number(match[1]))?.card:null;
 }};
 const summary={textContent:''},detail={textContent:''};
 const badge={dataset:{level:'checking',memberLevel:''},textContent:'',title:'',
  setAttribute(){},closest:()=>null};
 Object.assign(nodes,{homeTierBenefits:host,homeTierSummary:summary,homeTierDetail:detail,beaguLevelState:badge});
 const doc={hidden:false,readyState:'complete',getElementById:id=>nodes[id]||null,
  querySelector:()=>null,addEventListener:on};
 const win={addEventListener:on,dispatchEvent:dispatch};win.self=win;win.top=win;
 const CustomEvent=class{constructor(type,{detail}){this.type=type;this.detail=detail}};
 const context={window:win,document:doc,CustomEvent};
 vm.runInNewContext(source,context,{filename:'beagu-home-tier-benefits-v1.js',timeout:1000});
 let token='f'.repeat(64),server={level:0},requests=0;
 if(realHeader){
  const headContext={...context,sessionStorage:{
   getItem:()=>token,removeItem(){token=''}
  },fetch:async()=>{requests++;return {ok:true,status:200,json:async()=>({...server})}}};
  vm.runInNewContext(header,headContext,{filename:'beagu-level-state-v1.js',timeout:1000});
 }
 const trigger=(type,detail={})=>dispatch({type,detail});
 const flush=async()=>{for(let n=0;n<6;n++)await new Promise(r=>setImmediate(r))};
 return {host,summary,detail,badge,cards,trigger,flush,dispatch,
  server(value){server=value},setToken(value){token=value},
  get requests(){return requests},
  labels:()=>[0,1,2,3].map(n=>cards.get(n).state.textContent),
  states:()=>[0,1,2,3].map(n=>cards.get(n).card.dataset.tierState),
  currents:()=>[0,1,2,3].map(n=>cards.get(n).card.attrs['aria-current'])
 };
}

test('Stage31: level description is a separate, accessible home section; existing counters/games remain untouched',()=>{
 assert.ok(index.includes('id="homeTierBenefits"'));
 assert.ok(index.includes('id="homeTierSummary"'));
 assert.ok(index.includes('id="homeTierDetail"'));
 assert.ok(index.indexOf('id="homeTierBenefits"')>index.indexOf('data-beagu-xp'));
 assert.ok(index.indexOf('id="homeTierBenefits"')<index.indexOf('id="teacher-game-frame"'));
 assert.ok(index.indexOf('id="homeTierBenefits"')<index.indexOf('id="teacher-run-feature"'));
 for(let n=0;n<=3;n++)assert.match(index,new RegExp('data-home-tier="'+n+'"'));
 assert.match(index,/styles\/beagu-home-tier-benefits-v1\.css/);
 assert.match(index,/js\/beagu-home-tier-benefits-v1\.js/);
 for(const id of ['teacher-game-frame','teacher-run-home-lock','teacher-run-home-content','homeDiaryGuestForm','home-notice-title'])
  assert.ok(index.includes('id="'+id+'"'));
 assert.match(index,/href="https:\/\/forms\.gle\/TPyCakK6Sj2zchRy7"/);
 assert.match(css,/@media\(max-width:700px\)/);
 assert.match(css,/data-tier-state="current"/);
 assert.match(index,/2026 승인 자료는 24시간 뒤/);
 assert.match(index,/2026 승인 자료는 6시간 뒤/);
 assert.match(index,/공개 심사 후 즉시 확인/);
 assert.doesNotMatch(source,/fetch\(|localStorage|sessionStorage|setItem\(|createClient|supabaseClient/);
 assert.doesNotMatch(index,/data-home-tier-token|data-home-secret|data-home-school-data/);
});

test('Stage31: checking and unavailable server state never assume membership benefits',()=>{
 const h=harness();
 assert.equal(h.host.dataset.currentTier,'unknown');
 assert.equal(h.host.dataset.verification,'checking');
 assert.deepEqual(h.labels(),['확인 중','확인 중','확인 중','확인 중']);
 assert.deepEqual(h.states(),['pending','pending','pending','pending']);
 h.badge.dataset.level='error';
 h.trigger('beagu:level-state-updated',{level:null,status:'error'});
 assert.equal(h.host.dataset.currentTier,'unknown');
 assert.equal(h.host.dataset.verification,'error');
 assert.deepEqual(h.labels(),['확인 불가','확인 불가','확인 불가','확인 불가']);
 assert.match(h.detail.textContent,/권한을 추정하지/);
 h.badge.dataset.level='checking';
 h.badge.dataset.memberLevel='3';
 h.trigger('beagu:lv3-display-updated',{verified:true});
 assert.equal(h.host.dataset.currentTier,'unknown');
});

test('Stage31: Lv0, Lv1, Lv2 status affects only guide text and labels',()=>{
 const h=harness();
 for(const n of [0,1,2]){
  h.badge.dataset.level=String(n);
  h.badge.dataset.memberLevel='';
  h.trigger('beagu:level-state-updated',{level:n,status:String(n)});
  assert.equal(h.host.dataset.currentTier,String(n));
  assert.equal(h.host.dataset.verification,'verified');
  assert.deepEqual(h.states(),[0,1,2,3].map(t=>t===n?'current':t<n?'available':'locked'));
  assert.deepEqual(h.currents(),[0,1,2,3].map(t=>t===n?'step':'false'));
  assert.match(h.summary.textContent,new RegExp('Lv\\.'+n));
 }
 assert.match(h.detail.textContent,/정식 계정 인증/);
 assert.deepEqual(h.labels(),['이용 가능','이용 가능','현재 단계','추가 인증 필요']);
});

test('Stage31: Lv3 only when separate server-verified memberLevel=3 coincides with Lv2 participation',()=>{
 const h=harness();
 h.badge.dataset.level='2';h.trigger('beagu:level-state-updated',{level:2});
 h.trigger('beagu:lv3-display-updated',{verified:true});
 assert.equal(h.host.dataset.currentTier,'2','a forged cosmetic event alone cannot show Lv3');
 h.badge.dataset.memberLevel='3';
 h.trigger('beagu:lv3-display-updated',{verified:true});
 assert.equal(h.host.dataset.currentTier,'3');
 assert.deepEqual(h.states(),['available','available','available','current']);
 assert.match(h.detail.textContent,/서버 권한/);
 h.badge.dataset.memberLevel='';
 h.trigger('beagu:lv3-display-updated',{verified:false});
 assert.equal(h.host.dataset.currentTier,'2');
 h.badge.dataset.level='1';h.badge.dataset.memberLevel='3';
 h.trigger('beagu:lv3-display-updated',{verified:true});
 assert.equal(h.host.dataset.currentTier,'1','Lv1 never qualifies as Lv3');
});

test('Stage31: logout and bfcache immediately clear previously attained labels',()=>{
 const h=harness();
 h.badge.dataset.level='2';h.badge.dataset.memberLevel='3';h.trigger('beagu:lv3-display-updated',{verified:true});
 assert.equal(h.host.dataset.currentTier,'3');
 h.trigger('beagu:participation-logged-out');
 assert.equal(h.host.dataset.currentTier,'unknown');
 assert.deepEqual(h.states(),['pending','pending','pending','pending']);
 h.badge.dataset.level='2';h.trigger('beagu:level-state-updated',{level:2});
 h.trigger('beagu:challenge-access-revoked');
 assert.equal(h.host.dataset.currentTier,'unknown');
 h.trigger('beagu:level-state-updated',{level:2});
 h.dispatch({type:'pageshow',persisted:true});
 assert.equal(h.host.dataset.currentTier,'unknown');
});

test('Stage31: integrated shared level API verification drives home tier changes',async()=>{
 const h=harness({realHeader:true});
 await h.flush();
 assert.equal(h.host.dataset.currentTier,'0');
 assert.equal(h.requests,1);
 h.server({level:1});
 h.trigger('beagu:level-state-change');await h.flush();
 assert.equal(h.host.dataset.currentTier,'1');
 h.server({level:2,provisional:false});
 h.trigger('beagu:level-state-change');await h.flush();
 assert.equal(h.host.dataset.currentTier,'2');
 h.trigger('beagu:lv3-session-verification',{verified:true});
 assert.equal(h.host.dataset.currentTier,'3');
 h.trigger('beagu:lv3-session-verification',{verified:false});
 assert.equal(h.host.dataset.currentTier,'2');
 h.server({level:1});
 h.trigger('beagu:level-state-change');await h.flush();
 assert.equal(h.host.dataset.currentTier,'1');
 h.setToken('');
 h.trigger('beagu:level-state-change');await h.flush();
 assert.equal(h.host.dataset.currentTier,'0');
 assert.deepEqual(h.states(),['current','locked','locked','locked']);
});
