import assert from 'node:assert/strict';

const origin='https://baeguindex.com';
const base='https://snvzwrexuqavnfvzgxqj.supabase.co/functions/v1/';
const headers={'Content-Type':'application/json','Origin':origin};
const token='c'.repeat(64);
async function probe(fn,body,session){
 const response=await fetch(base+fn,{method:'POST',cache:'no-store',
  headers:{...headers,...(session?{'X-Beagu-Session':session,'X-Beagu-Level-Session':session}:{})},
  body:JSON.stringify(body),signal:AbortSignal.timeout(18000)});
 const json=await response.json().catch(()=>({}));
 assert.equal(response.headers.get('access-control-allow-origin'),origin,'CORS must be first-party only');
 return {status:response.status,json};
}
const negative=await probe('beagu-level-api',{action:'login',code:'BG26-0000-0000-0000-0000-0000'});
assert.equal(negative.status,401,'Unissued challenge-like code must be rejected');
assert.equal(negative.json.error,'INVALID_CODE');
const verify=await probe('beagu-level-api',{action:'verify'},token);
assert.equal(verify.status,401,'Forged session cannot confirm a tier');
const school=await probe('beagu-level-api',{action:'school',schoolId:'ABCDEFG'},token);
assert.equal(school.status,401,'Protected school data cannot be read with forged token');
const referral=await probe('beagu-referral-link-v1',{action:'issue',visitor:'00000000-0000-0000-0000-000000000000'},token);
assert.equal(referral.status,401,'Referral credit cannot be manipulated with forged session');
const postit=await fetch(base+'beagu-postit-api-v1?action=list',{method:'GET',
 headers:{Origin:origin,'X-Beagu-Level-Session':token},signal:AbortSignal.timeout(18000)});
assert.equal(postit.status,403,'Lv2 Post-it cannot be read with forged session');
console.log('PASS: production code login, verify, school, referral and Post-it reject unearned/forged access');
