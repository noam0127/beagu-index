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

const fullscreenSource=await readFile("js/arcade-fullscreen-v1.js","utf8");
const fullscreenCSS=await readFile("styles/arcade-fullscreen-v1.css","utf8");
const gameGate=await readFile("js/beagu-game-lv1-gate-v1.js","utf8");
new Function(fullscreenSource);
new Function(gameGate);
for (const game of [volley,runner]) {
 assert.match(game,/data-arcade-fullscreen/,"game has a fullscreen-only viewport");
 assert.match(game,/data-arcade-fullscreen-button/,"viewport contains a fullscreen toggle");
 assert.match(game,/js\/arcade-fullscreen-v1\.js/,"game loads its fullscreen behavior");
}
assert.match(fullscreenCSS,/:fullscreen canvas/,"fullscreen scales the gameplay canvas");
assert.match(fullscreenCSS,/100dvh/,"fullscreen uses actual viewport height");
assert.match(volley,/id="volley-ready-overlay"/,"volleyball start overlay appears inside the court");
assert.match(volley,/<h2 id="volley-ready-title">학교를 선택하세요<\/h2>/,"start card has its own heading");
assert.doesNotMatch(volley,/위의 학교 검색창에서 선택/,"obsolete instruction removed");
assert.match(volley,/▶ 이 학교로 시작하기/,"school CTA switches after eligible selection");
assert.match(volley,/if\(schoolPicker\.get\(\)\?\.eligible===true\)\{void startMatch\(\);return;\}/,
 "selected school starts the match without reopening selection");
assert.match(html,/id="teacher-run-home-code"/,"homepage provides an in-place game authentication code field");
assert.match(runner,/id="teacher-run-code"/,"standalone survival game provides an in-place code field");
assert.match(html,/data-game-lv1-form/);
assert.match(runner,/data-game-lv1-form/);
assert.doesNotMatch(runner,/<a href="search\.html">Lv\.1 인증하기<\/a>/,"standalone auth does not navigate");
assert.match(gameGate,/JSON\.stringify\(\{action:'login',code\}\)/,"in-place form checks codes on the existing server");
assert.match(gameGate,/sessionStorage\.setItem\(sessionKey, data\.token\)/,"only the server session token persists");
assert.match(gameGate,/window\.dispatchEvent\(new Event\('beagu:level-state-change'\)\)/,
 "successful inline authentication refreshes game visibility");

{
 // A mobile Safari mock rejects the native Fullscreen API. CSS fallback must work.
 const listeners={};const buttonHandlers={};const states=new Set();
 const button={setAttribute(){},addEventListener(name,handler){buttonHandlers[name]=handler;}};
 const area={
  querySelector(){return button;},
  classList:{toggle(name,on){if(on)states.add(name);else states.delete(name);}},
  async requestFullscreen(){throw new Error("iOS native canvas fullscreen unavailable");}
 };
 const doc={
  fullscreenElement:null,querySelector(){return area;},
  documentElement:{classList:{toggle(){}}},
  addEventListener(name,handler){listeners[name]=handler;}
 };
 const win={
  parent:null,location:{origin:base},
  addEventListener(name,handler){listeners[name]=handler;},
  dispatchEvent(){}
 };
 win.parent=win;
 new Function("window","document","Event",fullscreenSource)(win,doc,class MockEvent{});
 const initialIcon=button.innerHTML;
 assert.match(initialIcon,/<svg /,"fullscreen uses SVG icon");
 buttonHandlers.click();await new Promise(resolve=>setImmediate(resolve));
 assert.match(button.innerHTML,/<svg /);
 assert.notEqual(button.innerHTML,initialIcon,"expand icon changes");
 assert.ok(states.has("arcade-fullscreen-fallback"),"the game stage becomes fixed fullscreen");
 buttonHandlers.click();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(button.innerHTML,initialIcon,"shrink restores original icon");
 assert.ok(!states.has("arcade-fullscreen-fallback"));
}
{
 // Homepage iframes request host expansion without destroying the ongoing iframe.
 const listeners={};const handlers={};const messages=[];const areaStates=new Set();
 const button={setAttribute(){},addEventListener(name,handler){handlers[name]=handler;}};
 const area={
  querySelector(){return button;},
  classList:{toggle(name,on){on?areaStates.add(name):areaStates.delete(name);}}
 };
 const doc={
  fullscreenElement:null,documentElement:{classList:{toggle(){}}},
  querySelector(){return area;},addEventListener(name,handler){listeners[name]=handler;}
 };
 let parent;
 parent={
  location:{origin:base},
  postMessage(data,origin){
   assert.equal(origin,base);messages.push(data);
   listeners.message({source:parent,origin:base,data:{type:"arcade:fullscreen-state",active:data.active}});
  }
 };
 const win={parent,location:{origin:base},addEventListener(name,fn){listeners[name]=fn;},dispatchEvent(){}};
 new Function("window","document","Event",fullscreenSource)(win,doc,class MockEvent{});
 const embeddedIcon=button.innerHTML;
 assert.match(embeddedIcon,/<svg /);
 handlers.click();
 assert.equal(messages.at(-1).active,true);
 assert.ok(areaStates.has("arcade-fullscreen-fallback"));
 assert.match(button.innerHTML,/<svg /);
 assert.notEqual(button.innerHTML,embeddedIcon);
 handlers.click();
 assert.equal(messages.at(-1).active,false);
 assert.ok(!areaStates.has("arcade-fullscreen-fallback"));
 assert.equal(button.innerHTML,embeddedIcon);
}
const hostFullscreenScript=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
 .map(match=>match[1]).find(src=>src.includes("arcade:fullscreen-request"));
assert.ok(hostFullscreenScript,"homepage iframe host expansion is installed");
new Function(hostFullscreenScript);
assert.match(hostFullscreenScript,/frame\.closest\("\.teacher-game-feature"\)/,
 "host expands the existing game section instead of replacing its iframe");
assert.match(hostFullscreenScript,/event\.source===frame\.contentWindow/,
 "only messages from known arcade iframes are accepted");
assert.match(fullscreenCSS,/\.arcade-game-viewport\.arcade-fullscreen-fallback/,
 "a fixed viewport is available when browser Fullscreen API is blocked");
assert.match(fullscreenCSS,/contain:none!important/,
 "the arcade cabinet CSS contain property cannot trap fixed fullscreen");

console.log("PASS: game-only fullscreen controls, unified volleyball picker, and inline Lv.1 game auth");

// Anonymous automatic leaderboard: no dialog, no typed nickname, and no stale session.
const mockWindow={};
new Function("window",shared)(mockWindow);
const sessionBoard=new mockWindow.ArcadeLeaderboard("volleyball_25",null);
let answerStart;
sessionBoard.request=()=>new Promise(resolve=>{answerStart=resolve;});
const pendingSession=sessionBoard.start({eligible:true,school_id:"test-old",school_name:"Old School",difficulty:"easy"});
sessionBoard.cancel();
answerStart({school:{eligible:true},session:"stale-session"});
assert.equal(await pendingSession,null);
assert.equal(sessionBoard.session,null);
sessionBoard.session="pending-finish";
let resolveSubmission,submits=0;
sessionBoard.request=async(_method,payload)=>{
 submits++;
 assert.equal(payload.session,"pending-finish");
 return new Promise(resolve=>{resolveSubmission=resolve;});
};
const finishing=sessionBoard.finish(150,{player:25,cpu:7,elapsedTenths:150});
assert.equal(submits,1,"a finished match starts saving before a user can restart");
sessionBoard.cancel();
resolveSubmission({ranked:true,rank:1,top10:[{score:150,school_name:"기록초등학교"}]});
await finishing;
assert.equal(submits,1,"immediately replaying cannot cancel the submitted result");
assert.equal(sessionBoard.board.length,0,"old response cannot replace the next game's ranking");
const pickerWindow={};
new Function("window","clearTimeout",picker)(pickerWindow,()=>{});
const mockPicker={
 timer:null,input:{value:"Old School"},status:{textContent:""},didUnlock:false,didClear:false,didFocus:false,
 setLocked(value){this.didUnlock=value===false;},clear(){this.didClear=true;},focus(){this.didFocus=true;}
};
pickerWindow.ArcadeSchoolPicker.prototype.resetForChange.call(mockPicker);
assert.equal(mockPicker.input.value,"");
assert.ok(mockPicker.didUnlock&&mockPicker.didClear&&mockPicker.didFocus);
console.log("PASS: session cancellation prevents stale anonymous records and resets school search");

const recordSchool={school_id:"7023456",school_name:"기록초등학교",difficulty:"extreme"};
function mockRecordBoard(game="volleyball_25"){
 const board=new mockWindow.ArcadeLeaderboard(game,null);
 board.session="test-session";board.school={...recordSchool};
 board.load=async()=>{board.remote=true;board.board=[];return [];};
 return board;
}
const uploaded=mockRecordBoard();let requestPayload;
uploaded.request=async(_method,payload)=>{
 requestPayload=payload;
 return {ranked:true,rank:2,top10:[{score:1200,created_at:"2026-11-18T12:00:00Z",school_name:recordSchool.school_name,difficulty:"extreme"}]};
};
await uploaded.finish(1200,{player:25,cpu:7,elapsedTenths:1200});
assert.equal(uploaded.session,null);assert.equal(uploaded.remote,true);
assert.match(uploaded.notice,/2위/);assert.equal(uploaded.board[0].difficulty,"extreme");
assert.equal(requestPayload.action,"submit");
assert.equal("nickname" in requestPayload,false,"no user-entered identifiers sent");
const displaced=mockRecordBoard();
displaced.request=async()=>({ranked:false,top10:[]});
await displaced.finish(1200,{player:25,cpu:7,elapsedTenths:1200});
assert.match(displaced.notice,/역대 상위 100위 안에 기록됨/);
const offline=mockRecordBoard("teacher_run_retirement");
offline.request=async()=>{throw new Error("network_unavailable");};
await offline.finish(1200,{score:1200,baseScore:1200,survivalSeconds:80,age:40,victory:false});
assert.match(offline.notice,/저장하지 못했습니다/);
const expired=mockRecordBoard();
expired.request=async()=>{const e=new Error("session_expired");e.status=409;throw e;};
await expired.finish(1200,{player:25,cpu:7,elapsedTenths:1200});
assert.match(expired.notice,/만료/);
const duringSave=mockRecordBoard();let respondSave,enteredRequest;
const savingStarted=new Promise(resolve=>{enteredRequest=resolve;});
duringSave.request=()=>{enteredRequest();return new Promise(resolve=>{respondSave=resolve;});};
const saving=duringSave.finish(1200,{player:25,cpu:7,elapsedTenths:1200});
await savingStarted;
duringSave.cancel();duringSave.school={school_id:"7099999",school_name:"다음학교",difficulty:"easy"};duringSave.session="next-session";
respondSave({ranked:true,rank:1,top10:[{score:1200,created_at:"2026-11-18T12:00:00Z"}]});
await saving;
assert.equal(duringSave.school.school_name,"다음학교");assert.equal(duringSave.session,"next-session");
assert.deepEqual(duringSave.board,[]);
const unqualified=mockRecordBoard("teacher_run_retirement");
unqualified.remote=true;
unqualified.board=Array.from({length:10},(_,i)=>({score:5000-i*100}));
unqualified.load=async()=>unqualified.board;
let autoUploadedLow=0;
unqualified.request=async()=>{autoUploadedLow++;return {ranked:false,top10:unqualified.board};};
await unqualified.finish(610,{score:610,baseScore:610,survivalSeconds:10,age:26,victory:false});
assert.equal(autoUploadedLow,1,"retirement results below TOP10 are auto-saved");
assert.match(unqualified.notice,/역대 상위 100위 안에 기록됨/);
const offBoard=mockRecordBoard("teacher_run_retirement");
offBoard.request=async()=>({ranked:false,recorded:false,top10:[]});
await offBoard.finish(3,{score:3,baseScore:3,survivalSeconds:2,age:24,victory:false});
assert.match(offBoard.notice,/상위 100위 밖.*기록 미등록/);
assert.doesNotMatch(shared,/submitName|openRecord|dialogElement|ENTER YOUR NAME|input\.maxLength/);
assert.match(shared,/localStorage\.removeItem\("arcade-last-name-v1"\)/,"wipe prior typed names on visitors' devices");
assert.match(shared,/\.sort\(\(a,b\)=>b\.score-a\.score/);
console.log("PASS: automatic anonymous saves even below TOP10, failure warnings and safe quick-replay delivery");

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
assert.match(backend,/arcade_game_scores\?on_conflict=session_id&select=id,created_at/,"unique session key protects record against double submission");
assert.match(backend,/resolution=ignore-duplicates,return=representation/,"only one score per match");
assert.match(backend,/e\.created_at===inserted\[0\]\.created_at/,"anonymous timestamp and score identify new record placement");
assert.match(backend,/nickname_not_supported/,"API rejects user-entered nicknames");
assert.doesNotMatch(backend,/nickname:"ANON"|select:"nickname/,"API neither stores nor exposes nicknames");
assert.doesNotMatch(backend,/existing\.length>=10&&score<=existing\[9\]\.score/,"all games save finished results below TOP10");
assert.ok(backend.indexOf('"arcade_game_scores?on_conflict=session_id&select=id,created_at"')<backend.indexOf('const patchQ=new URLSearchParams({id:"eq."+session.id,submitted_at:"is.null"})'),"score persists before session completion marker");

assert.match(volley,/new window\.ArcadeSchoolPicker/);
assert.match(runner,/new window\.ArcadeSchoolPicker/);
assert.match(runner,/difficultyProfiles=\{/,"survival game defines five hero/enemy profiles");
assert.match(volley,/battleProfiles=\{/,"volleyball defines five ally/CPU profiles");
assert.match(shared,/arcade-rank-school/);
assert.doesNotMatch(shared,/ENTER YOUR NAME|nickname:/,"no player names in leaderboard client");
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
assert.match(volley,/NET_TOP = 342/,"net rises from 97px to 109px");
assert.match(volley,/43\s*\*\s*\.75\s*\*\s*battle\.allyReach/,"forearm reach remains tier-adjusted");
assert.doesNotMatch(volley,/data-key="jump"/,"touch jump button removed");
assert.doesNotMatch(volley,/class="touch"/,"empty touch control region removed");
assert.match(volley,/touchControl\.targetY/,"volleyball touch flight has vertical axis");
assert.match(volley,/flyingStep|flightStep/,"volleyball flight movement is implemented");
assert.match(runner,/pointerY=target\.y/,"survival game tracks 2D touch target");
assert.match(runner,/if\(canPlayerRise\(\)\)player\.y\+=Math\.sign\(dy\)/,"survival game flies vertically except EXTREME");
assert.match(runner,/extreme:[^\n]*enemySize:0\.78/,"extreme uses smaller hazards");
assert.match(runner,/function updatePatternHazards\(dt\)/,"survival wave hazards remain active");
assert.match(runner,/trackSpeed\*dt/,"career-stage tracking hazards follow the player");
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
assert.match(volley,/id="volley-pause-overlay"/);
assert.match(volley,/id="volley-go-first"/);
assert.match(volley,/id="volley-change-school"/);
assert.match(volley,/const saved=await finishMatch\(true\)/);
assert.match(runner,/const saved=await ranking\?\.finish\(rawScore/);
assert.match(runner,/if\(saved!==true\)/);
assert.match(volley,/name:i===0\?"동료":"관리자"/);
assert.doesNotMatch(volley,/textLabel\("분신"/);
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


// Independent new game rules preserve the retired score contracts for old sessions.
const runProfilesMatch=runner.match(/const difficultyProfiles=(\{[\s\S]*?\n\s*\});/);
const volleySpecialMatch=volley.match(/const specialProfiles=(\{[\s\S]*?\n\s*\});/);
assert.ok(runProfilesMatch&&volleySpecialMatch,"five-tier profiles");
const parseProfile=match=>new Function("return "+match[1])();
const runProfiles=parseProfile(runProfilesMatch),specialProfiles=parseProfile(volleySpecialMatch);
const tiers=["easy","normal","hard","very_hard","extreme"];
for(let i=0;i<tiers.length;i++){
 const level=tiers[i];assert.ok(runProfiles[level]&&specialProfiles[level]);
 if(i){
  assert.ok(runProfiles[level].startingLife<runProfiles[tiers[i-1]].startingLife);
  assert.ok(specialProfiles[level].cooldown>specialProfiles[tiers[i-1]].cooldown);
 }
}
assert.doesNotMatch(volley,/id="player-energy-progress"|id="cpu-energy-progress"|id="volley-lives"/);
assert.doesNotMatch(volley,/leftEnergy|rightEnergy|energyProfiles|energyFactor|receiveHealProfiles|healFrames|loseLife|resetEnergy|체력|목숨/);
assert.match(volley,/function activateSuperSpike\(\)/);
assert.match(runner,/id="run-health-progress"|id="run-lives"/);
assert.match(volley,/now-lastTapAt<=320/);
assert.match(runner,/now-lastTapAt<=320/);
assert.match(picker,/🏫 학교 선택/);
assert.match(backend,/function validatedSurvivalSeconds/);
assert.match(backend,/invalid_time_bonus/);
const scoring=backend.slice(backend.indexOf("function validatedSurvivalSeconds"),backend.indexOf("function publicGameResult("))+
 backend.slice(backend.indexOf("function scoreFromRetirement("),backend.indexOf("Deno.serve("));
const javascript=scoring.replace(/:\s*(?:any|number)/g,"").replace(/\s+as const/g,"");
const scoreFns=new Function("int",javascript+"\nreturn {scoreFromVolleyball,scoreFromRun,scoreFromVolleyball25,scoreFromRetirement};")(
 (v,min,max)=>typeof v==="number"&&Number.isInteger(v)&&v>=min&&v<=max
);
assert.equal(scoreFns.scoreFromVolleyball({player:7,cpu:3,spikes:2},100),7*120+2*25+600+(7-3)*30);
// Volleyball server validates score points, defeat penalties and lead multipliers.
const volleyStats=(player,cpu,activeTenths=800,endedEarly=false)=>{
 const baseScore=Math.max(0,player*100-cpu*50);
 const victory=player===25&&cpu<25;
 const survivalBonus=Math.min(900,Math.floor(activeTenths/10))*4;
 const multiplier=victory?1+Math.floor((25-cpu)/5):1;
 return {player,cpu,baseScore,survivalBonus,multiplier,
  finalScore:baseScore*multiplier+survivalBonus,victory,endedEarly,activeTenths};
};
assert.equal(scoreFns.scoreFromVolleyball25(volleyStats(25,0),82),2500*6+320,"25–0 win: lead multiplier and play bonus");
assert.equal(scoreFns.scoreFromVolleyball25(volleyStats(25,5),82),2250*5+320);
assert.equal(scoreFns.scoreFromVolleyball25(volleyStats(25,10),82),2000*4+320);
assert.equal(scoreFns.scoreFromVolleyball25(volleyStats(25,15),82),1750*3+320);
assert.equal(scoreFns.scoreFromVolleyball25(volleyStats(25,20),82),1500*2+320);
assert.equal(scoreFns.scoreFromVolleyball25(volleyStats(25,24),82),1300+320);
assert.equal(scoreFns.scoreFromVolleyball25(volleyStats(24,25),82),1150+320,"loss still saves points");
assert.equal(scoreFns.scoreFromVolleyball25(volleyStats(3,25),82),320,"long survival has value even when losing badly");
assert.equal(scoreFns.scoreFromVolleyball25(volleyStats(0,0,100,true),12),40,"early quit without reaching 25 earns active time");
assert.equal(scoreFns.scoreFromVolleyball25(volleyStats(7,3,200,true),22),7*100-3*50+80,"early quit retains points and survival bonus");
assert.equal(scoreFns.scoreFromVolleyball25(volleyStats(0,0,9000,true),902),3600,"survival bonus is capped at 15 minutes");
assert.throws(()=>scoreFns.scoreFromVolleyball25(volleyStats(24,24),82),/invalid_match/);
assert.throws(()=>scoreFns.scoreFromVolleyball25(volleyStats(25,25),82),/invalid_match/);
assert.throws(()=>scoreFns.scoreFromVolleyball25(volleyStats(25,24,800,true),82),/invalid_early_end/);
assert.throws(()=>scoreFns.scoreFromVolleyball25({...volleyStats(25,5),multiplier:6},82),/invalid_score/);
assert.throws(()=>scoreFns.scoreFromVolleyball25({...volleyStats(25,5),survivalBonus:321},82),/invalid_score/);
assert.throws(()=>scoreFns.scoreFromVolleyball25({...volleyStats(25,5),finalScore:9999},82),/invalid_score/);
assert.throws(()=>scoreFns.scoreFromVolleyball25(volleyStats(25,5),10),/invalid_survival_time/);
assert.throws(()=>scoreFns.scoreFromVolleyball25(volleyStats(0,0,20,true),12),/invalid_early_end/);
const win62={score:12000,baseScore:6000,survivalSeconds:190,age:62,victory:true};
assert.equal(scoreFns.scoreFromRetirement(win62,191),12000);
assert.throws(()=>scoreFns.scoreFromRetirement({...win62,score:6000},191),/invalid_retirement_score/);
assert.throws(()=>scoreFns.scoreFromRetirement({...win62,age:61},191),/invalid_age/);
assert.throws(()=>scoreFns.scoreFromRetirement({...win62,survivalSeconds:189},191),/invalid_age|invalid_retirement/);
assert.throws(()=>scoreFns.scoreFromRetirement(win62,150),/invalid_survival_time|invalid_retirement/);
assert.equal(scoreFns.scoreFromRetirement({score:700,baseScore:700,age:44,survivalSeconds:100,victory:false},103),700);
assert.throws(()=>scoreFns.scoreFromRetirement({score:1400,baseScore:700,age:44,survivalSeconds:100,victory:false},103),/invalid_retirement_score/);
assert.equal(scoreFns.scoreFromRun({score:1500,day:3,victory:false},100),1500,"old run records remain compatible");
console.log("PASS: verified 25-point +100/-50 win-margin scoring and 62-year retirement rules");

// EXTREME disables player ascent in both games without suppressing enemy AI jump.
assert.match(volley,/const hasPlayerWings=\(\)=>currentDifficulty==="easy"\|\|isMysteryBuff/,"EASY and wing pickups permit flight");
assert.match(volley,/const playerCeiling=\(\)=>hasPlayerWings\(\)\?86:NET_TOP-78/,"NORMAL/HARD/VERY HARD higher jump reach");
assert.match(volley,/controlPlayer\(left, keyboardDirection, canPlayerJump\(\)&&keys\.jump/,"keyboard jump gated");
assert.match(volley,/left\.y = canPlayerJump\(\) \? clamp\(left\.y, playerCeiling\(\), FLOOR - 31\) : FLOOR - 31/,"player flight limited by item/net ceiling");
assert.match(volley,/controlPlayer\(right,move,!shackle&&state\.aiJump/,"CPU jumps unless affected by shackle");
assert.match(runner,/extreme:\{jumpEnabled:false,/,"runner disables aerial control in EXTREME");
assert.match(runner,/if\(canPlayerRise\(\)\)player\.y\+=Math\.sign\(dy\)/,"runner upward drag gated by difficulty");
assert.match(runner,/player\.y=canPlayerRise\(\)\?Math\.max\(76,Math\.min\(H-52,player\.y\)\):H-52/,"runner grounded on each frame");
assert.match(runner,/player\.y=canPlayerRise\(\)\?Math\.max\(76,Math\.min\(H-52,player\.y\)\):H-52/,"survival resize follows active wings/shackle");
const volleyPointerSource=volley.slice(volley.indexOf('function targetFromPointer(e)'),volley.indexOf('canvas.addEventListener("pointerdown"'));
const volleyPointer=new Function("difficulty", [
 'const W=900,H=500,FLOOR=451,NET_X=450,NET_W=14;',
 'const touchControl={targetX:null,targetY:null};',
 'const canvas={getBoundingClientRect:()=>({left:0,top:0,width:450,height:250})};',
 'const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));',
 'const canPlayerJump=()=>difficulty!=="extreme";const playerCeiling=()=>difficulty==="easy"?86:264;',
 volleyPointerSource,
 'targetFromPointer({clientX:100,clientY:0});',
 'return touchControl;'
].join("\n"));
assert.equal(volleyPointer("extreme").targetY,420,"extreme volleyball touch must stay on court floor");
assert.equal(volleyPointer("hard").targetY,264,"HARD now jumps noticeably higher without unrestricted flight");
const runnerPointerSource=runner.slice(runner.indexOf('function dragPosition(e)'),runner.indexOf('function setFlightTarget(e)'));
const runnerPointer=new Function("jumpEnabled",[
 'const profile={jumpEnabled},canPlayerRise=()=>profile.jumpEnabled!==false,W=600,H=420;',
 'const canvas={getBoundingClientRect:()=>({left:0,top:0,width:300,height:210})};',
 runnerPointerSource,
 'return dragPosition({clientX:150,clientY:0});'
].join("\n"));
assert.equal(runnerPointer(false).y,368,"extreme run touch must stay on ground");
assert.equal(runnerPointer(true).y,76,"other run difficulties still allow rising");
// 25-point rules and score lead multipliers, never elapsed-time rankings.
assert.match(volley,/const MATCH_TARGET=25/);
assert.match(volley,/const POINT_GAIN=100,POINT_LOSS=50/);
assert.match(volley,/BEST_SCORE_KEY="teacherVolleyballScore25BestV1"/);
assert.match(volley,/state\.recordBroken=rememberBestScore\(finalScore\)/);
assert.match(volley,/new window\.ArcadeLeaderboard\("volleyball_25"/);
assert.match(runner,/new window\.ArcadeLeaderboard\("teacher_run_retirement"/);
assert.doesNotMatch(volley,/formatTime|getElapsedTenths|updateClockUI|volley-time-label|BEST TIME/);
assert.match(volley,/FASTEST_25_KEY="teacherVolleyballFastest25SeparateV1"/);
assert.match(volley,/id="volley-fastest-label"/);
assert.doesNotMatch(shared,/timedGame|openRecord|dialogElement|nickname:/,"no player-entered names");
assert.match(shared,/function orderFast\(rows\)/,"fastest wins ranked separately");
assert.match(shared,/b\.score-a\.score/,"higher scores rank ahead");
assert.doesNotMatch(shared,/this\.score<=this\.board\[9\]\.score/,"retirement results are saved automatically below TOP10");
assert.match(volley,/EASY: animated feather wings/);
assert.match(volley,/p===left&&hasPlayerWings\(\)&&!isMysteryBuff\("left","shackle"\)/,"wings are drawn when EASY or pickup allows flight");
assert.match(runner,/profile===difficultyProfiles\.easy\|\|isMysteryBuff\("wings"\)/,"survival wings appear on pickup too");
const scoringStart=volley.indexOf("const MATCH_TARGET=25");
const scoringEnd=volley.indexOf("const W =",scoringStart);
assert.ok(scoringStart>0&&scoringEnd>scoringStart);
const scoringSrc=volley.slice(scoringStart,scoringEnd);
const clientScore=new Function(scoringSrc+"return {base:getBaseMatchScore,multiplier:getVictoryMultiplier,final:getMatchScore};")();
for(const [p,c] of [[0,0],[25,0],[25,5],[25,10],[25,15],[25,20],[25,24],[24,25],[3,25]]){
 const expected=volleyStats(p,c);
 assert.equal(clientScore.base(p,c),expected.baseScore);
 assert.equal(clientScore.multiplier(p,c),expected.multiplier);
 assert.equal(clientScore.final(p,c,800),expected.finalScore);
}
assert.match(volley,/cheerMilestones=\{/);
assert.match(volley,/5:"✨/);
assert.match(volley,/10:"🔥/);
assert.match(volley,/15:"💪/);
assert.match(volley,/20:"🚀/);
assert.match(volley,/23:"🎯/);
assert.match(volley,/24:"🏁/);
assert.match(volley,/state\.winStreak\+\+/);
assert.match(volley,/id="volley-my-progress"/);
assert.match(volley,/id="volley-cpu-progress"/);
assert.match(volley,/state\.pointCheer=pointEncouragement/);
const pointStart=volley.indexOf("function point(leftWins) {");
const pointEnd=volley.indexOf("function step() {",pointStart);
assert.ok(pointStart>0&&pointEnd>pointStart);
const pointSrc=volley.slice(pointStart,pointEnd);
function pointCase(player,cpu,leftWins){
 const state={phase:"playing",leftScore:player,rightScore:cpu,serveLeft:true,winStreak:0,bestStreak:0,flash:0};
 return new Function("state","side",[
  'const MATCH_TARGET=25,POINT_GAIN=100,POINT_LOSS=50;',
  'const cheerMilestones={5:"첫 고비",10:"10점",15:"15점",20:"20점",23:"23점",24:"24점"};',
  'const pointEncouragement=()=>"+100 또는 -50";',
  'let finished=0;const setStatus=()=>{},tone=()=>{},syncUI=()=>{};',
  'const finishMatch=()=>{finished++;state.phase="finished";};',
  pointSrc,
  'point(side);return {p:state.leftScore,c:state.rightScore,finished,phase:state.phase,serveLeft:state.serveLeft};'
 ].join("\n"))(state,leftWins);
}
assert.deepEqual(pointCase(24,20,true),{p:25,c:20,finished:1,phase:"finished",serveLeft:false});
assert.deepEqual(pointCase(16,24,false),{p:16,c:25,finished:1,phase:"finished",serveLeft:true});
assert.deepEqual(pointCase(5,4,true),{p:6,c:4,finished:0,phase:"point",serveLeft:false});
assert.doesNotMatch(volley,/loseLife|leftEnergy|rightEnergy/);
assert.match(volley,/ranking\?\.finish\(finalScore,\{/,"final scored result auto-recorded, including nonzero losses");
console.log("PASS: score and capped active-time bonus, independent fastest 25-win record, early quit and cheers");

// Five-tier ball speed and opposite team cosmetics survive the redesign.
const netTopMatch=volley.match(/NET_TOP = (\d+), NET_W/);
assert.ok(netTopMatch);assert.equal(Number(netTopMatch[1]),342);
const speedMatch=volley.match(/const ballSpeedProfiles=(\{[^}]+\});/);
const looksMatch=volley.match(/const enemyLooks=(\{[\s\S]*?\n\s*\});/);
assert.ok(speedMatch&&looksMatch);
const speeds=new Function("return "+speedMatch[1])(),looks=new Function("return "+looksMatch[1])();
const levels=["easy","normal","hard","very_hard","extreme"];
assert.deepEqual(Object.keys(speeds),levels);
assert.deepEqual(Object.keys(looks),levels);
for(let i=1;i<levels.length;i++){
 assert.ok(speeds[levels[i]]>speeds[levels[i-1]]);
 assert.ok(looks[levels[i]].armor>=looks[levels[i-1]].armor);
}
assert.match(volley,/drawTeacher\(right, \(enemyLooks\[currentDifficulty\]\|\|enemyLooks\.normal\)\.uniform\)/);
assert.match(volley,/if\(look&&look\.armor&&!p\.mini\)/);
assert.match(volley,/ball\.vx=\(sign\*attack\+clamp\(p\.vx,-12,12\)\*\.16\+\(precise\?1\.9:0\)\)\*ballSpeedFactor\(\)/);
const serveStart=volley.indexOf("function resetPositions()");
const serveEnd=volley.indexOf("async function startMatch()",serveStart);
assert.ok(serveStart>0&&serveEnd>serveStart);
const resetSource=volley.slice(serveStart,serveEnd);
const ballCreateStart=volley.indexOf("function createMysteryBall(");
const ballCreateEnd=volley.indexOf("function changeMysteryBalls(",ballCreateStart);
assert.ok(ballCreateStart>0&&ballCreateEnd>ballCreateStart);
const createMysteryBallSource=volley.slice(ballCreateStart,ballCreateEnd);
const serveSpeed=(tier,serveLeft=true)=>new Function("tier","serveLeft",[
 "const ballSpeedProfiles="+speedMatch[1],
 "const ballSpeedFactor=()=>ballSpeedProfiles[tier];",
 "const FLOOR=451,NET_X=450,currentDifficulty=tier,state={serveLeft},left={},right={},ball={trail:[]};",
 "const volleyShackle={x:0,dir:-1},secondBall={trail:[]},activeBalls=[ball],clones=[],enemyMinion={},bonusFriend={};",
 "let desiredBalls=tier===\"extreme\"?2:1;",
 createMysteryBallSource,
 "const cloneProfiles={easy:2,normal:1,hard:0,very_hard:0,extreme:0};",
 resetSource,"resetPositions();return {vx:ball.vx,vy:ball.vy};"
].join("\n"))(tier,serveLeft);
assert.ok(Math.abs(serveSpeed("easy").vx)<Math.abs(serveSpeed("hard").vx));
assert.ok(Math.abs(serveSpeed("hard").vx)<Math.abs(serveSpeed("extreme").vx));
assert.ok(serveSpeed("extreme",false).vx<0);
assert.match(volley,/state\.leftScore>=MATCH_TARGET\|\|state\.rightScore>=MATCH_TARGET/);
assert.doesNotMatch(volley,/id="volley-current-score"|id="player-energy"|id="cpu-energy"/);
console.log("PASS: tier speeds, boss appearance, clean 25-point score HUD and two-ball serve");

// Volleyball impact and boss strike cues remain unchanged by timer rules.
assert.match(volley,/state\.hitStopFrames=charged\?5:bossStrike\?4:3/);
assert.match(volley,/if\(state\.hitStopFrames>0\)\{state\.hitStopFrames--;return;\}/);
assert.match(volley,/state\.impactFrames=charged\?19:bossStrike\?15:11/);
assert.match(volley,/ctx\.arc\(state\.impactX,state\.impactY,15\+75\*t/);
assert.match(volley,/state\.bossWarnFrames=currentDifficulty==="extreme"\?39:32/);
assert.match(volley,/const bossStrike=p\.side==="right"&&state\.bossWarnFrames>0/);
// 24 to 62 years: 5 seconds/year, five career eras instead of weekday loop.
const careerCodeStart=runner.indexOf("const START_AGE=24");
const careerCodeEnd=runner.indexOf("const bad=[",careerCodeStart);
assert.ok(careerCodeStart>0&&careerCodeEnd>careerCodeStart);
const careerSource=runner.slice(careerCodeStart,careerCodeEnd);
const ageCase=(seconds,stage=0)=>new Function("clock","stage",careerSource+
 "\nreturn {age:getAge(),careerStage:getCareerStage(),stageSeconds:stageElapsed(),duration:RETIREMENT_SECONDS};")(seconds,stage);
assert.deepEqual(ageCase(0),{age:24,careerStage:0,stageSeconds:0,duration:190});
assert.equal(ageCase(4.99).age,24);
assert.equal(ageCase(5).age,25);
assert.equal(ageCase(40,1).careerStage,1);
assert.equal(ageCase(189.99,4).age,61);
assert.equal(ageCase(190,4).age,62);
const eventsMatch=runner.match(/const careerEvents=(\[[\s\S]*?\n\s*\]);/);
assert.ok(eventsMatch);
const careerEvents=new Function("return "+eventsMatch[1])();
assert.equal(careerEvents.length,5);
for(const events of careerEvents){
 assert.equal(events.length,3);
 assert.deepEqual(new Set(events.map(x=>x.id)),new Set(["rush","support","focus"]));
}
const evtStart=runner.indexOf("function triggerCareerEvent(){");
const evtEnd=runner.indexOf("function spawn(){",evtStart);
assert.ok(evtStart>0&&evtEnd>evtStart);
const evtSrc=runner.slice(evtStart,evtEnd);
function careerEventCase(stage,index){
 const fakeMath=Object.create(Math);fakeMath.random=()=>index/3+.001;
 return new Function("careerEvents","stage","Math",[
  'const state="playing";let activeEvent=null,eventSeconds=0;',
  'let life=60,maxLife=100,player={x:150,y:250,inv:0},skill={guard:0};',
  'let notice="",bursts=0;const burst=()=>{bursts++;},updateLabels=()=>{},setNotice=x=>{notice=x;},playTone=()=>{};',
  evtSrc,'triggerCareerEvent();return {event:activeEvent,life,inv:player.inv,notice,bursts};'
 ].join("\n"))(careerEvents,stage,fakeMath);
}
assert.equal(careerEventCase(0,0).event.id,"rush");
assert.equal(careerEventCase(0,1).event.id,"support");
assert.equal(careerEventCase(0,2).event.id,"focus");
assert.equal(careerEventCase(2,0).life,78,"colleague help heals");
assert.ok(careerEventCase(2,0).bursts>0);
assert.match(careerEventCase(0,2).notice,/점수 35% 추가/);
assert.match(runner,/const cycle=Math\.floor\(\(stageElapsed\(\)-5\)\/14\)/);
assert.match(runner,/if\(cycle>=0&&cycle!==lastEventCycle\)/);
assert.match(runner,/if\(getAge\(\)>=60&&!retirementRushAnnounced\)/);
assert.match(runner,/Math\.floor\(\(clock-180\)\/2\.7\)%2===0\?\.25:\.75/);
assert.match(runner,/function nextCareerStage\(\)/);
assert.match(runner,/state="between";pressed\.clear\(\)/);
assert.match(runner,/message\(getAge\(\)\+"세 · "\+careerStages\[stage\]\.name/);
const upgradesMatch=runner.match(/const upgrades=(\[[\s\S]*?\n\s*\]);/);
assert.ok(upgradesMatch);
const upgrades=new Function("return "+upgradesMatch[1])();
assert.equal(upgrades.length,4);
assert.ok(upgrades.every(x=>x.detail&&x.detail.length>=8));
assert.match(runner,/picks=picks\.slice\(0,3\)/);
assert.match(runner,/detail:u\.detail,action:\(\)=>choose\(u\)/);
assert.match(runner,/if\(u\.id==="vital"\)/);
assert.match(runner,/if\(u\.id==="speed"\)/);
assert.match(runner,/if\(u\.id==="guard"\)/);
assert.match(runner,/if\(u\.id==="heal"\)/);
assert.match(runner,/activeEvent&&eventSeconds>0/);
const scoreFnMatch=runner.match(/function addScore\(n\)\{[^}]+\}/);
assert.ok(scoreFnMatch);
const eventScore=id=>new Function("activeEvent",[
 'let score=0,combo=0;const updateLabels=()=>{};',
 scoreFnMatch[0],'addScore(100);return score;'
].join("\n"))(id?{id}:null);
assert.equal(eventScore(null),100);
assert.equal(eventScore("focus"),135);
assert.match(html,/teacher-volleyball\.html\?v=[a-zA-Z0-9-]+/);
assert.match(html,/teacher-run\.html\?v=[a-zA-Z0-9-]+/);
console.log("PASS: 5-second career ages 24–62, five career stages, events, promotion choices and final rush");


// Natural volley impacts remain intact without stamina / healing.
assert.doesNotMatch(volley,/ball\.x\s*=\s*p\.x\s*\+\s*sign\s*\*\s*\(reach\s*\+\s*R\s*\+\s*1\)/);
assert.doesNotMatch(volley,/ball\.y\s*=\s*Math\.min\(ball\.y,\s*p\.y\s*-\s*22\)/);
assert.match(volley,/const handX=p\.x\+sign\*29, handY=p\.y-15/);
assert.match(volley,/const push=Math\.min\(12,Math\.max\(0,reach\+R-contactDistance\+1\)\)/);
assert.match(volley,/const framesToNet=clamp\(\(NET_X-ball\.x\)\/ball\.vx,4,45\)/);
assert.match(volley,/ball\.spin\+=ball\.vx\*\.009/);
assert.match(volley,/ctx\.rotate\(ball\.spin\)/);
assert.match(volley,/if\(p\.contactFrames>0\)/);
const hitStart=volley.indexOf("function playerHit(p,ball=activeBalls[0]) {");
const hitEnd=volley.indexOf("function finishMatch(early=false)",hitStart);
assert.ok(hitStart>0&&hitEnd>hitStart);
const hitSrc=volley.slice(hitStart,hitEnd);
const contact=new Function("ball","state","p","tier",[
 'const currentDifficulty=tier,R=48,NET_X=450,NET_TOP=342,AUTO_SPIKE_SPEED=8;',
 'const battle={allyReach:1,enemyReach:1,allyAttack:1,enemyAttack:1,enemySmashChance:0};',
 'const ballSpeedFactor=()=>1,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));',
 'const setStatus=()=>{},tone=()=>{},spikeSound=()=>{};',
 hitSrc,'playerHit(p,ball);return {ball,state,p};'
].join("\n"));
function contactCase(tier="hard",spike=false){
 const ball={x:248,y:376,vx:-8,vy:3,cooldown:0,spin:0,trail:[],shadowFrames:0};
 const state={specialChargeFrames:0,bossWarnFrames:0,playFrames:100,spikes:0,hitStopFrames:0,impactFrames:0};
 const p={x:210,y:420,vx:0,vy:0,impactSpeed:spike?12:0,side:"left",contactFrames:0};
 return contact(ball,state,p,tier);
}
const reception=contactCase();
assert.ok(Math.hypot(reception.ball.x-248,reception.ball.y-376)<=12.01);
assert.ok(reception.ball.vx>0&&reception.ball.vy<0,"received ball follows outbound arc");
assert.ok(reception.p.contactFrames>0);
assert.equal(reception.state.spikes,0);
const strike=contactCase("hard",true);
assert.equal(strike.state.spikes,1);
assert.ok(strike.state.hitStopFrames>0);
assert.ok(strike.ball.shadowFrames>0);
assert.doesNotMatch(volley,/getSurvivalSeconds|healAmount|leftMaxEnergy|rightMaxEnergy/);
console.log("PASS: safe non-teleporting reception, spiking hit-stop and no old stamina effects");


// Difficulty asymmetry: EXTREME double-ball and chain, EASY/NORMAL clones, automatic chalk.
const cloneProfileMatch=volley.match(/const cloneProfiles=(\{[^}]+\});/);
assert.ok(cloneProfileMatch,"helper clones exist");
const cloneCounts=new Function("return "+cloneProfileMatch[1])();
assert.deepEqual(cloneCounts,{easy:2,normal:1,hard:0,very_hard:0,extreme:0});
const formation=(tier,serveLeft=true)=>new Function("tier","serveLeft",[
 "const currentDifficulty=tier,FLOOR=451,NET_X=450,clamp=(x,a,b)=>Math.max(a,Math.min(b,x));",
 "const volleyShackle={x:0,dir:-1},left={},right={},ball={trail:[]},secondBall={trail:[]},enemyMinion={},bonusFriend={};",
 "const state={serveLeft},activeBalls=[ball],clones=[],cloneProfiles="+cloneProfileMatch[1],
 "let desiredBalls=tier===\"extreme\"?2:1;",
 createMysteryBallSource,
 "const ballSpeedFactor=()=>1;",
 resetSource,"resetPositions();return {balls:activeBalls.map(b=>({x:b.x,y:b.y,vx:b.vx,vy:b.vy})),clones:clones.map(c=>({...c})),shackle:volleyShackle};"
].join("\n"))(tier,serveLeft);
for(const tier of levels){
 const x=formation(tier);
 assert.equal(x.balls.length,tier==="extreme"?2:1,tier+" ball count");
 assert.equal(x.clones.length,cloneCounts[tier],tier+" companion count");
 assert.equal(x.shackle.x,156,"volley shackle resets beside player's foot");
}
const pair=formation("extreme");
assert.notEqual(pair.balls[0].x,pair.balls[1].x,"two independent ball origins");
assert.ok(pair.balls[0].vx>0&&pair.balls[1].vx<0,"opposed initial ball directions");
const reversed=formation("extreme",false);
assert.ok(reversed.balls[0].vx<0&&reversed.balls[1].vx>0,"second serve direction reverses");
assert.match(volley,/for\(const liveBall of activeBalls\)\{/,"each ball participates in physics");
assert.match(volley,/for\(const liveBall of activeBalls\)drawBall\(liveBall\)/,"both balls visible");
assert.match(volley,/break; \/\/ First grounded ball ends this rally: one point/,"one point per rally");
assert.match(volley,/const ball=activeBalls\.find\(b=>b\.x>NET_X&&b\.vx>0\)/,"CPU targets live balls");
const helperStart=volley.indexOf("function allyBodyTouchesBall(ally,hitBall){");
const helperEnd=volley.indexOf("function moveAI()",helperStart);
assert.ok(helperStart>0&&helperEnd>helperStart);
const cloneHitSrc=volley.slice(helperStart,helperEnd);
const testCloneHit=new Function("hitBall","ally",[
 "const R=48,FLOOR=451,NET_X=450,NET_W=14,clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),left={x:80},state={rescueUsed:false},ballSpeedFactor=()=>1,tone=()=>{},setStatus=()=>{};",
 cloneHitSrc,"return cloneHit(ally,hitBall);"
].join("\n"));
const testHelper={x:210,y:420,contactFrames:0};
const protectedBall={x:240,y:380,vx:-9,vy:4,cooldown:0,shadowFrames:0,shadowColor:""};
assert.equal(testCloneHit(protectedBall,testHelper),true,"clone actually receives incoming ball");
assert.ok(protectedBall.vx>0&&protectedBall.vy<0,"clone returns ball over net");
assert.equal(protectedBall.allyCooldown,16,"clone contact applies a separate bounded helper cooldown");
assert.equal(protectedBall.cooldown,9,"clone cannot rapidly re-hit same ball");
assert.ok(testHelper.contactFrames>0,"helper contact animation runs");
assert.equal(testCloneHit({x:240,y:380,vx:8,vy:4,cooldown:0,allyCooldown:0},testHelper),true,"outgoing ball can receive a controlled redirect");
assert.equal(testCloneHit({x:240,y:380,vx:8,vy:4,cooldown:0,allyCooldown:10},testHelper),false,"helper cooldown prevents repetitive touches");
assert.match(volley,/function drawVolleyShackle\(\)/);
assert.match(volley,/if\(canPlayerJump\(\)\|\|state\.phase==="ready"/,"shackle drawn only during restricted movement");
assert.match(volley,/volleyShackle\.dir=left\.x>beforeMoveX\?-1:1/,"volleyball shackle trails movement direction");
assert.match(volley,/drawTeacher\(left, "#448bd8"\);\s*drawVolleyShackle\(\)/,"volleyball chain drawn on ankle");
const chalkMatch=runner.match(/const chalkProfiles=(\{[^\n]+\});/);
assert.ok(chalkMatch);
const chalkProfiles=new Function("return "+chalkMatch[1])();
assert.equal(chalkProfiles.easy.maxShots,2);
assert.equal(chalkProfiles.normal.maxShots,1);
assert.ok(chalkProfiles.easy.interval<chalkProfiles.normal.interval);
for(const t of ["hard","very_hard","extreme"])assert.equal(chalkProfiles[t],undefined,t+" disables chalk");
const helperStartRun=runner.indexOf("function helperPosition(helper){");
const helperEndRun=runner.indexOf("schoolPicker.onChange=",helperStartRun);
const chalkStart=runner.indexOf("function fireChalk(dt){");
const chalkEnd=runner.indexOf("function drawChalk(){",chalkStart);
assert.ok(helperStartRun>0&&helperEndRun>helperStartRun&&chalkStart>0&&chalkEnd>chalkStart);
const chalkSource=runner.slice(chalkStart,chalkEnd);
const helperSource=runner.slice(helperStartRun,helperEndRun);
function shoot(tier,good=false,hitRoll=.1){
 const mockMath=Object.create(Math);mockMath.random=()=>hitRoll;
 return new Function("tier","good","Math",[
  "const chalkProfiles="+chalkMatch[1],
  "const schoolPicker={get:()=>({difficulty:tier})};",
  "const isMysteryBuff=()=>false;",
  "const chalkProfile=()=>chalkProfiles[tier]||null;",
  'const W=600,H=420,state="playing";',
  'let items=[{x:300,y:260,good,r:23}],chalkShots=[],chalkHelpers=[],score=0,removed=0;',
  'const burst=()=>{removed++;},float=()=>{},playTone=()=>{},addScore=n=>{score+=n;};',
  helperSource,chalkSource,
  'resetChalkHelpers();const roles=chalkHelpers.map(h=>h.role);',
  'fireChalk(.4);const created=chalkShots.length;',
  'for(let i=0;i<100;i++)updateChalk(.04);',
  'return {created,remaining:items.length,score,removed,roles};'
 ].join("\n"))(tier,good,mockMath);
}
assert.deepEqual(shoot("easy"),{created:1,remaining:0,score:5,removed:1,roles:["동료","관리자"]});
assert.deepEqual(shoot("normal"),{created:1,remaining:0,score:5,removed:1,roles:["동료"]});
assert.deepEqual(shoot("easy",false,.9),{created:1,remaining:1,score:0,removed:0,roles:["동료","관리자"]});
assert.deepEqual(shoot("hard"),{created:0,remaining:1,score:0,removed:0,roles:[]});
assert.deepEqual(shoot("extreme"),{created:0,remaining:1,score:0,removed:0,roles:[]});
assert.deepEqual(shoot("easy",true),{created:0,remaining:1,score:0,removed:0,roles:["동료","관리자"]});
assert.match(runner,/const willHit=Math\.random\(\)<\.5/);
assert.match(runner,/function drawChalkHelpers\(\)/);
assert.match(runner,/x:helper\.role==="관리자"\?W-38:38,y:H-52/);
assert.match(runner,/function drawShackle\(\)/);
assert.match(runner,/if\(canPlayerRise\(\)\|\|state==="ready"\)return/);
assert.match(runner,/const canPlayerRise=\(\)=>!isMysteryBuff\("shackle"\)/,
 "movement respects the mystery-item shackle");
assert.match(runner,/if\(!canPlayerRise\(\)\)\{/,
 "runner shackle follows grounded steps including EXTREME and temporary shackles");
assert.match(runner,/shackle\.dir=player\.x>oldX\?-1:1/);
assert.match(runner,/drawItems\(\);drawMystery\(\);drawPatternHazards\(\);drawChalkHelpers\(\);drawChalk\(\);drawShackle\(\);playerDraw\(\)/);
assert.match(runner,/chalkShots=\[\];chalkCooldown=\.35/,"projectiles reset on new run");
assert.match(runner,/chalkShots=\[\];chalkCooldown=\.4/,"projectiles reset on next day");
assert.match(html,/teacher-volleyball\.html\?v=[a-zA-Z0-9-]+/);
assert.match(html,/teacher-run\.html\?v=[a-zA-Z0-9-]+/);
console.log("PASS: EXTREME dual volleyballs and both dragging shackles; EASY/NORMAL helper clones and automatic chalk aiming");


// Execute actual career finish code: 62-year win doubles accumulated points; losses do not.
const finishStart=runner.indexOf("function retirementCongratulations(");
const finishEnd=runner.indexOf("function pause(){",finishStart);
assert.ok(finishStart>0&&finishEnd>finishStart);
const runFinishSource=runner.slice(finishStart,finishEnd);
function finishCareer(initialScore,seconds,victory){
 return new Function("initialScore","seconds","victory",[
 'let state="playing",clock=seconds,score=initialScore,best=0,pointerId=null,pointerX=null,pointerY=null;',
 'const RETIREMENT_SECONDS=190,START_AGE=24,SECONDS_PER_YEAR=5;',
 'const pressed={clear(){}},schoolPicker={setLocked(){},get(){return {difficulty:"hard"}}},ranking={finish(score,stats){submitted={score,stats};}};',
 'let submitted=null,headline="",description="",misses=0,nearCount=0,livesLeft=2,life=100,maxLife=100;',
 'const getAge=()=>Math.min(62,24+Math.floor(clock/5));',
 'const persist=()=>{},updateLabels=()=>{},playTone=()=>{},stopAndChangeSchool=()=>{},$=()=>({textContent:""});',
 'const message=(title,desc)=>{headline=title;description=desc;};',
 runFinishSource,
 'finish(victory);return {state,score,best,clock,submitted,headline,description};'
 ].join("\n"))(initialScore,seconds,victory);
}
const fullCareer=finishCareer(4200,189.99,true);
assert.equal(fullCareer.state,"over");
assert.equal(fullCareer.clock,190);
assert.equal(fullCareer.score,8400);
assert.equal(fullCareer.best,8400);
assert.deepEqual(fullCareer.submitted.stats,{
 score:8400,baseScore:4200,survivalSeconds:190,age:62,victory:true,
 nearMisses:0,hits:0,livesLeft:2,healthPercent:100
});
assert.match(fullCareer.headline,/정년/);
assert.match(fullCareer.description,/× 2/);
const earlyCareer=finishCareer(900,60,false);
assert.equal(earlyCareer.score,900);
assert.equal(earlyCareer.submitted.stats.age,36);
assert.equal(earlyCareer.submitted.stats.victory,false);
assert.match(earlyCareer.description,/정년 보너스 없음/);
assert.doesNotMatch(runner,/월요일|화요일|수요일|목요일|금요일|월 → 금|DAY<\/span>/);
const scoreBoard=new mockWindow.ArcadeLeaderboard("volleyball_25",null);
scoreBoard.session="score-session";scoreBoard.remote=true;
scoreBoard.board=Array.from({length:10},(_,i)=>({score:8000-i*300}));
scoreBoard.load=async()=>scoreBoard.board;
let calls=0;
scoreBoard.request=async()=>{
 calls++;return {ranked:false,rank:0,timeRanked:true,timeRank:2,
  top10:[{score:9000,school_name:"기록초등학교",difficulty:"easy"}],
  fastestTop10:[{timeTenths:650,school_name:"기록초등학교",difficulty:"easy"}]};
};
await scoreBoard.finish(1620,volleyStats(25,24));
assert.equal(calls,1,"even below point TOP 10, fastest 25-win attempt is submitted");
assert.match(scoreBoard.notice,/최단시간 TOP 2위/);
assert.equal(scoreBoard.fastestBoard[0].timeTenths,650);
scoreBoard.session="score-session";
await scoreBoard.finish(12500,volleyStats(25,5));
assert.equal(calls,2,"high score also uploaded without names");
assert.match(backend,/order:"score\.desc,created_at\.asc"/);
assert.match(backend,/arcade_fastest25_records/,"fastest ten are stored separately from score TOP100");
assert.match(backend,/order:"win_time_tenths\.asc,created_at\.asc"/);
assert.match(backend,/All finished games have a verified result/);
console.log("PASS: separate fastest-25 and high-score boards, partial match uploads, anonymous records");


// Real victory headline selection: no generic copy for distinct achievements.
const vcStart=volley.indexOf("function volleyballCongratulations(");
const vcEnd=volley.indexOf("function finishMatch(early=false){",vcStart);
assert.ok(vcStart>0&&vcEnd>vcStart);
const volleyVictory=new Function("MATCH_TARGET",volley.slice(vcStart,vcEnd)+"return volleyballCongratulations;")(25);
assert.match(volleyVictory(0,"easy",2,false,false).title,/완벽한 승리/);
assert.match(volleyVictory(24,"hard",2,false,false).title,/마지막 한 점/);
assert.match(volleyVictory(12,"extreme",1,false,false).title,/족쇄/);
assert.match(volleyVictory(12,"hard",1,true,true).title,/두 개의 신기록/);
assert.match(volleyVictory(9,"hard",1,false,false).title,/압도적인/);
assert.match(volleyVictory(19,"hard",6,false,false).title,/연속 득점/);
assert.match(volleyVictory(19,"hard",2,false,true).title,/최단시간/);
assert.match(volleyVictory(19,"hard",2,true,false).title,/최고 점수/);
const rcStart=runner.indexOf("function retirementCongratulations(");
const rcEnd=runner.indexOf("function finish(win){",rcStart);
assert.ok(rcStart>0&&rcEnd>rcStart);
const runVictory=new Function(runner.slice(rcStart,rcEnd)+"return retirementCongratulations;")();
assert.match(runVictory("normal",0,1,2,.8,10000,false).title,/무사고/);
assert.match(runVictory("extreme",3,3,1,.3,10000,false).title,/족쇄/);
assert.match(runVictory("hard",3,15,1,.3,10000,false).title,/회피의 달인/);
assert.match(runVictory("normal",3,2,2,.9,10000,false).title,/건강하게/);
assert.match(runVictory("hard",3,2,1,.2,10000,true).title,/점수 신기록/);
assert.match(runVictory("hard",3,2,1,.2,21000,false).title,/전설/);
const otherCelebrations=new Set([0,1,2].map(x=>runVictory("hard",3,x,1,.2,5000+x,false).title));
assert.ok(otherCelebrations.size>=2,"ordinary retirement clear messages vary");
assert.match(volley,/state\.pointTicks=24/,"point intermission cut to 0.4 seconds");
assert.match(volley,/const precise=p\.side==="left"&&accuracy/,"precision-based hit timing matters");
assert.match(volley,/hitBall\.allyCooldown>0/,"teammate cooldown prevents repeated overlap hits");
assert.match(volley,/allyBodyTouchesBall\(ally,hitBall\)/,"helpers assist only with real ball-body contact");
assert.match(runner,/closestClearance<58/,"near miss verified by real distance");
assert.doesNotMatch(runner,/!a\.good&&Math\.abs\(a\.x-player\.x\)<83/,"old false near-miss scoring removed");
assert.doesNotMatch(runner,/addScore\(55\);float\(a\.x,a\.y,"PERFECT \+55"/,"protected collisions no longer grant combo points");
assert.match(runner,/addScore\(90\)/,"dodging rewarded above auto chalk");
assert.match(runner,/addScore\(5\);playTone\(760/,"auto chalk less valuable than dodging");
assert.match(runner,/earlyMilestones\.has\(mark\)/,"10,20,30 second rewards exist");
assert.match(runner,/const flyingSpeed=speed/,"touch and keyboard speed parity");
assert.match(runner,/profile\.homing,45/,"mid-career homing pattern");
assert.match(runner,/stage===3&&|if\(stage===3\)/,"career-specific safe lane");
assert.match(shared,/arcade-tier-filter/,"tiered leaderboard filter available");
assert.match(backend,/RANK_TIERS=new Set/,"server validates leaderboard tiers");
assert.match(backend,/if\(tier\)q\.set\("difficulty","eq\."\+tier\)/,"ranking tier applied at DB query");
assert.match(backend,/only the 100 highest scores/,"runner TOP100 is bounded");
assert.match(runner,/ranking\?\.finish\(Math\.floor\(score\)/,"runner auto submits on finish");
assert.match(runner,/닉네임 없이 결과를 자동 기록합니다/);
assert.match(shared,/arcade-history\.html\?game=/,"both games have an accessible records link");
assert.match(backend,/function gameHistory\(game:Game,tier:string\|null,page:number\)/,"history API is implemented");
assert.match(backend,/maxRecords:100/,"history declares its TOP100 limit");
assert.match(backend,/order:"score\.desc,created_at\.asc,id\.asc"/,"history is ranked by high score, not just date");
assert.match(backend,/\^\[1-4\]\$/,"history refuses pages beyond one hundred results");
assert.match(backend,/arcade_fastest25_records/,"fastest win TOP10 persists separately from score TOP100");
assert.match(backend,/recorded,score,top10/,"API returns whether result survived TOP100 pruning");
console.log("PASS: conditional congratulations, core action rewards, input parity and automatic tiered ranking");

// Both TOP10 panels are initially folded and remain user-controlled during redraws.
assert.doesNotMatch(html,/<a href="teacher-volleyball\.html"[^>]*>↗ 크게 보기<\/a>/,
 "the embedded volleyball game no longer has a zoom/enlarge link");
assert.match(html,/<a href="teacher-run\.html"[^>]*>↗ 크게 보기<\/a>/,
 "survival external link remains unchanged");
assert.match(volley,/arcade-leaderboard-v1\.js\?v=[a-zA-Z0-9-]+/);
assert.match(runner,/arcade-leaderboard-v1\.js\?v=[a-zA-Z0-9-]+/);
assert.match(shared,/this\.expanded=false/);
assert.match(shared,/aria-expanded/);
assert.match(shared,/arcade-ranking-content/);
assert.match(shared,/boardBody|content\.hidden=!this\.expanded/);
const makeMockNode=(tag)=>({
 tagName:tag,children:[],attrs:{},listeners:{},style:{},hidden:false,
 classList:{add(){}},
 append(...children){this.children.push(...children);},
 replaceChildren(...children){this.children=[...children];},
 setAttribute(name,value){this.attrs[name]=value;},
 addEventListener(type,cb){this.listeners[type]=cb;}
});
const documentMock={createElement:makeMockNode,querySelector:()=>null};
const windowMock={};
new Function("window","document","localStorage",shared)(
 windowMock,documentMock,{removeItem(){}});
windowMock.ArcadeLeaderboard.prototype.load=async function(){this.remote=true;this.draw();return [];};
for(const game of ["volleyball_25","teacher_run_retirement"]){
 const mount=makeMockNode("div");
 const board=new windowMock.ArcadeLeaderboard(game,mount);
 const toggle=mount.children[0],body=mount.children.at(-1);
 assert.equal(toggle.tagName,"button");
 assert.equal(toggle.attrs["aria-expanded"],"false");
 assert.equal(toggle.attrs["aria-controls"],body.id);
 assert.equal(body.hidden,true,"TOP10 must be folded before first interaction");
 assert.ok(body.children.some(c=>c.className==="arcade-history-link"),"history link is inside the folded content");
 toggle.listeners.click();
 assert.equal(toggle.attrs["aria-expanded"],"true");
 assert.equal(body.hidden,false,"TOP10 opens on first click");
 board.notice="🏆 기록 자동 등록 완료";
 board.draw();
 assert.equal(mount.children[0].attrs["aria-expanded"],"true","open state survives result redraw");
 assert.equal(mount.children.at(-1).hidden,false);
 assert.equal(mount.children[1].className,"arcade-rank-feedback","submission result stays visible");
 mount.children[0].listeners.click();
 assert.equal(mount.children[0].attrs["aria-expanded"],"false");
 assert.equal(mount.children.at(-1).hidden,true,"second click folds records again");
}
console.log("PASS: no volleyball zoom link, both TOP10 panels folded by default and freely toggled");


// The volleyball start-screen school button is real, keyboard-accessible and connected to the live picker.
assert.match(volley,/<div class="volley-ready-overlay"[\s\S]*?<div class="volley-ready-panel">[\s\S]*?<h2 id="volley-ready-title">학교를 선택하세요<\/h2>[\s\S]*?<button type="button" id="volley-school-choose"[^>]*aria-controls="arcade-school-picker">🏫 학교 선택하기<\/button>/,
 "school button is inside the in-court ready panel, as in survival game");
assert.match(volley,/readyOverlay\.hidden=!isReady/,"ready overlay only appears before a match");
assert.match(volley,/schoolChooseButton\.hidden=!isReady/,"button visibility follows the ready state");
assert.match(volley,/readyTitle\.textContent=chosen\?\.eligible/,"ready panel reflects chosen school");
assert.match(volley,/schoolChooseButton\.textContent=chosen\?\.eligible\?"▶ 이 학교로 시작하기"/,
 "selected eligible school gets an in-panel start button");
assert.doesNotMatch(volley,/schoolPicker\.mount\.appendChild\(schoolChooseButton\)/,
 "school CTA must not remain in the search bar");
assert.match(volley,/schoolChooseButton\.addEventListener\("click",/);
assert.match(volley,/schoolPicker\.resetForChange\(\)/,"choosing a new school clears the old selection");
assert.match(volley,/schoolPicker\.focus\(\)/,"button focuses school-name search");
assert.match(volley,/scrollIntoView\?\.\(\{behavior:"smooth",block:"start"\}\)/,"button scrolls to top picker");

// Retirement age displays in two lines instead of overflowing the first narrow HUD tile.
assert.match(runner,/<strong id="dayLabel" class="career-age-display">/);
assert.match(runner,/<span class="career-age-current" id="careerCurrentAge">24세<\/span>/);
assert.match(runner,/<span class="career-age-target">정년 62세<\/span>/);
assert.match(runner,/\$\("careerCurrentAge"\)\.textContent=getAge\(\)\+"세"/);
assert.match(runner,/\.stat \.career-age-display\{display:flex;flex-direction:column;/);
assert.match(runner,/\.stat \.career-age-display \.career-age-target\{font-size:clamp/);
assert.doesNotMatch(runner,/id="dayLabel">24세 \/ 정년 62세/);
console.log("PASS: pre-game school selection button and overflow-safe two-line 24/62 age card");



// PRs execute all local gameplay contracts; live HTTP checks run only after production deploy.
if(process.env.GITHUB_EVENT_NAME==="pull_request"){
 console.log("PASS: PR static arcade regression checks; production HTTP smoke reserved for main");
 process.exit(0);
}

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
// Observe the exact cache-buster committed by THIS checkout instead of hardcoding a past release.
const expectedVolleyFrame=html.match(/teacher-volleyball\.html\?v=[a-zA-Z0-9-]+/)?.[0];
const expectedRunFrame=html.match(/teacher-run\.html\?v=[a-zA-Z0-9-]+/)?.[0];
assert.ok(expectedVolleyFrame&&expectedRunFrame,"game iframe URLs must retain versioned paths");
async function waitForPublishedHome() {
 for(let attempt=0;attempt<20;attempt++){
  const site=await requestWithRetry(base+"/",200,{},3);
  if(site.body.includes(expectedVolleyFrame)&&
     site.body.includes(expectedRunFrame))return site;
  await new Promise(resolve=>setTimeout(resolve,8000));
 }
 throw new Error("Published game iframe versions did not update");
}
const [site,topVolley,topRun]=await Promise.all([
 waitForPublishedHome(),
 requestWithRetry(api+"?game=volleyball_25",200,{headers:origin}),
 requestWithRetry(api+"?game=teacher_run_retirement",200,{headers:origin})
]);
assert.ok(site.body.includes(expectedVolleyFrame),"published volleyball iframe must match tested version");
assert.ok(site.body.includes(expectedRunFrame),"published run iframe must match tested version");
for(const response of [topVolley,topRun]){
 const parsed=JSON.parse(response.body);
 assert.ok(Array.isArray(parsed.top10));
 assert.ok(parsed.top10.length<=10);
 for(const row of parsed.top10){
  assert.equal("nickname" in row,false,"public ranking never exposes nicknames");
  assert.ok(Number.isInteger(row.score)&&row.score>=0);
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
  body:JSON.stringify({action:"start",game:"volleyball_25",school_id:school.school_id})
 });
 const started=JSON.parse(start.body);
 assert.equal(started.school.eligible,true);
 assert.equal(started.school.school_id,school.school_id);
 assert.equal(started.school.difficulty,school.difficulty);
 assert.match(started.session,/^[0-9a-f-]{36}$/i);
 const invalid=await requestWithRetry(api,400,{
  method:"POST",headers:origin,
  body:JSON.stringify({action:"submit",game:"volleyball_25",session:started.session,nickname:"123",stats:{player:25,cpu:0,elapsedTenths:500}})
 });
 assert.equal(JSON.parse(invalid.body).error,"nickname_not_supported");
 console.log("PASS: eligible school session and rejection of user-supplied nicknames");
}else{
 assert.equal(school.difficulty,null,"no provisional middle-tier fallback");
 const refused=await requestWithRetry(api,409,{
  method:"POST",headers:origin,
  body:JSON.stringify({action:"start",game:"volleyball_25",school_id:school.school_id})
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
 method:"POST",headers:origin,body:JSON.stringify({action:"start",game:"volleyball_25",school_id:oneYear.school_id})
})).body);
assert.equal(oneStart.school.eligible,true);
assert.match(oneStart.session,/^[0-9a-f-]{36}$/i);
const zeroYear=JSON.parse((await requestWithRetry(api+"?school_id=7003849",200,{headers:origin})).body).school;
assert.equal(zeroYear.eligible,false,"zero-year school should not play");
assert.deepEqual(zeroYear.available_years,[]);
const zeroDenied=JSON.parse((await requestWithRetry(api,409,{
 method:"POST",headers:origin,body:JSON.stringify({action:"start",game:"teacher_run_retirement",school_id:zeroYear.school_id})
})).body);
assert.equal(zeroDenied.error,"school_ineligible");
assert.equal(zeroDenied.survey_url,"https://forms.gle/TPyCakK6Sj2zchRy7");
console.log("PASS: single surveyed year unlocks both games; no years requires 2026 survey");

