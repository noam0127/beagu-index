/* Production guest-code endpoint smoke test. Never read or print any real code. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const url='https://snvzwrexuqavnfvzgxqj.supabase.co/functions/v1/class-diary-guest-access-v1';
const origin='https://baeguindex.com';
const home=fs.readFileSync('index.html','utf8');
const play=fs.readFileSync('teacher-class-diary-play.html','utf8');
assert(home.includes('href="teacher-class-diary-play.html?guest=1"'),'Home entry link missing');
assert(home.includes('고유번호로 게임 시작하기'),'Home must not show coming soon');
assert(play.includes("params.get('guest')==='1'"),'Guest requires explicit entry mode');
assert(play.includes("show('guestAccess')"),'Guest form must be shown before any game starts');
assert(play.includes('class-diary-guest-access-v1'),'Server code verification not linked');
assert(play.includes("result.scope!=='class-diary-fictional-guest'"),'Guest scope guard missing');
assert(!play.includes('sessionStorage.setItem('),'Temporary code must never be stored');
(async()=>{
 const get=await fetch(url,{method:'GET',headers:{Origin:origin},signal:AbortSignal.timeout(14000)});
 assert.equal(get.status,405,'Guest endpoint must reject GET');
 const opt=await fetch(url,{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'POST'},signal:AbortSignal.timeout(14000)});
 assert.equal(opt.status,204,'Guest CORS preflight failed');
 assert.equal(opt.headers.get('access-control-allow-origin'),origin,'Unexpected allowed origin');
 const invalid=await fetch(url,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({action:'verify-code',code:'AAAAAAAAAA'}),signal:AbortSignal.timeout(14000)});
 assert([401,429].includes(invalid.status),'Unknown/unissued code must not be accepted: '+invalid.status);
 const reply=await invalid.json();
 assert(reply.error==='INVALID_CODE'||reply.error==='RATE_LIMITED','Unexpected code validation response');
 assert(!('token' in reply)&&!('identityCode' in reply),'Endpoint must not disclose codes/tokens');
 console.log('PASS guest live: home CTA, fiction-only entry, GET and OPTIONS behavior, invalid code rejected/rate-limited, no code disclosure');
})().catch(e=>{console.error(e);process.exitCode=1});
