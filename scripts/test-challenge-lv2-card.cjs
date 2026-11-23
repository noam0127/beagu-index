const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const source=fs.readFileSync('js/challenge-referral-v1.js','utf8');
const html=fs.readFileSync('challenge.html','utf8');
const identity=fs.readFileSync('js/challenge.js','utf8');
assert.match(html,/id="challengeIdentityPanel"[^>]*data-referral-state="pending"/);
assert.match(html,/id="challengeIdentityTag"/);
assert.match(html,/id="challengeIdentityReward"/);
assert.match(html,/data-html2canvas-ignore="true"/);
assert.match(identity,/confirmedLv2/);
assert.doesNotMatch(source,/localStorage\.setItem\([^\n]*upgrade/i);
function fakeNode(){
  const classes=new Set();
  return {hidden:false,disabled:false,textContent:'',value:'',dataset:{},listeners:{},
    classList:{toggle(n,b){if(b)classes.add(n);else classes.delete(n);},contains(n){return classes.has(n);}},
    setAttribute(k,v){this[k]=v;},
    addEventListener(k,cb){this.listeners[k]=cb;},focus(){},select(){}};
}
const ids=['challengeReferralPanel','challengeReferralLink','copyChallengeReferral',
  'challengeReferralStatus','challengeReferralProgress','challengeReferralCount','challengeReferralTitle','challengeReferralTag',
  'challengeReferralNote','challengeIdentityPanel','challengeIdentityTitle','challengeIdentityTag',
  'challengeIdentityReward','copyIdentityCode','challengeVipMedal','certificateMedal','certificateThanks','certificateLevelBanner','certificate'];
const nodes=Object.fromEntries(ids.map(k=>[k,fakeNode()]));
const events={};
const payload={level:1,validReferrals:0,provisional:false,
  link:'https://baeguindex.com/survey.html?ref='+'f'.repeat(64),
  shortLink:'https://baeguindex.com/r/#ABCDEFGH'};
const visitor='01234567-89ab-cdef-0123-456789abcdef', code='K7M9Q2X4T8';
const win={addEventListener:(name,fn)=>events[name]=fn,
 dispatchEvent:(event)=>{win.lastEvent=event.type;}};
const document={hidden:false,getElementById:(id)=>nodes[id],
 addEventListener:(name,fn)=>events[name]=fn};
vm.runInNewContext(source,{document,window:win, SUPABASE_URL:'https://example.supabase.co',
  sessionStorage:{getItem:()=> 'a'.repeat(64)},
  localStorage:{getItem:()=> 'b'.repeat(64)},
  crypto:require('node:crypto').webcrypto, Event:class{constructor(type){this.type=type;}},
  fetch:async()=>({ok:true,json:async()=>({...payload})}),
  CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail;}},
  setInterval:()=>0,navigator:{clipboard:{writeText:async()=>{}}}});
const flush=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
  assert.equal(nodes.challengeIdentityTitle.textContent,'Lv.2 참여코드(비활성)');
  assert.equal(nodes.copyIdentityCode.hidden,true);
  assert.equal(nodes.certificateLevelBanner.textContent,'Lv.1 챌린지 달성');
  events['beagu:challenge-access-granted']();
  events['beagu:identity-ready']({detail:{visitor,code}});
  await flush();
  assert.equal(nodes.challengeIdentityTitle.textContent,'Lv.2 참여코드(비활성)');
  assert.equal(nodes.challengeIdentityPanel.classList.contains('is-lv2'),false);
  assert.equal(nodes.challengeReferralLink.value,payload.shortLink);
  assert.equal(nodes.challengeReferralTitle.textContent,'나의 전용 조사 링크');
  // Level 2 alone cannot trigger a code promotion without a credited respondent.
  payload.level=2;payload.provisional=true;payload.validReferrals=0;
  events.focus();await flush();
  assert.equal(nodes.challengeIdentityTitle.textContent,'Lv.2 참여코드(비활성)');
  payload.validReferrals=1;
  events.focus();await flush();
  assert.equal(nodes.challengeIdentityTitle.textContent,'Lv.2 참여코드');
  assert.equal(nodes.copyIdentityCode.hidden,false);
  assert.equal(nodes.certificateLevelBanner.textContent,'Lv.2 챌린지 달성');
  assert.equal(nodes.challengeIdentityPanel.classList.contains('is-lv2'),true);
  assert.equal(nodes.challengeIdentityPanel.dataset.referralState,'earned');
  assert.equal(nodes.challengeReferralCount.textContent,'1건');
  assert.equal(nodes.copyIdentityCode.textContent,'코드 복사');
  assert.equal(nodes.challengeIdentityReward.hidden,false);
  assert.equal(nodes.challengeReferralLink.value,payload.shortLink,'referral link preserved');
  assert.equal(nodes.challengeReferralTitle.textContent,'나의 전용 조사 링크');
  assert.equal(win.lastEvent,'beagu:referral-status-changed');
  // Logout must restore the pre-credit label, no cached premium status.
  events['beagu:challenge-access-revoked']();
  assert.equal(nodes.challengeIdentityTitle.textContent,'Lv.2 참여코드(비활성)');
  assert.equal(nodes.challengeIdentityPanel.classList.contains('is-lv2'),false);
  assert.equal(nodes.challengeReferralLink.hidden,true);
  console.log('PASS: verified Lv2 code-card transition, no false credits, link kept, logout reset');
})().catch(e=>{console.error(e);process.exitCode=1;});
