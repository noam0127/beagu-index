/* Production guest-code endpoint smoke test. Never read or print any real code. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const url='https://snvzwrexuqavnfvzgxqj.supabase.co/functions/v1/class-diary-guest-access-v1';
const origin='https://baeguindex.com';
const home=fs.readFileSync('index.html','utf8');
const play=fs.readFileSync('teacher-class-diary-play.html','utf8');
const homeClient=fs.readFileSync('js/class-diary-home-entry-v1.js','utf8');
const edge=fs.readFileSync('supabase/functions/class-diary-guest-access-v1/index.ts','utf8');
assert(!home.includes('id="homeDiaryGuestForm"'),'No public developer preview form while preparing');
assert(!home.includes('id="homeDiaryCode"'),'No homepage code input');
assert(!home.includes('id="homeDiaryLv2Form"'),'No homepage Lv.2 entry form');
assert(!home.includes('src="js/class-diary-home-entry-v1.js'),'No auth script for removed homepage forms');
assert(home.includes('🌸 현재 준비 중입니다'),'Homepage must prominently announce preparation');
assert(!home.includes('href="teacher-class-diary-play.html?guest=1"'),'Home may not bypass server verification with a public link');
assert(homeClient.includes("action:'verify-code'"),'Home must verify codes server-side');
assert(homeClient.includes("sessionStorage.setItem(KEY,result.ticket)"),'Home may transfer only the signed ticket');
assert(!homeClient.includes('sessionStorage.setItem(KEY,code)'),'Identity code may never be saved');
assert(play.includes("params.get('guest')==='1'"),'Guest requires explicit entry mode');
assert(play.includes("show('guestAccess')"),'Guest must verify ticket before the game');
assert(!play.includes('id="guestCode"'),'Guest game must not ask for the code again');
assert(play.includes("action:'verify-ticket'"),'Guest ticket must be server-verified');
assert(play.includes("sessionStorage.removeItem(handoffKey)"),'Ticket must be consumed');
assert(play.includes("result.scope!=='class-diary-fictional-guest'"),'Guest scope guard missing');
assert(!play.includes('sessionStorage.setItem('),'Game must not save code or game state');
assert(edge.includes("crypto.subtle.verify('HMAC'"),'Ticket must have an unforgeable MAC');
assert(/await issueTicket\(PREVIEW_SUBJECT\)/.test(edge),'Server-approved preview PIN must issue a scoped signed ticket for private saves');
assert(edge.includes("CLASS_DIARY_PREVIEW_PIN"),'PIN must come from a server-side setting');
assert(!edge.includes("beagu_class_diary_progress_subject"),'Legacy challenge codes must not grant preview access');
assert(!edge.includes("grant_level2"),'Guest route must not elevate any tier');

(async()=>{
 const get=await fetch(url,{method:'GET',headers:{Origin:origin},signal:AbortSignal.timeout(14000)});
 assert.equal(get.status,405,'Guest endpoint must reject GET');
 const opt=await fetch(url,{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'POST'},signal:AbortSignal.timeout(14000)});
 assert.equal(opt.status,204,'Guest CORS preflight failed');
 assert.equal(opt.headers.get('access-control-allow-origin'),origin,'Unexpected allowed origin');
 const invalid=await fetch(url,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({action:'verify-code',code:'AAAAAAAAAA'}),signal:AbortSignal.timeout(14000)});
 assert([401,429].includes(invalid.status),'Unknown/unissued code must not be accepted: '+invalid.status);
 const noLevel2=await fetch(url,{method:'POST',
   headers:{Origin:origin,'Content-Type':'application/json'},
   body:JSON.stringify({action:'verify-lv2',schoolId:'A123456'}),
   signal:AbortSignal.timeout(14000)});
 assert.equal(noLevel2.status,403,'Missing Lv2 session must not issue a story ticket');
 const noLevel2Body=await noLevel2.json();
 assert.equal(noLevel2Body.error,'LV2_REQUIRED');
 assert(!('ticket' in noLevel2Body),'Unauthenticated users receive no ticket');
 const badTicket=await fetch(url,{method:'POST',
   headers:{Origin:origin,'Content-Type':'application/json'},
   body:JSON.stringify({action:'verify-ticket',ticket:'v1.invalid.invalid'}),
   signal:AbortSignal.timeout(14000)});
 assert.equal(badTicket.status,401,'Tampered or fabricated guest ticket must be rejected');
 const ticketReply=await badTicket.json();
 assert.equal(ticketReply.error,'INVALID_TICKET');
 const reply=await invalid.json();
 assert(reply.error==='INVALID_CODE'||reply.error==='RATE_LIMITED','Unexpected code validation response');
 assert(!('token' in reply)&&!('identityCode' in reply),'Endpoint must not disclose codes/tokens');
 console.log('PASS guest live: public home coming soon with no code forms; internal signed handoff, GET/CORS, unknown codes/tickets rejected');
})().catch(e=>{console.error(e);process.exitCode=1});
