/* Maintenance-mode smoke: no issued or guessed code may open the Class Diary.
 * Only synthetic requests are sent; never read, print, or submit any real code.
 */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const url='https://snvzwrexuqavnfvzgxqj.supabase.co/functions/v1/class-diary-guest-access-v1';
const origin='https://baeguindex.com';
const home=fs.readFileSync('index.html','utf8');
const play=fs.readFileSync('teacher-class-diary-play.html','utf8');
const edge=fs.readFileSync('supabase/functions/class-diary-guest-access-v1/index.ts','utf8');

assert(home.includes('id="teacher-diary-feature"'),'Home must retain the novel card');
assert(home.includes('id="teacher-diary-lock-title">준비 중'),'Home must show preparation status');
assert(!home.includes('id="homeDiaryGuestForm"'),'Home code entry must be removed');
assert(!home.includes('id="homeDiaryCode"'),'No code field may be rendered');
assert(!home.includes('js/class-diary-home-entry-v1.js'),'Guest verification script must not load');
assert(!home.includes('href="teacher-class-diary-play.html?guest=1"'),'Home may not link to guest entry');
assert(play.includes("params.get('guest')==='1'"),'Direct guest URLs must be detected');
assert(play.includes("fail('『나의 OO한 학급일지』는 현재 준비 중입니다."),'Direct guest URLs must stop immediately');
assert(play.includes("sessionStorage.removeItem('beagu-class-diary-guest-handoff-v1')"),'Stale handoffs must be discarded');
assert(edge.includes("return respond({error:'CLASS_DIARY_PREPARING',message:'준비 중'},503,origin)"),
 'Every guest-code and guest-ticket POST must be disabled before any credential check');

(async()=>{
 const get=await fetch(url,{method:'GET',headers:{Origin:origin},signal:AbortSignal.timeout(14000)});
 assert.equal(get.status,405,'GET must remain disallowed');
 const opt=await fetch(url,{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'POST'},signal:AbortSignal.timeout(14000)});
 assert.equal(opt.status,204,'CORS preflight must still work');
 assert.equal(opt.headers.get('access-control-allow-origin'),origin,'Unexpected allowed origin');
 for(const body of [{action:'verify-code',code:'AAAAAAAAAA'},{action:'verify-ticket',ticket:'v1.fake.fake'}]){
  const response=await fetch(url,{
   method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},
   body:JSON.stringify(body),signal:AbortSignal.timeout(14000)
  });
  assert.equal(response.status,503,'Guest entry must be blocked for all request types');
  const result=await response.json();
  assert.equal(result.error,'CLASS_DIARY_PREPARING');
  assert(!('ticket' in result)&&!('progressToken' in result),'No guest credentials may be returned');
 }
 console.log('PASS: Class Diary home shows preparation, direct guest route blocked, live code and ticket APIs disabled');
})().catch(e=>{console.error(e);process.exitCode=1});
