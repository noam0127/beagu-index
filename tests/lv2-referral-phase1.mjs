import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Script,runInNewContext} from 'node:vm';

const read=path=>readFileSync(path,'utf8');
const challenge=read('challenge.html');
const challengeJs=read('js/challenge.js');
const issuer=read('supabase/functions/beagu-challenge-identity/index.ts');
const edge=read('supabase/functions/beagu-referral-v1/index.ts');
const migration=read('supabase/migrations/20261119_lv2_referral_phase1.sql');
const bound=read('supabase/migrations/20261119_lv2_device_proof_preparation.sql');
const gate=read('supabase/migrations/20261119_lv2_referral_guard.sql');
const survey=read('survey.html');
const surveyJs=read('js/survey-referral-v1.js');
const formConfig=read('js/referral-form-config.js');
const lv2=read('search-lv2.html');
const levelJs=read('js/level-search.js');
const official='https://docs.google.com/forms/d/e/1FAIpQLSf3fY3b4amMyIpBLpU4tK69Bf3ZNVQ2r7eH2vBUUn0gxz7lYQ/viewform';

for(const path of ['js/challenge.js','js/level-search.js','js/survey-referral-v1.js',
  'js/referral-form-config.js','js/beagu-level-state-v1.js']){
  new Script(read(path),{filename:path}); // JS syntactic smoke test
}
assert.ok(challenge.includes('id="challengeReferralPanel"'));
assert.ok(challenge.indexOf('id="challengeReferralPanel"')>challenge.indexOf('id="certificate"'));
assert.ok(challenge.includes('data-html2canvas-ignore="true"'));
for(const id of ['copyReferralLink','referralProgress','referralLevel','referralLv2Link','identityRecovery'])
  assert.ok(challenge.includes('id="'+id+'"'),id);
assert.ok(challengeJs.includes('deviceProof: deviceProof()'));
assert.ok(challengeJs.includes("legacyIdentityCode: legacyIdentityInput.value.trim()"));
assert.ok(issuer.includes('beagu_issue_challenge_identity_bound'));
assert.ok(!issuer.includes("admin.rpc('beagu_issue_challenge_identity',"));
assert.ok(bound.includes('legacy proof required'));
assert.ok(migration.includes('on conflict (name) do nothing'));
assert.ok(migration.includes("('public_enabled',false),('ingest_enabled',false),('login_enabled',false)"));
assert.ok(gate.includes("where name='public_enabled'"));
assert.ok(migration.includes("create unique index if not exists challenge_referral_one_respondent_credit"));
assert.ok(migration.includes("if found then return jsonb_build_object('credited',false,'decision','duplicate_event')"));
assert.ok(migration.includes('enable row level security'));
assert.ok(migration.includes('grant execute on function public.beagu_referral_credit'));
assert.ok(edge.includes("expected = Deno.env.get('BEAGU_2026_INGEST_TOKEN')"));
assert.ok(edge.includes("admin.rpc('beagu_referral_credit'"));
assert.ok(edge.includes("admin.rpc('beagu_referral_auth'"));
assert.ok(edge.includes("admin.rpc('beagu_consume_login_budget'"));
assert.match(edge,/replace\(\/\\\+\/g, '-'\)/,'standard base64 + must be encoded');
assert.match(edge,/replace\(\/\\\/\/g, '_'\)/,'standard base64 slash must be encoded');
assert.ok(edge.includes('referralToken')&&!edge.includes('responseAnswers'));
assert.ok(survey.includes(official),'Original Google Form URL preserved');
assert.ok(survey.includes('id="officialSurveyLink"'));
assert.ok(surveyJs.includes("original.hidden = true"),'unconfigured prefill must fail closed');
assert.ok(surveyJs.includes("localStorage.getItem(key)"),'respondent uses stable UUID');
assert.ok(surveyJs.includes("new URL(original.href)"));
assert.ok(surveyJs.includes("form.searchParams.set('entry.' + config.tokenEntryId, ref)"));
assert.ok(surveyJs.includes("form.searchParams.set('entry.' + config.deviceEntryId, visitor)"));
assert.ok(formConfig.includes("tokenEntryId: ''")&&formConfig.includes("deviceEntryId: ''"));
assert.ok(lv2.includes('data-beagu-level="2"')&&!lv2.includes('http-equiv="refresh"'));
assert.ok(levelJs.includes("level === 2")&&levelJs.includes("action:'login',identityCode:code"));
assert.ok(read('js/beagu-level-state-v1.js').includes("setState('2','Lv.2'"));

const core=read('scripts/beagu-2026-noon-sync.gs');
const addon=read('scripts/beagu-2026-referral-addon.gs');
assert.ok(core.includes('beagu26ProcessReferral_(event)'));
assert.ok(core.includes('refreshBeagu2026AllPrivateStats();'),'Original aggregation preserved');
assert.ok(core.includes('catch(_error)'), 'Referral failure must be non-blocking');
assert.ok(core.includes('setupBeagu2026FormSubmitTrigger'));
assert.ok(addon.includes('installBeagu2026ReferralBridge'));
const sends=[];
const token='A'.repeat(43),device='12345678-1234-4123-8123-123456789012';
const when=new Date('2026-11-19T12:34:56.000Z');
const headers=['타임스탬프','Q01 survey answer','BG26 추천 확인값 (자동 입력)','BG26 기기 확인값 (자동 입력)'];
let rowValues=[when,'PRIVATE ANSWER MUST NEVER LEAVE',token,device];
const sheet={
 getName:()=> '설문지 응답 시트1',
 getParent:()=>({getId:()=> '1T_rEz1LqX97pC9gOv33SRmspK2IizTU3wFtxA8P1pC4'}),
 getSheetId:()=>734,
 getLastColumn:()=>4,
 getRange:(row,col)=>({
   getDisplayValues:()=>[headers],
   getDisplayValue:()=>String(rowValues[col-1]),
   getValue:()=>rowValues[col-1]
 })
};
const e={range:{getSheet:()=>sheet,getRow:()=>2}};
const scope={
 Date,Map,Set,Number,Object,Array,String,Math,RegExp,Error,JSON,
 Logger:{log:()=>{}},
 Utilities:{
  DigestAlgorithm:{SHA_256:'SHA_256'},
  computeDigest:(_,s)=>Array.from(createHash('sha256').update(s).digest())
 },
 PropertiesService:{getScriptProperties:()=>({getProperty:()=> 's'.repeat(48)})},
 UrlFetchApp:{fetch:(url,options)=>{
   sends.push({url,options});
   return {getResponseCode:()=>200,getContentText:()=>JSON.stringify({ok:true,credited:true,decision:'credited'})};
 }}
};
runInNewContext(core,scope,{filename:'scripts/beagu-2026-noon-sync.gs',timeout:2500});
runInNewContext(addon,scope,{filename:'scripts/beagu-2026-referral-addon.gs',timeout:2500});
assert.equal(scope.beagu26ProcessReferral_(e),'CREDITED');
assert.equal(scope.beagu26ProcessReferral_(e),'CREDITED');
assert.equal(sends.length,2);
const sent1=JSON.parse(sends[0].options.payload),sent2=JSON.parse(sends[1].options.payload);
assert.deepEqual(Object.keys(sent1).sort(),['action','eventKey','referralToken','respondentUuid'].sort());
assert.equal(sent1.eventKey,sent2.eventKey,'Repeated trigger must send same deduplication key');
assert.ok(!JSON.stringify(sent1).includes('PRIVATE ANSWER'));
assert.ok(!JSON.stringify(sent1).includes('Q01 survey answer'));
rowValues=[when,'PRIVATE ANSWER MUST NEVER LEAVE','',''];
assert.equal(scope.beagu26ProcessReferral_(e),'NORMAL_SUBMISSION','Non-referral answers stay untouched');
assert.equal(sends.length,2,'Unreferred response does not call webhook');
rowValues=[when,'PRIVATE ANSWER MUST NEVER LEAVE',token,'invalid'];
assert.equal(scope.beagu26ProcessReferral_(e),'INVALID_REFERRAL_FIELDS');
assert.equal(sends.length,2,'Bad device token is not sent');
console.log('PASS: Lv2 branch static/auth/security/invite checks and two-column-only Apps Script bridge');
