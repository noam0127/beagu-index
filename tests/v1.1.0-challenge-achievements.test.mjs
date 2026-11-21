import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const ui=fs.readFileSync('js/challenge-achievements-v1.js','utf8');
const levelState=fs.readFileSync('js/beagu-level-state-v1.js','utf8');
const markup=fs.readFileSync('challenge.html','utf8');
const css=fs.readFileSync('styles/challenge-achievements-v1.css','utf8');

function harness({wireHeader=false}={}){
 const listeners=new Map(),attrs={},items=new Map(),nodes={};
 const on=(type,fn)=>(listeners.get(type)||listeners.set(type,[]).get(type)).push(fn);
 const dispatch=event=>{for(const fn of listeners.get(event.type)||[])fn(event)};
 const ev=(type,detail={})=>({type,detail});
 const status=(tier)=>({
  textContent:'확인 중',attrs:{},
  setAttribute(name,value){this.attrs[name]=value}
 });
 for(const tier of [1,2,3]){
  const state=status(tier);
  const item={
   dataset:{achieved:'false'},
   querySelector(sel){return sel==='[data-achievement-status]'?state:null}
  };
  items.set(tier,{item,state});
 }
 const summary={textContent:'',attributes:{}};
 const host={
  dataset:{},querySelector(sel){
   const match=sel.match(/^\[data-challenge-achievement="([123])"\]$/);
   return match?items.get(Number(match[1]))?.item:null;
  }
 };
 const badge={
  dataset:{level:'checking',memberLevel:''},
  textContent:'확인 중',
  closest(){return null},
  setAttribute(k,v){attrs[k]=v},
  title:''
 };
 nodes.challengeLevelAchievements=host;
 nodes.challengeAchievementsSummary=summary;
 nodes.beaguLevelState=badge;
 const doc={
  hidden:false,readyState:'loading',
  getElementById:id=>nodes[id]||null,
  querySelector:()=>null,
  addEventListener:on
 };
 const win={addEventListener:on,dispatchEvent:dispatch};
 win.self=win;win.top=win;
 const context={window:win,document:doc,
  CustomEvent:class{constructor(type,{detail}){this.type=type;this.detail=detail}}};
 let stored='f'.repeat(64),server={level:0,provisional:false};
 let fetches=0;
 const headerContext={...context,
  sessionStorage:{getItem:()=>stored,removeItem(){stored=''}},
  fetch:async()=>{fetches++;return {ok:true,status:200,json:async()=>({...server})}}
 };
 // Stage29 UI receives updates only from the shared server-verified header.
 vm.runInNewContext(ui,context,{timeout:1000,filename:'challenge-achievements-v1.js'});
 if(wireHeader)vm.runInNewContext(levelState,headerContext,{timeout:1000});
 const flush=()=>new Promise(r=>setImmediate(r));
 const states=()=>[1,2,3].map(tier=>({
  label:items.get(tier).state.textContent,
  achieved:items.get(tier).item.dataset.achieved,
  aria:items.get(tier).state.attrs['aria-label']
 }));
 return {host,badge,summary,items,doc,win,dispatch,ev,states,flush,
  trigger(type,detail){dispatch(ev(type,detail))},
  server(value){server=value},get fetches(){return fetches},
  signOut(){stored='';dispatch(ev('beagu:challenge-access-revoked'))}
 };
}
const expectAchieved=(h,flags)=>{
 assert.deepEqual(h.states().map(x=>x.achieved),flags.map(x=>x?'true':'false'));
 for(let i=0;i<3;i++)
  assert.equal(h.states()[i].label,flags[i]?'달성':'미달성',String(i+1));
};

test('29: page displays all three stages above participation-code form and outside certificate PNG',()=>{
 assert.match(markup,/id="challengeLevelAchievements"/);
 assert.match(markup,/id="challengeAchievementsTitle"/);
 assert.match(markup,/id="challengeAchievementsSummary"/);
 for(const tier of [1,2,3])
  assert.match(markup,new RegExp('data-challenge-achievement="'+tier+'"'));
 assert.ok(markup.indexOf('id="challengeLevelAchievements"')<
   markup.indexOf('id="challengeAccessPanel"'));
 assert.ok(markup.indexOf('id="challengeLevelAchievements"')<
   markup.indexOf('id="certificate"'));
 assert.ok(markup.indexOf('id="challengeLevelAchievements"')<
   markup.indexOf('id="challengeProtected"'));
 assert.match(markup,/styles\/challenge-achievements-v1\.css/);
 assert.match(markup,/js\/challenge-achievements-v1\.js/);
 assert.match(markup,/data-achievement-status/);
 assert.match(css,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
 assert.match(css,/@media\(max-width:540px\)/);
 assert.match(css,/prefers-reduced-motion|transition/).doesNotThrow;
 assert.doesNotMatch(ui,/localStorage\.setItem|sessionStorage\.setItem|fetch\s*\(|Lv3_TOKEN|supabase\.auth/);
});

test('29: initially checking and server errors never display earned badges',()=>{
 const h=harness();
 assert.equal(h.host.dataset.verifiedTier,'unknown');
 assert.equal(h.host.dataset.status,'checking');
 assert.deepEqual(h.states().map(x=>x.label),['확인 중','확인 중','확인 중']);
 h.badge.dataset.level='error';
 h.trigger('beagu:level-state-updated',{level:null,status:'error'});
 assert.equal(h.host.dataset.status,'error');
 assert.deepEqual(h.states().map(x=>x.label),['확인 불가','확인 불가','확인 불가']);
 h.badge.dataset.level='checking';
 h.badge.dataset.memberLevel='3';
 h.trigger('beagu:lv3-display-updated',{verified:true});
 assert.equal(h.host.dataset.verifiedTier,'unknown');
 assert.deepEqual(h.states().map(x=>x.label),['확인 중','확인 중','확인 중']);
});

test('29: server-bound Lv0, verified Lv1 and Lv2 display exactly the attained stages',()=>{
 const h=harness();
 h.badge.dataset.level='0';h.trigger('beagu:level-state-updated',{level:0});
 expectAchieved(h,[false,false,false]);
 assert.match(h.summary.textContent,/참여코드/);
 h.badge.dataset.level='1';h.trigger('beagu:level-state-updated',{level:1});
 expectAchieved(h,[true,false,false]);
 assert.match(h.states()[0].aria,/Lv\.1 달성/);
 assert.equal(h.host.dataset.verifiedTier,'1');
 h.badge.dataset.level='2';h.trigger('beagu:level-state-updated',{level:2});
 expectAchieved(h,[true,true,false]);
 assert.equal(h.host.dataset.verifiedTier,'2');
 assert.match(h.summary.textContent,/Lv\.2/);
});

test('29: Lv3 cannot be achieved from a typed code, Lv2 verification or a cosmetic event alone',()=>{
 const h=harness();
 h.badge.dataset.level='2';
 h.trigger('beagu:level-state-updated',{level:2});
 h.trigger('beagu:lv3-display-updated',{verified:true});
 expectAchieved(h,[true,true,false]);
 h.badge.dataset.memberLevel='3';
 h.trigger('beagu:lv3-display-updated',{verified:true});
 expectAchieved(h,[true,true,true]);
 assert.equal(h.host.dataset.verifiedTier,'3');
 h.badge.dataset.memberLevel='';
 h.trigger('beagu:lv3-display-updated',{verified:false});
 expectAchieved(h,[true,true,false]);
 h.badge.dataset.level='1';
 h.badge.dataset.memberLevel='3';
 h.trigger('beagu:lv3-display-updated',{verified:true});
 expectAchieved(h,[true,false,false]);
});

test('29: sign-out, expired code and bfcache navigation cannot retain stale achievements',()=>{
 const h=harness();
 h.badge.dataset.level='2';h.badge.dataset.memberLevel='3';
 h.trigger('beagu:level-state-updated',{level:2});
 expectAchieved(h,[true,true,true]);
 h.trigger('beagu:challenge-access-revoked');
 assert.deepEqual(h.states().map(x=>x.label),['확인 중','확인 중','확인 중']);
 assert.equal(h.host.dataset.verifiedTier,'unknown');
 h.badge.dataset.level='0';h.badge.dataset.memberLevel='';
 h.trigger('beagu:level-state-updated',{level:0});
 expectAchieved(h,[false,false,false]);
 h.badge.dataset.level='2';h.badge.dataset.memberLevel='3';
 h.trigger('beagu:level-state-updated',{level:2});
 h.trigger('pageshow',{persisted:true});
 assert.equal(h.host.dataset.verifiedTier,'unknown');
});

test('29: integration reads actual server-verified level state + independently server verified Lv3 cosmetic badge',async()=>{
 const h=harness({wireHeader:true});
 await h.flush();
 expectAchieved(h,[false,false,false]);
 assert.equal(h.fetches,1);
 h.server({level:1,provisional:false});
 h.trigger('beagu:level-state-change');await h.flush();
 expectAchieved(h,[true,false,false]);
 h.server({level:2,provisional:false});
 h.trigger('beagu:level-state-change');await h.flush();
 expectAchieved(h,[true,true,false]);
 h.trigger('beagu:lv3-session-verification',{verified:true});
 expectAchieved(h,[true,true,true]);
 assert.equal(h.badge.dataset.memberLevel,'3');
 h.trigger('beagu:lv3-session-verification',{verified:false});
 expectAchieved(h,[true,true,false]);
 h.server({level:1,provisional:false});
 h.trigger('beagu:level-state-change');await h.flush();
 expectAchieved(h,[true,false,false]);
 h.signOut();await h.flush();
 expectAchieved(h,[false,false,false]);
 assert.equal(h.badge.dataset.level,'0');
 assert.equal(h.badge.dataset.memberLevel,'');
});
