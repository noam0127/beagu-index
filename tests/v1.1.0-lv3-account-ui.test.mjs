import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const load=file=>fs.readFileSync(file,'utf8');
const lv3Source=load('js/beagu-lv3-account-ui-v1.js');
const levelState=load('js/beagu-level-state-v1.js');
const guide=load('js/beagu-level-guide-v1.js');

class Element {
 constructor(){this.hidden=false;this.disabled=false;this.textContent='';this.dataset={};this.title='';this.attributes={};this.listeners=new Map();}
 addEventListener(name,fn){this.listeners.set(name,fn)}
 setAttribute(k,v){this.attributes[k]=v}
 async click(){await this.listeners.get('click')?.();await flush()}
}
const flush=async()=>{for(let i=0;i<6;i++)await new Promise(r=>setImmediate(r))};
function harness({issuing=true,verifying=true}={}){
 const listeners=new Map(),events=[],actions=[];
 const window={
  addEventListener(t,cb){(listeners.get(t)||listeners.set(t,[]).get(t)).push(cb)},
  dispatchEvent(e){events.push(e);for(const cb of listeners.get(e.type)||[])cb(e)},
  BeaguLv3Session:{create(){
   let verified=false;
   return {
    async issue(){actions.push('issue');verified=issuing&&verifying;return verified},
    async verify(){actions.push('verify');verified=verifying&&verified;return verified},
    reset(){actions.push('reset');verified=false},
    getState(){return {verified,level:verified?3:null}}
   }
  }}
 };
 const document={
  hidden:false,
  addEventListener(t,cb){(listeners.get(t)||listeners.set(t,[]).get(t)).push(cb)}
 };
 const CustomEvent=class{constructor(type,{detail}){this.type=type;this.detail=detail}};
 const panel=new Element(),button=new Element(),status=new Element();
 vm.runInNewContext(lv3Source,{window,document,CustomEvent},{timeout:1000});
 let handler;
 const client={auth:{onAuthStateChange(fn){handler=fn}}};
 const api=window.BeaguLv3AccountUI.create({client,panel,button,status,
  levelToken:()=> 'a'.repeat(64)});
 return {panel,button,status,actions,events,api,
  authEvent:e=>handler?.(e),
  focus:()=>window.dispatchEvent(new CustomEvent('focus',{detail:{}})),
  setVerify:x=>verifying=x,
  setIssue:x=>issuing=x
 };
}
test('new Lv3 panel defaults hidden and never mints a server credential merely by loading',()=>{
 const h=harness();
 assert.equal(h.panel.hidden,true);
 assert.equal(h.api.getState().verified,false);
 assert.equal(h.actions.filter(x=>x==='issue').length,0);
 assert.equal(h.events.length,0);
});
test('unverified user or unlinked Lv2 account cannot click to grant Lv3',async()=>{
 const h=harness();
 assert.equal(await h.api.attempt(),false);
 h.api.setEligible(false);
 assert.equal(await h.api.attempt(),false);
 assert.equal(h.actions.filter(x=>x==='issue').length,0);
});
test('verified independent Lv2/Auth linkage unlocks a REQUEST button, not Lv3 data',()=>{
 const h=harness();
 h.api.setEligible(true);
 assert.equal(h.panel.hidden,false);
 assert.equal(h.api.getState().verified,false);
 assert.match(h.status.textContent,/운영 승인 이후 서버/);
 assert.equal(h.events.filter(e=>e.type==='beagu:lv3-session-verification').length,0);
});
test('stage19 global Lv3 release switch disabled means fail-closed Lv2 display',async()=>{
 const h=harness({issuing:false});
 h.api.setEligible(true);
 assert.equal(await h.api.attempt(),false);
 assert.equal(h.api.getState().verified,false);
 assert.equal(h.panel.dataset.lv3Verified,'false');
 assert.match(h.status.textContent,/현재 Lv2 권한은 별도로 유지/);
 assert.ok(!h.events.some(e=>e.detail.verified===true));
});
test('server-confirmed issuance AND verification can present a temporary Lv3 state',async()=>{
 const h=harness();h.api.setEligible(true);
 assert.equal(await h.api.attempt(),true);
 assert.equal(h.api.getState().verified,true);
 assert.equal(h.panel.dataset.lv3Verified,'true');
 assert.match(h.status.textContent,/자료별 서버 검증/);
 assert.equal(h.events.at(-1).detail.verified,true);
});
test('revalidation denial downgrades Lv3 display and cannot keep a stale badge',async()=>{
 const h=harness();h.api.setEligible(true);
 assert.equal(await h.api.attempt(),true);
 h.setVerify(false);
 assert.equal(await h.api.revalidate(),false);
 assert.equal(h.api.getState().verified,false);
 assert.equal(h.panel.dataset.lv3Verified,'false');
 assert.equal(h.events.at(-1).detail.verified,false);
 assert.match(h.status.textContent,/표시는 해제/);
});
test('revoked Lv2 link or signed-out account clears Lv3 immediately',async()=>{
 const h=harness();h.api.setEligible(true);
 assert.equal(await h.api.attempt(),true);
 h.api.setEligible(false);
 assert.equal(h.panel.hidden,true);
 assert.equal(h.api.getState().verified,false);
 assert.equal(h.events.at(-1).detail.verified,false);
 h.api.setEligible(true);
 assert.equal(await h.api.attempt(),true);
 h.authEvent('SIGNED_OUT');
 assert.equal(h.panel.hidden,true);
 assert.equal(h.api.getState().verified,false);
 assert.equal(h.events.at(-1).detail.verified,false);
});
test('Auth JWT refresh invalidates previous Lv3 verification, requiring fresh server validation',async()=>{
 const h=harness();h.api.setEligible(true);
 assert.equal(await h.api.attempt(),true);
 h.authEvent('TOKEN_REFRESHED');
 assert.equal(h.api.getState().verified,false);
 assert.equal(h.panel.hidden,true);
});
test('unchanged cosmetic state is not redispatched, avoiding account/badge feedback loops',()=>{
 const h=harness();
 h.api.setEligible(false);
 h.api.setEligible(false);
 assert.equal(h.events.length,0);
 h.api.setEligible(true);
 h.api.setEligible(true);
 assert.equal(h.events.length,0);
});
test('Lv2 participation code is not replaced with forged Lv3 server authorization',()=>{
 assert.match(levelState,/indicator\.dataset\.level=level/);
 assert.match(levelState,/indicator\.dataset\.memberLevel=displayLv3\?'3':''/);
 assert.match(levelState,/lv3Verified&&indicator\.dataset\.level==='2'/);
 assert.match(levelState,/beagu:lv3-session-verification/);
 assert.match(levelState,/beagu:lv3-display-updated/);
 assert.match(levelState,/syncLevelCards\(level,provisional\)/);
 assert.match(guide,/participation===2&&indicator\.dataset\.memberLevel==='3'\?3:participation/);
 assert.match(guide,/beagu:lv3-display-updated/);
 assert.doesNotMatch(levelState,/sessionStorage\.setItem\([^)]*Lv3/i);
});
test('all protected membership pages load the Lv3 helper before the status UI and account scripts',()=>{
 for(const [page,prefix,entry] of [
  ['challenge.html','challenge','js/challenge-member-auth-v1.js'],
  ['postit.html','postit','js/postit-account-v1.js']]){
  const html=load(page);
  const link=html.indexOf('src="js/beagu-lv3-session-v1.js');
  const ui=html.indexOf('src="js/beagu-lv3-account-ui-v1.js');
  const main=html.indexOf('src="'+entry);
  assert.ok(link>0&&ui>link&&main>ui,page);
  for(const id of [prefix+'Lv3Panel',prefix+'Lv3Verify',prefix+'Lv3Status'])
   assert.ok(html.includes('id="'+id+'"'),id);
  const js=load(entry);
  assert.match(js,/BeaguLv3AccountUI\?\.create/);
  assert.match(js,/lv3\.setEligible/);
  assert.match(js,/lv3\.reset\(\)/);
 }
});
test('Level 3 benefits remain planned until server data release review and never open from CSS or badges',()=>{
 const html=load('levels.html');
 assert.match(html,/data-tier="3"/);
 assert.match(html,/2026년 최신 학교 기본정보 제공 예정/);
 assert.match(html,/공개 심사가 끝난 2026 자료의 즉시 열람 혜택 예정/);
 assert.match(html,/별도 서버 권한 확인/);
 assert.match(html,/정식 배포 전까지 열리지 않습니다/);
 const css=load('styles/beagu-level-guide-v1.css');
 assert.match(css,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
 const api=load('supabase/functions/beagu-lv3-member-api-v1/index.ts');
 assert.match(api,/beagu_2026_verified_visitor_level_v1/);
 assert.match(api,/beagu_lv3_verify_session_v1/);
 assert.doesNotMatch(html,/data-lv3-token=|data-vip-secret=|window\.lv3Auth=true/);
});
