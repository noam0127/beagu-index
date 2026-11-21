import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';

const cardJs=readFileSync('js/challenge-referral-v1.js','utf8');
const challengeJs=readFileSync('js/challenge.js','utf8');
const html=readFileSync('challenge.html','utf8');
const levelApi=readFileSync('supabase/functions/beagu-level-api/index.ts','utf8');
const referralApi=readFileSync('supabase/functions/beagu-referral-link-v1/index.ts','utf8');
const migration=readFileSync('supabase/migrations/20261121235500_beagu_2026_verified_code_levels_v1.sql','utf8');
const CODE='BG26-ABCD-1234-EF56-7890-AB12';
const VISITOR='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const SESSION='b'.repeat(64);
const LINK='https://baeguindex.com/r/#aB3_dE-9';
const FULL_LINK='https://baeguindex.com/survey.html?ref='+'f'.repeat(64);

function fixture(){
 const ids=[
  'challengeReferralPanel','challengeReferralLink','copyChallengeReferral',
  'challengeReferralStatus','challengeReferralProgress','challengeReferralTitle',
  'challengeReferralTag','challengeReferralNote','challengeIdentityPanel',
  'challengeIdentityTitle','challengeIdentityTag','challengeIdentityReward',
  'copyIdentityCode','identityCode'
 ];
 const nodes=Object.fromEntries(ids.map(id=>{
  const classes=new Set();
  return [id,{hidden:false,disabled:false,textContent:id==='identityCode'?CODE:'',
   value:'',dataset:{},listeners:{},attributes:{},
   classList:{toggle:(name,enabled)=>enabled?classes.add(name):classes.delete(name),contains:name=>classes.has(name)},
   setAttribute(name,value){this.attributes[name]=value},
   addEventListener(name,cb){this.listeners[name]=cb},
   focus(){},select(){}
  }];
 }));
 const listeners={},events=[],network=[],copies=[];
 let current={status:200,payload:{link:FULL_LINK,shortLink:LINK,level:0,
  ownResponseVerified:false,validReferrals:0,provisional:false}};
 let timer;
 let hidden=false;
 const win={addEventListener(name,cb){(listeners[name]??=[]).push(cb)},
  dispatchEvent(event){
   events.push(event.type);
   for(const cb of listeners[event.type]||[])cb(event);
  }};
 const doc={getElementById:id=>nodes[id],addEventListener(name,cb){
   (listeners['doc:'+name]??=[]).push(cb);
  },get hidden(){return hidden}};
 vm.runInNewContext(cardJs,{
  window:win,document:doc,SUPABASE_URL:'https://example.supabase.co',
  sessionStorage:{getItem:key=>key==='beagu-level-session-v1'?SESSION:null},
  localStorage:{getItem:()=> 'a'.repeat(64),setItem(){}},
  crypto:crypto.webcrypto,navigator:{clipboard:{writeText:async text=>{copies.push(text)}}},
  Event:class {constructor(type){this.type=type}},
  setInterval:fn=>{timer=fn;return 1},
  fetch:async(_url,options)=>{
   const body=JSON.parse(options.body);
   assert.equal(body.action,'issue');
   assert.equal(body.identityCode,CODE);
   assert.equal(body.visitor,VISITOR);
   assert.equal(options.headers['X-Beagu-Session'],SESSION);
   assert.equal(options.cache,'no-store');
   network.push(body);
   if(current.throw)throw Error('NETWORK_UNAVAILABLE');
   return {ok:current.status===200,status:current.status,
    json:async()=>({...current.payload})};
  }
 });
 const emit=(type,detail)=>win.dispatchEvent({type,detail});
 const tick=()=>new Promise(resolve=>setImmediate(resolve));
 return {
  nodes,events,network,copies,tick,emit,
  set:(payload,status=200)=>{current={status,payload:{link:FULL_LINK,shortLink:LINK,...payload}}},
  failure:()=>{current={throw:true}},
  poll:()=>timer(),
  clear:()=>emit('beagu:challenge-access-revoked'),
  start:()=>{emit('beagu:challenge-access-granted');emit('beagu:identity-ready',{visitor:VISITOR,code:CODE})}
 };
}
const initial={level:0,ownResponseVerified:false,validReferrals:0,provisional:false};
const inactive={level:1,ownResponseVerified:true,validReferrals:0,provisional:false};
const active={level:2,ownResponseVerified:true,validReferrals:1,provisional:true};
const label=f=>f.nodes.challengeIdentityTitle.textContent;
const state=f=>f.nodes.challengeIdentityPanel.dataset.referralState;

test('25: source-backed A-04 code labels, no fake upgrades, same code and referral URL',async()=>{
 const f=fixture();
 assert.equal(label(f),'나의 고유번호');
 f.set(initial);f.start();await f.tick();
 assert.equal(label(f),'나의 고유번호');
 assert.equal(state(f),'pending');
 assert.equal(f.nodes.identityCode.textContent,CODE);
 assert.equal(f.nodes.challengeIdentityReward.hidden,true);
 assert.equal(f.nodes.challengeReferralLink.value,LINK);

 f.set(inactive);f.emit('focus');await f.tick();
 assert.equal(label(f),'Lv2 참여코드(비활성)');
 assert.equal(state(f),'inactive');
 assert.equal(f.nodes.challengeIdentityTag.textContent,'Lv.1 인증 가능');
 assert.equal(f.nodes.challengeIdentityReward.hidden,false);
 assert.match(f.nodes.challengeIdentityReward.textContent,/현재 Lv\.1 인증 가능/);
 assert.equal(f.nodes.challengeIdentityPanel.classList.contains('is-lv2'),false);
 assert.equal(f.nodes.identityCode.textContent,CODE);
 assert.equal(f.events.filter(e=>e==='beagu:level-state-change').length,1);
 await f.nodes.copyChallengeReferral.listeners.click();
 assert.equal(f.copies.at(-1),LINK);

 for(const spoof of [
  {...inactive,level:2,validReferrals:0,provisional:true},
  {...inactive,level:2,validReferrals:1,provisional:false},
  {...inactive,level:1,validReferrals:1,provisional:true}
 ]){
  f.set(spoof);f.emit('focus');await f.tick();
  assert.equal(label(f),'Lv2 참여코드(비활성)');
  assert.equal(state(f),'inactive');
  assert.equal(f.nodes.challengeIdentityPanel.classList.contains('is-lv2'),false);
 }

 f.set(active);f.emit('focus');await f.tick();
 assert.equal(label(f),'Lv2 참여코드');
 assert.equal(state(f),'earned');
 assert.equal(f.nodes.challengeIdentityPanel.classList.contains('is-lv2'),true);
 assert.equal(f.nodes.challengeIdentityTag.textContent,'Lv.2 달성 ✦');
 assert.equal(f.nodes.identityCode.textContent,CODE);
 assert.equal(f.nodes.challengeReferralLink.value,LINK);
 assert.equal(f.events.filter(e=>e==='beagu:level-state-change').length,2);

 // The 60s poll also checks active accounts, so a revoked referral is not
 // indefinitely displayed as premium without user focus.
 f.set(inactive);f.poll();await f.tick();
 assert.equal(label(f),'Lv2 참여코드(비활성)');
 assert.equal(state(f),'inactive');
 assert.equal(f.nodes.challengeIdentityPanel.classList.contains('is-lv2'),false);
 assert.equal(f.events.filter(e=>e==='beagu:level-state-change').length,3);
 assert.equal(f.nodes.identityCode.textContent,CODE);
 assert.equal(f.nodes.challengeReferralLink.value,LINK);

 // If the owner's response is revoked, no stale Lv1 permission hint survives.
 f.set({...active,ownResponseVerified:false});f.emit('focus');await f.tick();
 assert.equal(label(f),'나의 고유번호');
 assert.equal(state(f),'pending');
 assert.equal(f.nodes.challengeIdentityReward.hidden,true);
 assert.equal(f.nodes.identityCode.textContent,CODE);

 f.clear();
 assert.equal(state(f),'pending');
 assert.equal(f.nodes.challengeReferralLink.hidden,true);
 assert.equal(f.nodes.copyChallengeReferral.disabled,true);
});

test('25: 503 and transient network failures hide stale Lv2 premium without granting/revoking server rights',async()=>{
 const f=fixture();
 f.set(active);f.start();await f.tick();
 assert.equal(state(f),'earned');
 f.set({error:'REFERRAL_NOT_READY'},503);f.emit('focus');await f.tick();
 assert.equal(state(f),'pending');
 assert.equal(f.nodes.challengeIdentityPanel.classList.contains('is-lv2'),false);
 assert.match(f.nodes.challengeReferralStatus.textContent,/준비 중/);
 assert.equal(f.nodes.identityCode.textContent,CODE);
 assert.equal(f.nodes.challengeReferralLink.value,LINK);
 f.set(active);f.emit('focus');await f.tick();
 assert.equal(state(f),'earned');
 f.failure();f.emit('focus');await f.tick();
 assert.equal(state(f),'pending');
 assert.match(f.nodes.challengeReferralProgress.textContent,/확인 불가/);
 assert.equal(f.nodes.challengeIdentityReward.hidden,true);
 assert.equal(f.nodes.identityCode.textContent,CODE);
});

test('25: server authorization remains independent from the card, no mutation of issued code or secret exposure',()=>{
 assert.match(levelApi,/beagu_2026_verified_code_level_v1/);
 assert.match(levelApi,/beagu_2026_verified_visitor_level_v1/);
 assert.match(referralApi,/beagu_2026_verified_visitor_level_v1/);
 assert.match(referralApi,/ownResponseVerified: tier>=1/);
 assert.match(referralApi,/provisional: tier===2/);
 assert.match(referralApi,/validReferrals: tier===2 \? 1 : 0/);
 assert.match(migration,/e\.decision='credited'/);
 assert.match(migration,/p\.disabled=false/);
 assert.match(cardJs,/payload\.ownResponseVerified === true/);
 assert.match(cardJs,/Number\(payload\.validReferrals\) >= 1/);
 assert.match(cardJs,/Number\(payload\.level\) === 2/);
 assert.match(cardJs,/payload\.provisional === true/);
 assert.match(challengeJs,/codeStatus === 'inactive'/);
 assert.match(challengeJs,/Lv2 참여코드\(비활성\)를 복사했습니다/);
 assert.doesNotMatch(cardJs,/localStorage\.setItem\(['"]beagu-level-session|innerHTML\s*=|service_role/);
 assert.ok(html.includes('data-html2canvas-ignore="true"'));
});
