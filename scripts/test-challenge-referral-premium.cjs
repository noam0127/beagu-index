const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const html = fs.readFileSync('challenge.html', 'utf8');
const js = fs.readFileSync('js/challenge-referral-v1.js', 'utf8');
const server = fs.readFileSync('supabase/functions/beagu-referral-link-v1/index.ts', 'utf8');
assert.match(html, /id="challengeReferralPanel"/);
assert.match(html, /id="challengeReferralTag"/);
assert.match(html, /id="challengeReferralMore"/);
assert.match(html, /class="challenge-identity challenge-referral"/);
assert.match(html, /challenge-referral\.is-lv2/);
assert.match(server, /validReferrals:/);
assert.match(server, /provisional:/);
assert.doesNotThrow(() => new vm.Script(js));

const ids = ['challengeReferralPanel', 'challengeReferralLink',
  'copyChallengeReferral', 'challengeReferralStatus', 'challengeReferralProgress',
  'challengeReferralTitle', 'challengeReferralTag', 'challengeReferralNote',
  'challengeReferralMore', 'copyChallengeReferralAfter'];
const el = Object.fromEntries(ids.map(id => [id, {
  hidden: id === 'challengeReferralMore', value: '', textContent: '', disabled: false,
  dataset: {}, attributes: {}, listeners: {}, classes: new Set(),
  classList: { toggle(cls, enabled) {
    const self = el[id];
    if (enabled) self.classes.add(cls);
    else self.classes.delete(cls);
  } },
  setAttribute(name, value) { this.attributes[name] = value; },
  addEventListener(type, cb) { this.listeners[type] = cb; },
  focus() {}, select() {},
}]));
const listeners = {};
const page = {
  addEventListener(type, cb) { (listeners[type] ||= []).push(cb); },
  dispatchEvent() {},
};
const visitor = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const code = 'ABCDEFGHJK';
const referral = 'https://baeguindex.com/survey.html?ref=' + 'a'.repeat(64);
const session = 'b'.repeat(64);
const storage = new Map();
let returned = {link: referral, level: 1, validReferrals: 0, provisional: false};
const copies = [];
const windowListeners = {};
const mockWindow = {
  addEventListener(type, cb) { (windowListeners[type] ||= []).push(cb); },
  dispatchEvent(event) { (windowListeners[event.type] || []).forEach(cb => cb(event)); },
};
const context = {
  document: {getElementById: id => el[id], hidden: false, addEventListener: page.addEventListener},
  window: mockWindow, navigator: {clipboard: {writeText: async v => {copies.push(v);}}},
  sessionStorage: {getItem: () => session},
  localStorage: {getItem: k => storage.get(k) || null, setItem: (k,v) => storage.set(k,v)},
  crypto: crypto.webcrypto, SUPABASE_URL: 'https://example.supabase.co',
  fetch: async (_url, opts) => {
    const body = JSON.parse(opts.body);
    assert.equal(body.action,'issue');
    assert.equal(body.identityCode, code);
    return {ok:true,status:200,json:async()=>returned};
  },
  setInterval: () => 1,
  Event: class Event {constructor(type){this.type=type;}},
};
vm.runInNewContext(js, context);
const emit = (type, arg={}) => (windowListeners[type] || []).forEach(cb=>cb(arg));
const tick = () => new Promise(resolve=>setImmediate(resolve));
(async ()=>{
  assert.equal(el.challengeReferralPanel.dataset.state, 'pending');
  emit('beagu:challenge-access-granted');
  emit('beagu:identity-ready', {detail:{visitor,code}});
  await tick();
  assert.equal(el.challengeReferralPanel.dataset.state,'pending');
  assert.equal(el.challengeReferralTitle.textContent,'나의 전용 조사 링크');
  assert.equal(el.challengeReferralLink.value,referral);
  assert.equal(el.copyChallengeReferral.textContent,'링크 복사');

  // A forged or inconsistent level must not trigger a visual promotion.
  returned = {link: referral, level: 2, validReferrals: 0, provisional: true};
  emit('focus');
  await tick();
  assert.equal(el.challengeReferralPanel.dataset.state,'pending');

  // Only the server-confirmed credited referral changes the card.
  returned = {link: referral, level: 2, validReferrals: 1, provisional: true};
  emit('focus');
  await tick();
  assert.equal(el.challengeReferralPanel.dataset.state,'earned');
  assert.equal(el.challengeReferralTitle.textContent,'Lv2 참여코드');
  assert.equal(el.challengeReferralLink.value,code);
  assert.equal(el.copyChallengeReferral.textContent,'코드 복사');
  assert.equal(el.challengeReferralMore.hidden,false);
  assert.ok(el.challengeReferralPanel.classes.has('is-lv2'));
  await el.copyChallengeReferral.listeners.click();
  await tick();
  assert.equal(copies.at(-1),code);
  await el.copyChallengeReferralAfter.listeners.click();
  await tick();
  assert.equal(copies.at(-1),referral);

  emit('beagu:challenge-access-revoked');
  assert.equal(el.challengeReferralPanel.dataset.state,'pending');
  assert.equal(el.challengeReferralLink.value,'');
  assert.ok(!el.challengeReferralPanel.classes.has('is-lv2'));
  console.log('PASS: earned-only premium card, label, code, link copy and reset');
})().catch(err => {console.error(err);process.exitCode=1;});
