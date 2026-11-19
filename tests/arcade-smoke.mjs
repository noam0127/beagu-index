import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const base="https://baeguindex.com";
const api="https://snvzwrexuqavnfvzgxqj.supabase.co/functions/v1/arcade-leaderboard";
const origin={"Origin":base,"Content-Type":"application/json"};
const html=await readFile("index.html","utf8");
const volley=await readFile("teacher-volleyball.html","utf8");
const runner=await readFile("teacher-run.html","utf8");
const shared=await readFile("js/arcade-leaderboard-v1.js","utf8");
const picker=await readFile("js/arcade-school-picker-v1.js","utf8");
const backend=await readFile("supabase/functions/arcade-leaderboard/index.ts","utf8");
for(const h of [volley,runner]){
 const inline=[...h.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
 assert.ok(inline.length>=1,"expected inline game scripts");
 inline.forEach(src=>new Function(src));
}
new Function(shared);
new Function(picker);

// Regression: an abandoned match must not attach its score to the next school.
const mockWindow={};
new Function("window",shared)(mockWindow);
const sessionBoard=new mockWindow.ArcadeLeaderboard("volleyball",null);
let answerStart;
sessionBoard.request=()=>new Promise(resolve=>{answerStart=resolve;});
const pendingSession=sessionBoard.start({eligible:true,school_id:"test-old",school_name:"Old School",difficulty:"easy"});
sessionBoard.cancel();
answerStart({school:{eligible:true},session:"stale-session"});
assert.equal(await pendingSession,null,"stale start must be ignored");
assert.equal(sessionBoard.session,null,"abandoned session must be cleared");
let resolveLoading;
sessionBoard.session="pending-finish";
sessionBoard.load=()=>new Promise(resolve=>{resolveLoading=resolve;});
let promptShown=false;
sessionBoard.openRecord=()=>{promptShown=true;};
const finishing=sessionBoard.finish(150,{player:7,cpu:1});
sessionBoard.cancel();resolveLoading([]);
await finishing;
assert.equal(promptShown,false,"old school record dialog must not reopen");

const pickerWindow={};
new Function("window","clearTimeout",picker)(pickerWindow,()=>{});
const mockPicker={
 timer:null,input:{value:"Old School"},status:{textContent:""},didUnlock:false,didClear:false,didFocus:false,
 setLocked(value){this.didUnlock=value===false;},clear(){this.didClear=true;},focus(){this.didFocus=true;}
};
pickerWindow.ArcadeSchoolPicker.prototype.resetForChange.call(mockPicker);
assert.equal(mockPicker.input.value,"");
assert.ok(mockPicker.didUnlock&&mockPicker.didClear&&mockPicker.didFocus,"reset enables searching another school");
console.log("PASS: cancellation prevents stale school records and unlocks a new school search");

const recordSchool={school_id:"7023456",school_name:"기록초등학교",difficulty:"extreme"};
const recordButton={disabled:false},recordMsg={textContent:""};
function mockRecordBoard(game="volleyball"){
 const board=new mockWindow.ArcadeLeaderboard(game,null);
 board.session="test-session";board.school={...recordSchool};board.score=1200;
 board.stats={player:7,cpu:1,spikes:2};board.draw=()=>{};board.closeDialog=()=>{};
 return board;
}
const uploaded=mockRecordBoard();
uploaded.request=async()=>({ranked:true,rank:2,top10:[{nickname:"EXAMPLE",score:1200,created_at:"2026-11-18T12:00:00Z",school_name:recordSchool.school_name,difficulty:"extreme"}]});
await uploaded.submitName("EXAMPLE",recordButton,recordMsg);
assert.equal(uploaded.session,null);assert.equal(uploaded.remote,true);
assert.match(uploaded.notice,/TOP 2위/);assert.equal(uploaded.board[0].difficulty,"extreme");
const displaced=mockRecordBoard();
displaced.request=async()=>({ranked:false,top10:[]});
await displaced.submitName("EXAMPLE",recordButton,recordMsg);
assert.match(displaced.notice,/TOP 10에서 밀렸/);
const offline=mockRecordBoard("teacher_run");
offline.request=async()=>{throw new Error("network_unavailable");};
await offline.submitName("EXAMPLE",recordButton,recordMsg);
assert.equal(offline.remote,false);assert.match(offline.notice,/이 기기에만 저장됨/);
assert.equal(offline.board[0].school_name,recordSchool.school_name);
const expired=mockRecordBoard();expired.request=async()=>{const e=new Error("session_expired");e.status=409;throw e;};
await expired.submitName("EXAMPLE",recordButton,recordMsg);
assert.match(recordMsg.textContent,/만료되었거나 이미 등록/);assert.equal(expired.session,"test-session");
const duringSave=mockRecordBoard();let respondSave;
duringSave.request=()=>new Promise(resolve=>respondSave=resolve);
const saving=duringSave.submitName("EXAMPLE",recordButton,recordMsg);
duringSave.cancel();duringSave.school={school_id:"7099999",school_name:"다음학교",difficulty:"easy"};duringSave.session="next-session";
respondSave({ranked:true,rank:1,top10:[{nickname:"EXAMPLE",score:1200,created_at:"2026-11-18T12:00:00Z"}]});
await saving;
assert.equal(duringSave.school.school_name,"다음학교");assert.equal(duringSave.session,"next-session");
assert.deepEqual(duringSave.board,[]);
const unqualified=mockRecordBoard();
unqualified.remote=true;unqualified.board=Array.from({length:10},(_,i)=>({nickname:"EXAMPLE",score:1000-i*50}));
unqualified.load=async()=>unqualified.board;unqualified.openRecord=()=>{throw new Error("should not ask for name");};
await unqualified.finish(100,{player:0,cpu:7,spikes:0});
assert.match(unqualified.notice,/TOP 10 진입 실패/);
console.log("PASS: upload success, rank race, offline warning, API expiry, stale async save, below Top10");

assert.match(picker,/2023~2026년/,"school picker explains 2023–2026 reference period");
assert.match(picker,/2026년 배구지수 조사 참여하기/,"school picker links required 2026 survey");
assert.match(backend,/available_years/,"server tracks available surveyed years; empty school gets survey CTA");
assert.match(backend,/years=\[2023,2024,2025,2026\]/);
assert.match(backend,/available_years\.reduce\(\(sum,year\)/,"average only available survey years");
assert.match(backend,/available_years\.length>0/,"one year unlocks games");
assert.match(backend,/average>=80\?"extreme":average>=60\?"very_hard":average>=40\?"hard":average>=20\?"normal":"easy"/,"percentile tiers rise toward Extreme");
assert.match(picker,/difficultyLabels=\{easy:"EASY",normal:"NORMAL",hard:"HARD",very_hard:"VERY HARD",extreme:"EXTREME"\}/,"five English difficulty labels");
assert.match(backend,/!selected\.eligible/,"server refuses missing years");
assert.match(backend,/!currentSchool\?\.eligible/,"previously issued sessions are rechecked");
assert.match(backend,/arcade_game_scores\?on_conflict=session_id&select=created_at/,"unique session key protects record against double submission");
assert.match(backend,/resolution=ignore-duplicates,return=representation/,"only one score per match");
assert.match(backend,/e\.created_at===inserted\[0\]\.created_at/,"same nickname and score do not steal another player's rank");
assert.ok(backend.indexOf('"arcade_game_scores?on_conflict=session_id&select=created_at"')<backend.indexOf('const patchQ=new URLSearchParams({id:"eq."+session.id,submitted_at:"is.null"})'),"score persists before session completion marker");

assert.match(volley,/new window\.ArcadeSchoolPicker/);
assert.match(runner,/new window\.ArcadeSchoolPicker/);
assert.match(runner,/difficultyProfiles=\{/,"survival game defines five hero/enemy profiles");
assert.match(volley,/battleProfiles=\{/,"volleyball defines five ally/CPU profiles");
assert.match(shared,/arcade-rank-school/);
assert.match(html,/id="teacher-game-title">🏐 선생님배구 1\.0<\/h2>/,"volleyball homepage title should show 1.0");
assert.match(html,/id="teacher-run-title">🎒 험난한 교직생활 3\.0<\/h2>/,"teacher-run homepage title should show 3.0");
assert.match(volley,/<title>선생님배구 1\.0 \| 배구지수<\/title>/);
assert.match(runner,/<title>험난한 교직생활 3\.0 \| 배구지수<\/title>/);
assert.doesNotMatch(html,/험난한 교직생활 2\.0|선생님배구(?! 1\.0)/,"old game titles removed from home");
assert.doesNotMatch(runner,/험난한 교직생활 2\.0/,"old teacher-run title removed");
assert.ok(html.indexOf('id="teacher-game-frame"')<html.indexOf('id="teacher-run-frame"'));
assert.match(volley,/SPEED_MULTIPLIER=2/);
assert.match(volley,/AUTO_SPIKE_SPEED=8/,"automatic spike requires fast movement");
assert.match(volley,/impactSpeed >= AUTO_SPIKE_SPEED/,"contact fires automatic spike");
assert.doesNotMatch(volley,/data-key="spike"/,"separate spike button removed");
assert.doesNotMatch(volley,/keys\.spike/,"manual spike input removed");

assert.match(volley,/R = 48;/,"volleyball radius enlarged 1.5x from 32 to 48");
assert.match(volley,/NET_TOP = 354/,"net height reduced from 146 to 97");
assert.match(volley,/43 \* \.75 \* battle\.allyReach/,"baseline reach is tier-adjusted");
assert.doesNotMatch(volley,/data-key="jump"/,"touch jump button removed");
assert.doesNotMatch(volley,/class="touch"/,"empty touch control region removed");
assert.match(volley,/touchControl\.targetY/,"volleyball touch flight has vertical axis");
assert.match(volley,/flyingStep|flightStep/,"volleyball flight movement is implemented");
assert.match(runner,/pointerY=target\.y/,"survival game tracks 2D touch target");
assert.match(runner,/player\.y\+=Math\.sign\(dy\)/,"survival game flies vertically");
assert.match(runner,/enemySize:1\.28/,"extreme hazards have larger collision size");
assert.match(runner,/profile\.homing\*dt/,"harder hazards track the player");
assert.match(runner,/profile\.heroSpeed/,"hero mobility scales by difficulty");
assert.match(runner,/profile\.startingLife/,"hero starting health scales by difficulty");
assert.match(volley,/enemyJumpChance/,"AI jump probability scales by tier");
assert.match(volley,/enemySmashChance/,"AI attack strength scales by tier");
assert.match(volley,/battle\.allySpeed/,"player mobility scales by tier");
assert.match(picker,/resetForChange/,"school selection can reset");
assert.match(picker,/onRequestChange/,"school change signals game to stop");
assert.match(shared,/cancel\(\)/,"rank session can be discarded safely");
assert.match(volley,/schoolPicker\.onRequestChange=stopForSchoolChange/);
assert.match(runner,/schoolPicker\.onRequestChange=stopAndChangeSchool/);
assert.match(runner,/🏫 다른 학교로 변경/,"survival pause offers school switch");
assert.doesNotMatch(runner,/id="dash"|id="left"|id="right"/,"no mobile movement buttons remain");
assert.doesNotMatch(runner,/activateDash|skill\.dash/,"no hidden dash mechanics remain");
assert.match(volley,/ranking\?\.finish/);
assert.match(runner,/ranking\?\.finish/);
console.log("PASS: home order, game scripts, score hooks, 2x controls");

 // The school search must lead both embedded games, directly above score / health HUDs.
const mainVolley=volley.slice(volley.indexOf('<main class="game-shell">'),volley.indexOf('</main>'));
const mainRun=runner.slice(runner.indexOf('<main id="teacher-run-protected"'),runner.indexOf('</main>'));
assert.match(mainVolley,/^<main class="game-shell">\s*<section id="arcade-school-picker"/,"volleyball school selection must be the first control");
assert.match(mainRun,/^<main id="teacher-run-protected" class="shell" hidden>\s*<section id="arcade-school-picker"/,"survival school selection must be the first control");
assert.ok(mainVolley.indexOf('id="arcade-school-picker"')<mainVolley.indexOf('class="scoreboard"'),"volleyball picker above HP and score");
assert.ok(mainRun.indexOf('id="arcade-school-picker"')<mainRun.indexOf('class="hud"'),"run picker above day and HP");
assert.equal((mainVolley.match(/id="arcade-school-picker"/g)||[]).length,1);
assert.equal((mainRun.match(/id="arcade-school-picker"/g)||[]).length,1);
assert.doesNotMatch(mainVolley,/class="top"|7 PTS|beagu-brand-mark/,"volleyball duplicate game logo and label removed");
assert.doesNotMatch(mainRun,/class="top"|ARCADE · LIFE|beagu-brand-mark/,"run duplicate game header removed");
assert.doesNotMatch(html,/<details class="teacher-game-details"|게임 펼치기 · 접기/,"home game no longer has unnecessary fold text");
assert.match(html,/id="teacher-game-title">🏐 선생님배구 1\.0<\/h2>/,"outer game name remains");
assert.match(html,/id="teacher-run-title">🎒 험난한 교직생활 3\.0<\/h2>/,"outer run name remains");
assert.match(html,/id="teacher-run-home-lock"/,"LV1 game gate is preserved");
assert.match(picker,/this\.guide=make\("p","arcade-school-brief-note","학교를 선택해주세요\. 배구지수 자료가 없는 학교는 2026 조사에 참여해야 진행이 가능합니다\."/);
assert.match(picker,/this\.mount\.append\(heading,this\.input,this\.guide,this\.changeButton/,"small help directly follows the school input");
assert.match(picker,/aria-describedby/,"school search is accessible");
console.log("PASS: school selection first, note under input, blue-struck duplicate labels removed");


// HP, lives, double-touch and time bonus contract.
const runProfilesMatch=runner.match(/const difficultyProfiles=(\{[\s\S]*?\n\s*\});/);
const volleyProfilesMatch=volley.match(/const energyProfiles=(\{[\s\S]*?\n\s*\});/);
const volleySpecialMatch=volley.match(/const specialProfiles=(\{[\s\S]*?\n\s*\});/);
assert.ok(runProfilesMatch&&volleyProfilesMatch&&volleySpecialMatch,"five tier profiles exist");
const parseProfile=match=>new Function("return "+match[1])();
const runProfiles=parseProfile(runProfilesMatch),energyProfiles=parseProfile(volleyProfilesMatch),specialProfiles=parseProfile(volleySpecialMatch);
const tiers=["easy","normal","hard","very_hard","extreme"];
for(let i=0;i<tiers.length;i++){
 const t=tiers[i];
 assert.ok(runProfiles[t]&&energyProfiles[t]&&specialProfiles[t],"tier "+t+" has HP/life/special definition");
 if(i>0){
  const prior=tiers[i-1];
  assert.ok(runProfiles[t].startingLife<runProfiles[prior].startingLife,"harder tier has less starting HP");
  assert.ok(runProfiles[t].lives<=runProfiles[prior].lives,"harder tier cannot gain extra lives");
  assert.ok(runProfiles[t].specialCooldown>runProfiles[prior].specialCooldown,"harder tier has longer special cooldown");
  assert.ok(energyProfiles[t].allyMax<energyProfiles[prior].allyMax,"harder tier has less ally stamina");
  assert.ok(energyProfiles[t].enemyMax>energyProfiles[prior].enemyMax,"harder tier has more CPU stamina");
  assert.ok(specialProfiles[t].cooldown>specialProfiles[prior].cooldown,"harder tier has longer super spike cooldown");
 }
}
assert.match(volley,/id="player-energy-progress"/);
assert.match(volley,/id="cpu-energy-progress"/);
assert.match(runner,/id="run-health-progress"/);
assert.match(runner,/id="run-lives"/);
assert.match(volley,/function activateSuperSpike\(\)/);
assert.match(runner,/function activateSpecial\(\)/);
assert.match(volley,/now-lastTapAt<=320/);
assert.match(runner,/now-lastTapAt<=320/);
assert.match(volley,/state\.playFrames\+\+/,"time counted during live play only");
assert.match(volley,/Math\.min\(900,getSurvivalSeconds\(\)\*4\)/,"volleyball survival bonus capped");
assert.match(runner,/const survivalBonus=survivalSeconds\*10/,"survival run score includes time explicitly");
assert.doesNotMatch(runner,/score\+=dt\*9/,"run survival time is counted once");
assert.doesNotMatch(picker,/arcade-school-guide/,"long school selector description removed");
assert.match(picker,/🏫 학교 선택/,"short school heading");
assert.match(backend,/function validatedSurvivalSeconds/);
assert.match(backend,/invalid_survival_time/);
assert.match(backend,/invalid_time_bonus/);
// Run the actual server's pure score functions with TypeScript annotations removed.
const scoring=backend.slice(backend.indexOf("function validatedSurvivalSeconds"),backend.indexOf("Deno.serve("));
assert.ok(scoring.startsWith("function validatedSurvivalSeconds"));
const javascript=scoring.replace(/:\s*(?:any|number)/g,"");
const scoreFns=new Function("int",javascript+"\nreturn {scoreFromVolleyball,scoreFromRun};")(
 (v,min,max)=>typeof v==="number"&&Number.isInteger(v)&&v>=min&&v<=max
);
const vBase=7*120+2*25+600+(7-3)*30;
assert.equal(scoreFns.scoreFromVolleyball({player:7,cpu:3,spikes:2,survivalSeconds:90},100),vBase+360);
assert.equal(scoreFns.scoreFromVolleyball({player:7,cpu:3,spikes:2,survivalSeconds:400},410),vBase+900);
assert.equal(scoreFns.scoreFromVolleyball({player:7,cpu:3,spikes:2},100),vBase,"legacy clients are compatible");
assert.throws(()=>scoreFns.scoreFromVolleyball({player:7,cpu:3,spikes:2,survivalSeconds:90},50),/invalid_survival_time/);
assert.equal(scoreFns.scoreFromRun({score:1380,baseScore:420,survivalSeconds:96,day:4,victory:false},120),1380);
assert.throws(()=>scoreFns.scoreFromRun({score:1381,baseScore:420,survivalSeconds:96,day:4,victory:false},120),/invalid_time_bonus/);
assert.throws(()=>scoreFns.scoreFromRun({score:1380,baseScore:420,survivalSeconds:96,day:4,victory:false},40),/invalid_survival_time/);
assert.equal(scoreFns.scoreFromRun({score:1500,day:3,victory:false},100),1500,"cached legacy game supported");
console.log("PASS: tier HP, lives, double-tap, concise UI, both time bonus formulas and tamper rejection");


const timeout=(ms=12000)=>AbortSignal.timeout(ms);
async function requestWithRetry(url,expected=200,options={},times=3){
 for(let i=0;i<times;i++){
  try{
   const r=await fetch(url,{...options,signal:timeout()});
   const body=await r.text();
   if(r.status===expected)return {response:r,body};
   if(i===times-1)throw new Error(url+" -> HTTP "+r.status+": "+body.slice(0,220));
  }catch(e){
   if(i===times-1)throw e;
  }
  await new Promise(resolve=>setTimeout(resolve,2500));
 }
}
// Pages deployment and the smoke workflow run in parallel: poll until the
// published home matches this commit instead of failing on the previous build.
async function waitForPublishedHome() {
 for(let attempt=0;attempt<20;attempt++){
  const site=await requestWithRetry(base+"/",200,{},3);
  if(site.body.includes("teacher-volleyball.html?v=20261119-picker-top1")&&
     site.body.includes("teacher-run.html?v=20261119-picker-top1"))return site;
  await new Promise(resolve=>setTimeout(resolve,8000));
 }
 throw new Error("Published game iframe versions did not update");
}
const [site,topVolley,topRun]=await Promise.all([
 waitForPublishedHome(),
 requestWithRetry(api+"?game=volleyball",200,{headers:origin}),
 requestWithRetry(api+"?game=teacher_run",200,{headers:origin})
]);
assert.match(site.body,/teacher-volleyball\.html\?v=20261119-picker-top1/);
assert.match(site.body,/teacher-run\.html\?v=20261119-picker-top1/);
for(const response of [topVolley,topRun]){
 const parsed=JSON.parse(response.body);
 assert.ok(Array.isArray(parsed.top10));
 assert.ok(parsed.top10.length<=10);
 for(const row of parsed.top10){
  assert.match(row.nickname,/^[A-Z]{2,8}$/);
  assert.ok(Number.isInteger(row.score)&&row.score>0);
 }
}
console.log("PASS: deployed home and live shared Top 10 for both games");

// Public school search returns canonical name and region, but never raw percentiles.
const searched=await requestWithRetry(api+"?schools="+encodeURIComponent("거제"),200,{headers:origin});
const schools=JSON.parse(searched.body).schools;
assert.ok(schools.length>0,"school search must return real elementary schools");
assert.ok(schools.every(s=>typeof s.school_id==="string" && typeof s.school_name==="string"));
const canonical=schools[0];
const lookup=await requestWithRetry(api+"?school_id="+encodeURIComponent(canonical.school_id),200,{headers:origin});
const school=JSON.parse(lookup.body).school;
assert.equal(school.school_name,canonical.school_name);
assert.equal(typeof school.eligible,"boolean");
assert.ok(Array.isArray(school.missing_years));
assert.ok(Array.isArray(school.available_years));
assert.equal(school.available_years.length>0,school.eligible,"any one surveyed year must be eligible");
assert.equal(school.available_years.length+school.missing_years.length,4);
assert.equal("national_percentile" in school,false,"never return individual raw percentiles");
assert.equal("average_percentile" in school,false,"do not leak potentially sensitive average values");
if(school.eligible){
 assert.ok(["easy","normal","hard","very_hard","extreme"].includes(school.difficulty));
 const start=await requestWithRetry(api,200,{
  method:"POST",headers:origin,
  body:JSON.stringify({action:"start",game:"volleyball",school_id:school.school_id})
 });
 const started=JSON.parse(start.body);
 assert.equal(started.school.eligible,true);
 assert.equal(started.school.school_id,school.school_id);
 assert.equal(started.school.difficulty,school.difficulty);
 assert.match(started.session,/^[0-9a-f-]{36}$/i);
 const invalid=await requestWithRetry(api,400,{
  method:"POST",headers:origin,
  body:JSON.stringify({action:"submit",game:"volleyball",session:started.session,nickname:"123",stats:{player:7,cpu:0,spikes:0}})
 });
 assert.equal(JSON.parse(invalid.body).error,"invalid_name");
 console.log("PASS: eligible four-year school session and nickname validation");
}else{
 assert.equal(school.difficulty,null,"no provisional middle-tier fallback");
 const refused=await requestWithRetry(api,409,{
  method:"POST",headers:origin,
  body:JSON.stringify({action:"start",game:"volleyball",school_id:school.school_id})
 });
 const failed=JSON.parse(refused.body);
 assert.equal(failed.error,"school_ineligible");
 assert.deepEqual(failed.missing_years,school.missing_years);
 console.log("PASS: four-year survey requirement blocks ineligible school");
}
console.log("PASS: school search and any-year percentile eligibility (no raw values)");
// Verify a one-year school is eligible, and a four-year-zero school is refused.
const oneYear=JSON.parse((await requestWithRetry(api+"?school_id=7021086",200,{headers:origin})).body).school;
assert.equal(oneYear.eligible,true,"one-year school should play");
assert.deepEqual(oneYear.available_years,[2024],"2024-only school is grounded");
assert.ok(["easy","normal","hard","very_hard","extreme"].includes(oneYear.difficulty));
const oneStart=JSON.parse((await requestWithRetry(api,200,{
 method:"POST",headers:origin,body:JSON.stringify({action:"start",game:"volleyball",school_id:oneYear.school_id})
})).body);
assert.equal(oneStart.school.eligible,true);
assert.match(oneStart.session,/^[0-9a-f-]{36}$/i);
const zeroYear=JSON.parse((await requestWithRetry(api+"?school_id=7003849",200,{headers:origin})).body).school;
assert.equal(zeroYear.eligible,false,"zero-year school should not play");
assert.deepEqual(zeroYear.available_years,[]);
const zeroDenied=JSON.parse((await requestWithRetry(api,409,{
 method:"POST",headers:origin,body:JSON.stringify({action:"start",game:"teacher_run",school_id:zeroYear.school_id})
})).body);
assert.equal(zeroDenied.error,"school_ineligible");
assert.equal(zeroDenied.survey_url,"https://forms.gle/TPyCakK6Sj2zchRy7");
console.log("PASS: single surveyed year unlocks both games; no years requires 2026 survey");

