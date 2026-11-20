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
  ingest.indexOf("db.rpc('beagu_referral_credit_quality_gate'"),'credit cannot precede gate');
assert.match(ingest,/formResponseId/);
assert.match(ingest,/sourceSpreadsheetId/);
assert.match(ingest,/PROOF_OUT_OF_WINDOW/);
assert.match(ingest,/body\.action==='preflight'/);
assert.match(ingest,/p_quality_attested:attested/);
assert.match(ingest,/p_quality_signals:signals/);
assert.match(form,/beaguReferralSubmissionQuality_\(event.response\)/);
assert.match(ingest,/Object\.keys\(body\)\.length===1/);
assert.ok(ingest.indexOf("BEAGU_REFERRAL_INGEST_SECRET") <
 ingest.indexOf("body.action==='preflight'"),'preflight checks secret before accepting request');
assert.ok(ingest.indexOf("body.action==='preflight'") <
 ingest.indexOf("db.rpc('beagu_referral_credit_quality_gate'"),'preflight must not mutate referral data');
assert.match(form,/function testBeaguReferralConnection\(/);
assert.match(form,/payload:JSON\.stringify\(\{action:'preflight'\}\)/);

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
assert.doesNotMatch(survey,/id="referralConsent"/,'intermediate opt-in card must be removed');
assert.match(survey,/id="surveyFormLink"/);
assert.match(survey,/id="backToSchool"/);
// Owner confirmed the optional Google Form field; the Form entry ID is public metadata.
assert.match(cfg,/entryName: 'entry\.2096012680'/);
// A missing Form field must not issue a check-in; show the general survey fallback.
const m={referralNotice:{hidden:true,textContent:''}};
const called=[];
const context={
  window:{BEAGU_REFERRAL_FORM_CONFIG:{entryName:'',formUrl:'https://docs.google.com/forms/d/e/123/viewform'}},
  document:{documentElement:{classList:{remove:()=>{}}},getElementById:k=>m[k]||null},
  location:{pathname:'/survey.html',search:'?ref='+'a'.repeat(64)},
  URLSearchParams, URL, crypto:crypto.webcrypto,
  localStorage:{getItem:()=>null,setItem:()=>{}},
  fetch:()=>{called.push(1);return Promise.reject(Error('unexpected fetch'));},
};
vm.runInNewContext(ui,context);
assert.equal(m.referralNotice.hidden,false,'show fallback when unconfigured');
assert.equal(called.length,0,'do not request proof without valid Form config');
assert.match(r('r/index.html'),/beagu-referral-form-v1\.js/,'short links auto check in');
assert.match(ui,/location\.replace\(form\.toString\(\)\)/,'successful proof opens Form directly');
// Verify both short and long links prefill the server-signed proof without showing a card.
const proof='BR1.'+'a'.repeat(64)+'.'+'ab8afb27-c498-42c1-8df6-064b6b8102a4'+'.1795248000.'+'b'.repeat(64);
const redirectUrls=[];
for(const [pathname,search,hash] of [
  ['/r/','','#AbC123_z'],
  ['/survey.html','?ref='+'a'.repeat(64),''],
]){
  const loc={pathname,search,hash,replace:url=>redirectUrls.push(url)};
  vm.runInNewContext(ui,{
    window:{BEAGU_REFERRAL_FORM_CONFIG:{entryName:'entry.2096012680',formUrl:'https://docs.google.com/forms/d/e/FORM/viewform'}},
    document:{documentElement:{classList:{remove:()=>{throw Error('unexpected fallback')}}},getElementById:()=>null},
    location:loc,URLSearchParams,URL,crypto:crypto.webcrypto,
    localStorage:{getItem:()=>null,setItem:()=>{}},
    fetch:async()=>({ok:true,json:async()=>({proof})}),
  });
}
setImmediate(()=>{
  try {
    assert.equal(redirectUrls.length,2,'short and long referral links both redirect');
    for(const target of redirectUrls){
      const url=new URL(target);
      assert.equal(url.hostname,'docs.google.com');
      assert.equal(url.searchParams.get('entry.2096012680'),proof,'Google Form carries signed proof');
    }
  }catch(err){console.error(err);process.exitCode=1;}
});
// Check public helper and ingest use exactly identical HMAC message derivation.
const testKey='z'.repeat(48),ref='f'.repeat(64);
const uuid='ab8afb27-c498-42c1-8df6-064b6b8102a4',exp=1795248000;
const prefix='BR1.'+ref+'.'+uuid+'.'+exp;
const signed=crypto.createHmac('sha256',testKey).update('BEAGU_REFERRAL_CHECKIN_V1|'+prefix).digest('hex');
assert.match(prefix+'.'+signed,/^BR1\.([a-f0-9]{64})\.([a-f0-9-]{36})\.(\d{10})\.([a-f0-9]{64})$/);
assert.ok(checkin.includes('BEAGU_REFERRAL_CHECKIN_V1|'));
assert.ok(ingest.includes('BEAGU_REFERRAL_CHECKIN_V1|'));
assert.ok(!survey.includes('service_role') && !cfg.includes('service_role'));
console.log('PASS: stage2 gates, no fake submissions, Google Form event contract, signed proof and direct Form redirect');
