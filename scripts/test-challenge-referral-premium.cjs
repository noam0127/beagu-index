const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const html = fs.readFileSync('challenge.html', 'utf8');
const js = fs.readFileSync('js/challenge-referral-v1.js', 'utf8');
const server = fs.readFileSync('supabase/functions/beagu-referral-link-v1/index.ts', 'utf8');
assert.match(html, /id="challengeReferralPanel"/);
assert.match(html, /id="challengeIdentityPanel"/);
assert.match(html, /id="challengeIdentityTag"/);
assert.match(html, /class="challenge-identity challenge-code-card"/);
assert.match(html, /challenge-code-card\.is-lv2/);
assert.match(server, /validReferrals:/);
assert.match(server, /provisional:/);
assert.doesNotThrow(() => new vm.Script(js));
const ids = [
  'challengeReferralPanel', 'challengeReferralLink', 'copyChallengeReferral',
  'challengeReferralStatus', 'challengeReferralProgress', 'challengeReferralTitle',
  'challengeReferralTag', 'challengeReferralNote',
  'challengeIdentityPanel', 'challengeIdentityTitle', 'challengeIdentityTag',
  'challengeIdentityReward', 'copyIdentityCode'
];
const el = Object.fromEntries(ids.map(id => [id, {
  hidden: id === 'challengeIdentityReward', value: '', textContent: '', disabled: false,
  dataset: {}, attributes: {}, listeners: {}, classes: new Set(),
  classList: {toggle(cls, enabled) {
    if (enabled) el[id].classes.add(cls); else el[id].classes.delete(cls);
  }},
  setAttribute(name,value){this.attributes[name]=value;},
  addEventListener(type,cb){this.listeners[type]=cb;},
  focus(){}, select(){}
}]));
const visitor='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const code='ABCDEFGHJK';
const referral='https://baeguindex.com/survey.html?ref='+'a'.repeat(64);
const shortLink='https://baeguindex.com/r/#aB3_dE-9';
const session='b'.repeat(64);
const storage=new Map(), copies=[], listeners={};
let returned={link:referral,level:0,ownResponseVerified:false,validReferrals:0,provisional:false};
const mockWindow={
  addEventListener(type,cb){(listeners[type]??=[]).push(cb);},
  dispatchEvent(event){(listeners[event.type]||[]).forEach(cb=>cb(event));}
};
vm.runInNewContext(js,{
  document:{getElementById:id=>el[id],hidden:false,addEventListener(){}},
  window:mockWindow,navigator:{clipboard:{writeText:async v=>{copies.push(v);}}},
  sessionStorage:{getItem:()=>session},
  localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
  crypto:crypto.webcrypto,SUPABASE_URL:'https://example.supabase.co',
  fetch:async (_url,opts)=>{
    const body=JSON.parse(opts.body);
    assert.equal(body.action,'issue');
    assert.equal(body.identityCode,code);
    return {ok:true,status:200,json:async()=>({...returned})};
  },
  setInterval:()=>1,Event:class {constructor(type){this.type=type;}}
});
const emit=(type,arg={})=>(listeners[type]||[]).forEach(cb=>cb(arg));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
  assert.equal(el.challengeIdentityTitle.textContent,'나의 고유번호');
  emit('beagu:challenge-access-granted');
  emit('beagu:identity-ready',{detail:{visitor,code}});
  await tick();
  assert.equal(el.challengeIdentityTitle.textContent,'나의 고유번호');
  assert.equal(el.challengeReferralLink.value,referral);
  assert.equal(el.challengeReferralTitle.textContent,'나의 전용 조사 링크');

  // A server-verified own 2026 survey turns the same issued code into Lv1.
  returned={link:referral,shortLink,level:1,ownResponseVerified:true,
    validReferrals:0,provisional:false};
  emit('focus');await tick();
  assert.equal(el.challengeIdentityTitle.textContent,'Lv2 참여코드(비활성)');
  assert.equal(el.challengeIdentityTag.textContent,'Lv.1 인증 가능');
  assert.equal(el.challengeIdentityPanel.dataset.referralState,'inactive');
  assert.equal(el.challengeIdentityReward.hidden,false);
  assert.ok(el.challengeIdentityReward.textContent.includes('Lv.1 인증 가능'));
  assert.equal(el.copyIdentityCode.textContent,'코드 복사');

  // The first verified long link remains copyable even when a short alias appears later.
  returned.shortLink=shortLink;
  emit('focus');await tick();
  assert.equal(el.challengeReferralLink.value,referral,'first verified URL must be kept');
  await el.copyChallengeReferral.listeners.click();
  assert.equal(copies.at(-1),referral);

  // A client-supplied "level: 2" alone must not grant premium visuals.
  returned={link:referral,shortLink,level:2,ownResponseVerified:false,
    validReferrals:0,provisional:true};
  emit('focus');await tick();
  assert.equal(el.challengeIdentityTitle.textContent,'나의 고유번호');
  assert.equal(el.challengeIdentityPanel.classes.has('is-lv2'),false);

  // A server-confirmed credit converts the original personal code card.
  returned={link:referral,shortLink,level:2,ownResponseVerified:true,
    validReferrals:1,provisional:true};
  emit('focus');await tick();
  assert.equal(el.challengeIdentityTitle.textContent,'Lv2 참여코드');
  assert.equal(el.challengeIdentityTag.textContent,'Lv.2 달성 ✦');
  assert.equal(el.copyIdentityCode.textContent,'코드 복사');
  assert.equal(el.challengeIdentityReward.hidden,false);
  assert.ok(el.challengeIdentityPanel.classes.has('is-lv2'));
  assert.equal(el.challengeIdentityPanel.dataset.referralState,'earned');
  assert.equal(el.challengeReferralTitle.textContent,'나의 전용 조사 링크');
  assert.equal(el.challengeReferralLink.value,referral);
  await el.copyChallengeReferral.listeners.click();await tick();
  assert.equal(copies.at(-1),referral);

  // A quality-review downgrade restores Lv1 access label without reissuing code.
  returned={link:referral,shortLink,level:1,ownResponseVerified:true,
    validReferrals:0,provisional:false};
  emit('focus');await tick();
  assert.equal(el.challengeIdentityTitle.textContent,'Lv2 참여코드(비활성)');
  assert.equal(el.challengeIdentityPanel.dataset.referralState,'inactive');
  assert.equal(el.challengeIdentityPanel.classes.has('is-lv2'),false);
  assert.equal(el.challengeReferralLink.value,referral);

  emit('beagu:challenge-access-revoked');
  assert.equal(el.challengeIdentityTitle.textContent,'나의 고유번호');
  assert.equal(el.challengeIdentityPanel.classes.has('is-lv2'),false);
  assert.equal(el.challengeReferralLink.value,'');
  assert.equal(el.challengeIdentityReward.hidden,true);
  console.log('PASS: premium personal code card is gated by verified referral; link retained and logout resets');
})().catch(err=>{console.error(err);process.exitCode=1;});
