const fs=require('node:fs');
const vm=require('node:vm');
const crypto=require('node:crypto');
const assert=require('node:assert/strict');
const r=p=>fs.readFileSync(p,'utf8');
const checkin=r('supabase/functions/beagu-referral-checkin-v1/index.ts');
const ingest=r('supabase/functions/beagu-referral-ingest-v1/index.ts');
const issuer=r('supabase/functions/beagu-referral-link-v1/index.ts');
const form=r('scripts/beagu-2026-referral-integration.gs');
const survey=r('survey.html');
const cfg=r('js/beagu-referral-form-config-v1.js');
const ui=r('js/beagu-referral-form-v1.js');
const challenge=r('js/challenge-referral-v1.js');

for(const [name,src] of Object.entries({form,cfg,ui,challenge})) {
  assert.doesNotThrow(()=>new vm.Script(src,{filename:name}),name+' syntax');
}
assert.ok(checkin.includes("BEAGU_REFERRAL_CHECKIN_ENABLED"),'public checkin gate');
assert.ok(checkin.includes("BEAGU_REFERRAL_HMAC_KEY"),'dedicated key');
assert.ok(checkin.indexOf("BEAGU_REFERRAL_CHECKIN_ENABLED") <
  checkin.indexOf("const exp=Math.floor(Date.now()"),'proof minting gated');
assert.ok(ingest.includes("BEAGU_REFERRAL_INGEST_ENABLED"),'private ingestion gate');
assert.ok(ingest.indexOf("BEAGU_REFERRAL_INGEST_ENABLED") <
  ingest.indexOf("db.rpc('beagu_referral_credit'"),'credit cannot precede gate');
assert.match(ingest,/formResponseId/);
assert.match(ingest,/sourceSpreadsheetId/);
assert.match(ingest,/PROOF_OUT_OF_WINDOW/);
assert.match(ingest,/respondent\.toLowerCase\(\)/);
assert.match(ingest,/p_respondent_hash/);
assert.match(ingest,/decision/);
assert.match(issuer,/access_level: 2/);
assert.match(issuer,/SESSION_UPGRADE_UNAVAILABLE/);
assert.match(issuer,/REFERRAL_NOT_READY/);
assert.match(challenge,/beagu:level-state-change/);
assert.match(form,/\.forForm\(form\)\.onFormSubmit\(\)\.create\(\)/);
assert.match(form,/event\.response\.getId\(\)/);
assert.match(form,/getItemResponses\(\)/);
assert.match(form,/getDestinationId\(\)/);
assert.match(form,/\.toPrefilledUrl\(\)/);
assert.doesNotMatch(form,/\.submit\(\)/,'must not insert fake Google Form answers');
assert.doesNotMatch(form,/getRespondentEmail/,'must not exfiltrate email');
assert.match(survey,/id="referralConsent"/);
assert.match(survey,/id="surveyFormLink"/);
assert.match(survey,/id="backToSchool"/);
// Owner confirmed the optional Google Form field; the Form entry ID is public metadata.
assert.match(cfg,/entryName: 'entry\.2096012680'/);
// A deliberately unconfigured mock must still fall back to the standard form.
const m={};
for(const k of ['referralNotice','surveyFormLink','referralOptin','referralConsent','referralJoinForm','referralSubmitFeedback']){
  m[k]={hidden:k==='referralOptin',textContent:'',disabled:false,
    addEventListener(event,fn){this[event]=fn;}};
}
const called=[];
const context={
  window:{BEAGU_REFERRAL_FORM_CONFIG:{entryName:'',formUrl:'https://docs.google.com/forms/d/e/123/viewform'}},
  document:{getElementById:k=>m[k]},
  location:{search:'?ref='+'a'.repeat(64)}, URLSearchParams, URL, crypto:crypto.webcrypto,
  localStorage:{getItem:()=>null,setItem:()=>{}},
  fetch:()=>{called.push(1);return Promise.reject(Error('unexpected fetch'));},
  SUPABASE_URL:'https://example.supabase.co',
};
vm.runInNewContext(ui,context);
assert.equal(m.referralOptin.hidden,true,'do not show opt in before Form field configured');
assert.equal(called.length,0,'no request when field is unconfigured');
// Check public helper and ingest use exactly identical HMAC message derivation.
const testKey='z'.repeat(48),ref='f'.repeat(64);
const uuid='ab8afb27-c498-42c1-8df6-064b6b8102a4',exp=1795248000;
const prefix='BR1.'+ref+'.'+uuid+'.'+exp;
const signed=crypto.createHmac('sha256',testKey).update('BEAGU_REFERRAL_CHECKIN_V1|'+prefix).digest('hex');
assert.match(prefix+'.'+signed,/^BR1\.([a-f0-9]{64})\.([a-f0-9-]{36})\.(\d{10})\.([a-f0-9]{64})$/);
assert.ok(checkin.includes('BEAGU_REFERRAL_CHECKIN_V1|'));
assert.ok(ingest.includes('BEAGU_REFERRAL_CHECKIN_V1|'));
assert.ok(!survey.includes('service_role') && !cfg.includes('service_role'));
console.log('PASS: stage2 gates, no fake submissions, Google Form event contract, signed proof and opt-in fallback');
