import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';

const text=path=>fs.readFileSync(path,'utf8');
const statusSource=text('js/beagu-account-status-v1.js');
const restoreSource=text('js/beagu-session-restore-v1.js');
const modeSource=text('js/beagu-account-mode-v1.js');
const postitSource=text('js/postit-account-v1.js');
const challengeSource=text('js/challenge-member-auth-v1.js');
const tick=async()=>{for(let i=0;i<7;i++)await new Promise(r=>setImmediate(r));};

function statusHarness(){
 const window={};
 vm.runInNewContext(statusSource,{window},{timeout:1200});
 return window.BeaguAccountStatus;
}
function getElement(id) {
 const handlers=new Map();
 return {id,value:'',textContent:'',hidden:false,disabled:false,checked:false,
  dataset:{level:id==='beaguLevelState'?'2':undefined},
  addEventListener(name,fn){handlers.set(name,fn)},
  handler(name){return handlers.get(name)},
  focus(){},style:{},getClientRects(){return [1]},isConnected:true};
}
function postitHarness({user=null,level=true,linked=false}={}) {
 const elements=new Map();
 const get=id=>{
  if(!elements.has(id))elements.set(id,getElement(id));
  return elements.get(id);
 };
 const status=get('postitAccountStatus');
 const calls={writerStatus:0,link:0,events:[]};
 const principal=user===undefined?null:user;
 const auth={
  async getSession(){return {data:{session:principal?{access_token:'fake-auth-token'}:null},error:null}},
  async getUser(){return {data:{user:principal},error:null}},
  onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}}}
 };
 const window={
  addEventListener(){},
  dispatchEvent(event){calls.events.push({type:event.type,detail:event.detail})},
  BEAGU_AUTH_RETURN:{resolve:page=>'https://baeguindex.com/'+page+'.html'}
 };
 const browser={
  window,document:{getElementById:get},supabaseClient:{auth},
  sessionStorage:{getItem(){return level?'a'.repeat(64):null}},
  localStorage:{getItem(){return 'b'.repeat(64)}},
  CustomEvent:class{constructor(type,init){this.type=type;this.detail=init?.detail;}},
  URL,URLSearchParams,queueMicrotask,
  async fetch(url,options){
   const address=String(url);
   if(address.includes('/beagu-level-api')){
    return {ok:true,async json(){return {level:2}}};
   }
   if(address.includes('writer_status')){
    calls.writerStatus++;
    return {ok:true,async json(){return {linked}}};
   }
   calls.link++;
   return {ok:false,async json(){return {error:'DENIED'}}};
  }
 };
 vm.runInNewContext(modeSource,browser,{timeout:1500});
 vm.runInNewContext(statusSource,browser,{timeout:1500});
 vm.runInNewContext(restoreSource,browser,{timeout:1500});
 vm.runInNewContext(text('js/beagu-auth-errors-v1.js'),browser,{timeout:1500});
 vm.runInNewContext(text('js/beagu-sms-consent-v1.js'),browser,{timeout:1500});
 vm.runInNewContext(text('js/beagu-sms-account-settings-v2.js'),browser,{timeout:1500});
 vm.runInNewContext(text('js/beagu-account-privacy-v1.js'),browser,{timeout:1500});
 vm.runInNewContext(postitSource,browser,{timeout:2000});
 return {get,status,calls,window};
}
const verified={
 id:'test-user',email_confirmed_at:'2026-11-21T12:00:00Z',
 is_anonymous:false,user_metadata:{beagu_sms_opt_in:false}
};
const unverified={...verified,email_confirmed_at:null};

test('status messages are complete, accessible and never authorize Lv3',()=>{
 const api=statusHarness();
 for(const state of ['signin-required','signup-ready','signup-requested','checking','email-pending',
   'level-required','login-verified','link-ready','device-required','linked',
   'signed-out','signup-failed','signin-failed','error']){
  const node={dataset:{},textContent:''};
  assert.equal(api.set(node,state),state);
  assert.equal(node.dataset.state,state);
  assert.ok(node.textContent.length>15,state);
  assert.doesNotMatch(node.textContent,/Lv3 (완료|승급 완료|인증 완료|확정)/);
 }
});
test('unknown state names are rejected to a generic error, never inserted into HTML',()=>{
 const api=statusHarness();
 const node={dataset:{},textContent:'',innerHTML:'safe'};
 assert.equal(api.set(node,'<img onerror=steal()>'),'error');
 assert.equal(node.innerHTML,'safe');
 assert.doesNotMatch(node.textContent,/<img/);
 assert.throws(()=>api.set(null,'linked'),/ACCOUNT_STATUS_MISSING/);
});
test('signup request explicitly says that email confirmation and Lv3 are not automatic',()=>{
 const api=statusHarness();
 const node={dataset:{},textContent:''};
 api.set(node,'signup-requested');
 assert.match(node.textContent,/이메일 인증/);
 assert.match(node.textContent,/Lv3/);
 assert.doesNotMatch(node.textContent,/인증 완료/);
});
test('unverified Post-it Auth user cannot call writer_status or show linked rights',async()=>{
 const h=postitHarness({user:unverified,linked:true});
 await tick();
 assert.equal(h.calls.writerStatus,0);
 assert.equal(h.status.dataset.state,'email-pending');
 assert.equal(h.get('postitAccountLink').hidden,true);
 assert.equal(h.window.BeaguPostitAccount.canWrite(),false);
 assert.equal(h.get('postitAccountForm').hidden,true);
});
test('signed-out Post-it viewer cannot claim account linkage',async()=>{
 const h=postitHarness({user:null});
 await tick();
 assert.equal(h.status.dataset.state,'signin-required');
 assert.equal(h.calls.writerStatus,0);
 assert.equal(h.window.BeaguPostitAccount.canWrite(),false);
});
test('verified email with missing Lv2 code cannot be treated as linked',async()=>{
 const h=postitHarness({user:verified,level:false,linked:true});
 await tick();
 assert.equal(h.status.dataset.state,'level-required');
 assert.equal(h.calls.writerStatus,0);
 assert.equal(h.window.BeaguPostitAccount.canWrite(),false);
});
test('verified email and Lv2 code still require a server writer-status response',async()=>{
 const h=postitHarness({user:verified,linked:false});
 await tick();
 assert.equal(h.calls.writerStatus,1);
 assert.equal(h.status.dataset.state,'link-ready');
 assert.equal(h.window.BeaguPostitAccount.canWrite(),false);
 assert.equal(h.get('postitAccountLink').hidden,false);
});
test('only confirmed Auth plus valid Lv2 plus server-linked member displays linked',async()=>{
 const h=postitHarness({user:verified,linked:true});
 await tick();
 assert.equal(h.calls.writerStatus,1);
 assert.equal(h.status.dataset.state,'linked');
 assert.match(h.status.textContent,/서버/);
 assert.match(h.status.textContent,/Lv3/);
 assert.equal(h.window.BeaguPostitAccount.canWrite(),true);
 assert.equal(h.get('postitAccountLink').hidden,true);
});
test('shared status helper loads before both account scripts, with accessible live feedback',()=>{
 for(const [page,client] of [
  ['challenge.html','js/challenge-member-auth-v1.js'],
  ['postit.html','js/postit-account-v1.js']
 ]){
  const html=text(page);
  const helper=html.indexOf('js/beagu-account-status-v1.js');
  const script=html.indexOf(client);
  assert.ok(helper>0&&script>helper,page);
  assert.match(html,/aria-live="polite" aria-atomic="true" data-state=/);
  assert.match(html,/styles\/beagu-account-status-v1\.css/);
  assert.match(html,/진행 순서: 회원가입 요청/);
  assert.match(html,/Lv3는 별도 서버 검증/);
 }
});
test('Challenge session handler surfaces unverified email before linked state',()=>{
 assert.match(challengeSource,/sessionIdentity\(\)/);
 assert.match(challengeSource,/!person\.user\.email_confirmed_at/);
 assert.match(challengeSource,/setAccountState\('email-pending'\)/);
 assert.match(challengeSource,/setAccountState\('signup-requested'\)/);
 assert.match(challengeSource,/linkedStatus\(person\.token\)/);
 assert.match(challengeSource,/setAccountState\('linked'\)/);
 assert.ok(challengeSource.indexOf("setAccountState('email-pending')") <
           challengeSource.indexOf('linkedStatus(person.token)'));
});
test('Post-it checks email verification before calling server writer status',()=>{
 assert.match(postitSource,/!identity\?\.emailVerified\|\|!validatedLevel\(\)/);
 assert.match(postitSource,/const verifiedLevel=await restored\.level\(\)/);
 assert.match(postitSource,/showState\('email-pending'\)/);
 assert.match(postitSource,/showState\('signup-requested'\)/);
 assert.match(postitSource,/showState\('linked'\)/);
 assert.match(postitSource,/showState\('level-required'\)/);
 assert.match(postitSource,/setLinked\(false\);\s*const identity=await restored\.identity\(\)/);
 assert.match(postitSource,/if\(!verifiedLevel\)\{render\(user,false\);return\}/);
});
