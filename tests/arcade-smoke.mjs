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
assert.match(volley,/NET_TOP = 342/,"net rises from 97px to 109px");
assert.match(volley,/43\s*\*\s*\.75\s*\*\s*battle\.allyReach/,"forearm reach remains tier-adjusted");
assert.doesNotMatch(volley,/data-key="jump"/,"touch jump button removed");
assert.doesNotMatch(volley,/class="touch"/,"empty touch control region removed");
assert.match(volley,/touchControl\.targetY/,"volleyball touch flight has vertical axis");
assert.match(volley,/flyingStep|flightStep/,"volleyball flight movement is implemented");
assert.match(runner,/pointerY=target\.y/,"survival game tracks 2D touch target");
assert.match(runner,/if\(canPlayerRise\(\)\)player\.y\+=Math\.sign\(dy\)/,"survival game flies vertically except EXTREME");
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
const scoring=backend.slice(backend.indexOf("function validatedSurvivalSeconds"),backend.indexOf("Deno.serve("));
const javascript=scoring.replace(/:\s*(?:any|number)/g,"");
const scoreFns=new Function("int",javascript+"\nreturn {scoreFromVolleyball,scoreFromRun,scoreFromVolleyball25,scoreFromRetirement};")(
 (v,min,max)=>typeof v==="number"&&Number.isInteger(v)&&v>=min&&v<=max
);
assert.equal(scoreFns.scoreFromVolleyball({player:7,cpu:3,spikes:2},100),7*120+2*25+600+(7-3)*30);
assert.equal(scoreFns.scoreFromVolleyball25({player:25,cpu:4,elapsedTenths:645},65),645);
assert.throws(()=>scoreFns.scoreFromVolleyball25({player:24,cpu:25,elapsedTenths:645},65),/invalid_stats/);
assert.throws(()=>scoreFns.scoreFromVolleyball25({player:25,cpu:4,elapsedTenths:100},65),/invalid_duration/);
assert.throws(()=>scoreFns.scoreFromVolleyball25({player:25,cpu:4,elapsedTenths:800},65),/invalid_duration/);
const win62={score:12000,baseScore:6000,survivalSeconds:190,age:62,victory:true};
assert.equal(scoreFns.scoreFromRetirement(win62,191),12000);
assert.throws(()=>scoreFns.scoreFromRetirement({...win62,score:6000},191),/invalid_retirement_score/);
assert.throws(()=>scoreFns.scoreFromRetirement({...win62,age:61},191),/invalid_age/);
assert.throws(()=>scoreFns.scoreFromRetirement({...win62,survivalSeconds:189},191),/invalid_age|invalid_retirement/);
assert.throws(()=>scoreFns.scoreFromRetirement(win62,150),/invalid_survival_time|invalid_retirement/);
assert.equal(scoreFns.scoreFromRetirement({score:700,baseScore:700,age:44,survivalSeconds:100,victory:false},103),700);
assert.throws(()=>scoreFns.scoreFromRetirement({score:1400,baseScore:700,age:44,survivalSeconds:100,victory:false},103),/invalid_retirement_score/);
assert.equal(scoreFns.scoreFromRun({score:1500,day:3,victory:false},100),1500,"old run records remain compatible");
console.log("PASS: separate 25-point win time and 62-year retirement score verification; legacy records intact");

// EXTREME disables player ascent in both games without suppressing enemy AI jump.
assert.match(volley,/const canPlayerJump=\(\)=>currentDifficulty!=="extreme"/,"volleyball player jump gate");
assert.match(volley,/controlPlayer\(left, keyboardDirection, canPlayerJump\(\)&&keys\.jump/,"keyboard jump gated");
assert.match(volley,/left\.y = canPlayerJump\(\) \? clamp\(left\.y, 86, FLOOR - 31\) : FLOOR - 31/,"volleyball flight clamped to floor in EXTREME");
assert.match(volley,/controlPlayer\(right,move,state\.aiJump/,"CPU retains jump in EXTREME");
assert.match(runner,/extreme:\{jumpEnabled:false,/,"runner disables aerial control in EXTREME");
assert.match(runner,/if\(canPlayerRise\(\)\)player\.y\+=Math\.sign\(dy\)/,"runner upward drag gated by difficulty");
assert.match(runner,/player\.y=canPlayerRise\(\)\?Math\.max\(76,Math\.min\(H-52,player\.y\)\):H-52/,"runner grounded on each frame");
assert.match(runner,/player\.y=!canPlayerRise\(\)\|\|pointerId===null\?H-52/,"runner remains grounded on resize");
const volleyPointerSource=volley.slice(volley.indexOf('function targetFromPointer(e)'),volley.indexOf('canvas.addEventListener("pointerdown"'));
const volleyPointer=new Function("difficulty", [
 'const W=900,H=500,FLOOR=451,NET_X=450,NET_W=14;',
 'const touchControl={targetX:null,targetY:null};',
 'const canvas={getBoundingClientRect:()=>({left:0,top:0,width:450,height:250})};',
 'const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));',
 'const canPlayerJump=()=>difficulty!=="extreme";',
 volleyPointerSource,
 'targetFromPointer({clientX:100,clientY:0});',
 'return touchControl;'
].join("\n"));
assert.equal(volleyPointer("extreme").targetY,420,"extreme volleyball touch must stay on court floor");
assert.equal(volleyPointer("hard").targetY,86,"other volleyball difficulties may fly upward");
const runnerPointerSource=runner.slice(runner.indexOf('function dragPosition(e)'),runner.indexOf('function setFlightTarget(e)'));
const runnerPointer=new Function("jumpEnabled",[
 'const profile={jumpEnabled},canPlayerRise=()=>profile.jumpEnabled!==false,W=600,H=420;',
 'const canvas={getBoundingClientRect:()=>({left:0,top:0,width:300,height:210})};',
 runnerPointerSource,
 'return dragPosition({clientX:150,clientY:0});'
].join("\n"));
assert.equal(runnerPointer(false).y,368,"extreme run touch must stay on ground");
assert.equal(runnerPointer(true).y,76,"other run difficulties still allow rising");
// Winner-take-first 25-point volleyball rules, loss path and pause-aware timer.
assert.match(volley,/const MATCH_TARGET=25/);
assert.match(volley,/id="volley-best-label"/);
assert.match(volley,/FASTEST_KEY="teacherVolleyballFastest25V1"/);
assert.match(volley,/rememberFastest\(duration\)/);
assert.match(volley,/new window\.ArcadeLeaderboard\("volleyball_25"/);
assert.match(runner,/new window\.ArcadeLeaderboard\("teacher_run_retirement"/);
assert.match(shared,/const timedGame=game=>game==="volleyball_25"/);
assert.match(shared,/a\.score-b\.score:b\.score-a\.score/,"only time boards are ascending");
assert.match(shared,/timedGame\(this\.game\)\?this\.score>=this\.board\[9\]\.score/);
assert.match(volley,/EASY: animated feather wings/);
assert.match(volley,/p===left&&currentDifficulty==="easy"/);
assert.match(runner,/profile===difficultyProfiles\.easy/);
const clockStart=volley.indexOf("const MATCH_TARGET=25");
const clockEnd=volley.indexOf("const W =",clockStart);
assert.ok(clockStart>0&&clockEnd>clockStart);
const clockSrc=volley.slice(clockStart,clockEnd);
const timerCase=(phase,now,startedAt=1000,pausedMs=0,pausedAt=0,finishedAt=0)=>
 new Function("state","performance",clockSrc+
 "\nreturn {tenths:getElapsedTenths(),formatted:formatTime(getElapsedTenths())};")(
 {phase,startedAt,pausedMs,pausedAt,finishedAt},{now:()=>now});
assert.deepEqual(timerCase("playing",7050,1000,500),{tenths:56,formatted:"0:05.6"});
assert.deepEqual(timerCase("paused",99999,1000,500,5100),{tenths:36,formatted:"0:03.6"});
assert.deepEqual(timerCase("finished",99999,1000,500,7100),{tenths:56,formatted:"0:05.6"});
assert.deepEqual(timerCase("ready",99999,0),{tenths:0,formatted:"0:00.0"});
const pointStart=volley.indexOf("function point(leftWins) {");
const pointEnd=volley.indexOf("function step() {",pointStart);
assert.ok(pointStart>0&&pointEnd>pointStart);
const pointSrc=volley.slice(pointStart,pointEnd);
function pointCase(player,cpu,leftWins){
 const state={phase:"playing",leftScore:player,rightScore:cpu,serveLeft:true};
 return new Function("state","side",[
 'const MATCH_TARGET=25;',
 'let finished=0;const setStatus=()=>{},tone=()=>{},syncUI=()=>{};',
 'const finishMatch=()=>{finished++;state.phase="finished";};',
 pointSrc,"point(side);return {p:state.leftScore,c:state.rightScore,finished,phase:state.phase,serveLeft:state.serveLeft};"
 ].join("\n"))(state,leftWins);
}
assert.deepEqual(pointCase(24,20,true),{p:25,c:20,finished:1,phase:"finished",serveLeft:false});
assert.deepEqual(pointCase(16,24,false),{p:16,c:25,finished:1,phase:"finished",serveLeft:true});
assert.deepEqual(pointCase(5,4,true),{p:6,c:4,finished:0,phase:"point",serveLeft:false});
assert.doesNotMatch(volley,/getSurvivalBonus|loseLife|leftEnergy|rightEnergy/,"old HP/survival score mechanics are removed");
assert.match(volley,/ranking\?\.finish\(duration,\{player:state\.leftScore,cpu:state\.rightScore,elapsedTenths:duration\}\)/);
console.log("PASS: 25-point winner/loser, pause-correct race clock, independent shortest time and EASY wings");

// Five-tier ball velocity, stronger pixel opponents and real current-score regression.
const netTopMatch=volley.match(/NET_TOP = (\d+), NET_W/);
assert.ok(netTopMatch);assert.equal(Number(netTopMatch[1]),342,"net is slightly higher");
const speedMatch=volley.match(/const ballSpeedProfiles=(\{[^}]+\});/);
const looksMatch=volley.match(/const enemyLooks=(\{[\s\S]*?\n\s*\});/);
assert.ok(speedMatch&&looksMatch,"tier speed and opponent profiles exist");
const speeds=new Function("return "+speedMatch[1])(),looks=new Function("return "+looksMatch[1])();
const levels=["easy","normal","hard","very_hard","extreme"];
assert.deepEqual(Object.keys(speeds),levels);
assert.deepEqual(Object.keys(looks),levels);
assert.equal(speeds.hard,1);
for(let i=1;i<levels.length;i++){
 assert.ok(speeds[levels[i]]>speeds[levels[i-1]],"ball speed grows with tier");
 assert.ok(looks[levels[i]].armor>=looks[levels[i-1]].armor,"armor does not weaken");
 assert.ok(looks[levels[i]].aura>=looks[levels[i-1]].aura,"aura does not weaken");
}
assert.equal(new Set(levels.map(t=>looks[t].uniform)).size,5,"unique enemy uniforms");
assert.equal(looks.extreme.armor,3);assert.equal(looks.extreme.aura,2);
assert.match(volley,/drawTeacher\(right, \(enemyLooks\[currentDifficulty\]\|\|enemyLooks\.normal\)\.uniform\)/);
assert.match(volley,/if\(look&&look\.armor\)/);
assert.match(volley,/if\(look&&look\.aura\)/);
assert.match(volley,/ball\.vx=\(sign\*attack\*energyFactor\(p\.side\)\+clamp\(p\.vx,-12,12\)\*\.16\)\*ballSpeedFactor\(\)/);
assert.match(volley,/ball\.vy=\(p\.side==="left" \?[\s\S]*?\)\*ballSpeedFactor\(\)/);
const serveStart=volley.indexOf("function resetPositions()"),serveEnd=volley.indexOf("async function startMatch()",serveStart);
assert.ok(serveStart>0&&serveEnd>serveStart);
const resetSource=volley.slice(serveStart,serveEnd);
const serveSpeed=(tier,serveLeft=true)=>new Function("tier","serveLeft",[
 "const ballSpeedProfiles="+speedMatch[1],
 "const ballSpeedFactor=()=>ballSpeedProfiles[tier];",
 "const FLOOR=451,NET_X=450,currentDifficulty=tier,state={serveLeft},left={},right={},ball={trail:[]};",
 "const volleyShackle={x:0,dir:-1},secondBall={trail:[]},activeBalls=[ball],clones=[];",
 "const cloneProfiles={easy:2,normal:1,hard:0,very_hard:0,extreme:0};",
 resetSource,"resetPositions();return {vx:ball.vx,vy:ball.vy};"
].join("\n"))(tier,serveLeft);
assert.ok(Math.abs(serveSpeed("easy").vx)<Math.abs(serveSpeed("hard").vx));
assert.ok(Math.abs(serveSpeed("hard").vx)<Math.abs(serveSpeed("extreme").vx));
assert.ok(Math.abs(serveSpeed("easy").vy)<Math.abs(serveSpeed("extreme").vy));
assert.ok(serveSpeed("extreme",false).vx<0,"serve direction remains correct");
assert.match(volley,/id="volley-current-score"/);
assert.match(volley,/class="volley-current-chip"/);
assert.match(volley,/currentScoreLabel\.textContent=getFinalScore\(\)\.toLocaleString\("ko-KR"\)/);
assert.match(volley,/state\.phase==="finished"&&state\.leftScore>state\.rightScore/);
const calcStart=volley.indexOf("const getBaseScore="),calcEnd=volley.indexOf("  const W =",calcStart);
assert.ok(calcStart>0&&calcEnd>calcStart);
const scoreSource=volley.slice(calcStart,calcEnd);
const liveScore=(phase,knockout)=>new Function("state",scoreSource+"\nreturn getFinalScore();")({
 phase,knockout,leftScore:4,rightScore:2,spikes:2,playFrames:35*60
});
const running=4*120+2*25+35*4;
assert.equal(liveScore("playing",false),running,"premature victory bonus is excluded");
assert.equal(liveScore("point",false),running);
assert.equal(liveScore("finished",false),running+600+(7-2)*30,"victory bonus granted only on finish");
assert.equal(liveScore("finished",true),running,"KO has no victory bonus");
console.log("PASS: net height, tier speed and enemy armor, correct current SCORE and finish bonus");

// Fun update: volley hit-stop/impact should be bounded and CPU boss strikes telegraphed.
assert.match(volley,/state\.hitStopFrames=charged\?5:bossStrike\?4:3/,"spikes trigger short hit-stop");
assert.match(volley,/if\(state\.hitStopFrames>0\)\{state\.hitStopFrames--;return;\}/,"hit-stop visibly freezes gameplay for a few frames");
assert.match(volley,/state\.impactFrames=charged\?19:bossStrike\?15:11/,"impact rings vary by spike strength");
assert.match(volley,/ctx\.arc\(state\.impactX,state\.impactY,15\+75\*t/,"shockwave expands outward");
assert.match(volley,/ctx\.translate\(\(Math\.random\(\)-\.5\)\*2\*shake/,"spikes shake the court");
assert.match(volley,/state\.bossWarnFrames=currentDifficulty==="extreme"\?39:32/,"hard opponent telegraphs strike");
assert.match(volley,/state\.bossCooldownFrames=currentDifficulty==="extreme"\?190:250/,"boss strike cooldown");
assert.match(volley,/if\(state\.bossWarnFrames>0\)/,"warning effect appears above CPU");
assert.match(volley,/const bossStrike=p\.side==="right"&&state\.bossWarnFrames>0/,"CPU can use warned boss attack");
assert.match(volley,/bossStrike\?\(state\.playFrames%2===0\?-6\.6:-11\.2\)/,"boss strike alternates attack angle");
assert.match(volley,/state\.bossWarnFrames=0;state\.flash=19/,"warning ends on boss strike");
// Daily events: one of three distinct events each day, exactly once per day.
const eventsMatch=runner.match(/const dayEvents=(\[[\s\S]*?\n\s*\]);/);
assert.ok(eventsMatch,"five day event sets exist");
const dayEvents=new Function("return "+eventsMatch[1])();
assert.equal(dayEvents.length,5);
for(const eventSet of dayEvents){
 assert.equal(eventSet.length,3,"three possible events for each weekday");
 assert.deepEqual(new Set(eventSet.map(e=>e.id)),new Set(["rush","support","focus"]));
}
const startEvt=runner.indexOf("function triggerDayEvent(){");
const endEvt=runner.indexOf("function spawn(){",startEvt);
assert.ok(startEvt>0&&endEvt>startEvt);
const dayEventCode=runner.slice(startEvt,endEvt);
function simulateDayEvent(index,dayIndex=0){
 const fakeMath=Object.create(Math);fakeMath.random=()=>index/3+.001;
 return new Function("dayEvents","day","Math",[
   'let state="playing",eventTriggered=false,activeEvent=null,eventSeconds=0;',
   'let life=60,maxLife=100,player={x:150,y:250,inv:0},skill={guard:0};',
   'let burstCount=0,notice="",updated=false;',
   'const burst=()=>{burstCount++;},updateLabels=()=>{updated=true;},setNotice=s=>{notice=s;},playTone=()=>{};',
   dayEventCode,
   'triggerDayEvent();const selected=activeEvent;',
   'triggerDayEvent();return {selected,eventTriggered,eventSeconds,life,inv:player.inv,burstCount,notice,updated};'
 ].join("\n"))(dayEvents,dayIndex,fakeMath);
}
const rushEvent=simulateDayEvent(0);
assert.equal(rushEvent.selected.id,"rush");
assert.equal(rushEvent.eventSeconds,6);
assert.equal(rushEvent.burstCount,0);
const supportEvent=simulateDayEvent(1,2);
assert.equal(supportEvent.selected.id,"rush"); // second Wednesday event
const helpEvent=simulateDayEvent(0,2);
assert.equal(helpEvent.selected.id,"support");
assert.equal(helpEvent.life,78,"support event immediately heals");
assert.ok(helpEvent.inv>=2.7,"support event grants invincibility");
assert.equal(helpEvent.burstCount,1);
const focusEvent=simulateDayEvent(2);
assert.equal(focusEvent.selected.id,"focus");
assert.match(focusEvent.notice,/점수 35% 추가/);
assert.match(runner,/if\(!eventTriggered&&dayTime>=6\)triggerDayEvent\(\)/);
assert.match(runner,/activeEvent=null;eventSeconds=0;eventTriggered=false;/,"fresh event on next weekday");
assert.match(runner,/activeEvent\?\.id==="rush"\?1\.30:1/,"rush speeds obstacle spawning");
assert.match(runner,/if\(activeEvent\?\.id==="rush"\)speed\*=1\.20/);
const scoreFnMatch=runner.match(/function addScore\(n\)\{[^}]+\}/);
assert.ok(scoreFnMatch);
const eventScore=(id)=>new Function("activeEvent",[
   'let score=0,combo=0;const updateLabels=()=>{};',
   scoreFnMatch[0],'addScore(100);return score;'
 ].join("\n"))(id?{id}:null);
assert.equal(eventScore(null),100);
assert.equal(eventScore("focus"),135);
assert.match(runner,/if\(day===4&&dayTime>=13&&!fridayBossAnnounced\)/,"Friday boss warning once");
assert.match(runner,/Math\.floor\(\(dayTime-13\)\/2\.7\)%2===0\?\.25:\.75/,"Friday wave alternates two lanes");
// Existing weekday upgrades now present clear consequences and fair choices.
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
assert.match(runner,/activeEvent&&eventSeconds>0/,"events only appear while active");
assert.match(html,/teacher-volleyball\.html\?v=20261119-core-game1/);
assert.match(html,/teacher-run\.html\?v=20261119-core-game1/);
console.log("PASS: volleyball impact and boss cues; run 5-day events, timed bonuses, upgrade choices and Friday pattern");

// Ball reception physics and earned stamina recovery.
assert.doesNotMatch(volley,/ball\.x\s*=\s*p\.x\s*\+\s*sign\s*\*\s*\(reach\s*\+\s*R\s*\+\s*1\)/);
assert.doesNotMatch(volley,/ball\.y\s*=\s*Math\.min\(ball\.y,\s*p\.y\s*-\s*22\)/);
assert.match(volley,/const handX=p\.x\+sign\*29, handY=p\.y-15/);
assert.match(volley,/const push=Math\.min\(12,Math\.max\(0,reach\+R-contactDistance\+1\)\)/);
assert.match(volley,/const framesToNet=clamp\(\(NET_X-ball\.x\)\/ball\.vx,4,45\)/);
assert.match(volley,/ball\.spin\+=ball\.vx\*\.009/);
assert.match(volley,/ctx\.rotate\(ball\.spin\)/);
assert.match(volley,/if\(p\.contactFrames>0\)/);
assert.match(volley,/if\(left\.contactFrames>0\)left\.contactFrames--/);
const healsMatch=volley.match(/const receiveHealProfiles=(\{[^}]+\});/);
assert.ok(healsMatch);
const heals=new Function("return "+healsMatch[1])();
assert.deepEqual(heals,{easy:10,normal:9,hard:8,very_hard:7,extreme:6});
assert.match(volley,/state\.receiveStreak%3===0\?12:0/);
assert.match(volley,/if\(!spike&&!charged&&incomingVx< -1\)/);
assert.match(volley,/state\.receiveStreak=0/);
assert.match(volley,/state\.rightScore \+= 1; state\.receiveStreak=0/);
assert.match(volley,/textLabel\("💚 \+"\+state\.healAmount\+" 체력"/);
const hitStart=volley.indexOf("function playerHit(p,ball=activeBalls[0]) {");
const hitEnd=volley.indexOf("function finishMatch(",hitStart);
assert.ok(hitStart>0&&hitEnd>hitStart);
const hitSrc=volley.slice(hitStart,hitEnd);
const contact=new Function("ball","state","p","tier",[
 'const currentDifficulty=tier,R=48,NET_X=450,NET_TOP=342,AUTO_SPIKE_SPEED=8;',
 'const battle={allyReach:1,enemyReach:1,allyAttack:1,enemyAttack:1,enemySmashChance:0};',
 'const energy={allyCost:1,enemyCost:1};',
 'const receiveHealProfiles='+healsMatch[1],
 'const ballSpeedFactor=()=>1,energyFactor=()=>1,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));',
 'let status="";const setStatus=s=>{status=s;},tone=()=>{},spikeSound=()=>{},updateEnergyUI=()=>{};',
 hitSrc,'playerHit(p,ball);return status;'
].join("\n"));
function contactCase(tier="hard"){
 const ball={x:248,y:376,vx:-8,vy:3,cooldown:0,spin:0,trail:[],shadowFrames:0};
 const state={leftEnergy:60,leftMaxEnergy:100,rightEnergy:100,rightMaxEnergy:100,specialChargeFrames:0,
   bossWarnFrames:0,playFrames:100,spikes:0,receiveStreak:0,healFrames:0,healAmount:0};
 const p={x:210,y:420,vx:0,vy:0,impactSpeed:0,side:"left",contactFrames:0};
 return {ball,state,p,receive(){
  Object.assign(ball,{x:248,y:376,vx:-8,vy:3,cooldown:0});
  return contact(ball,state,p,tier);
 }};
}
const reception=contactCase();
const notice=reception.receive();
assert.match(notice,/리시브 성공/);
assert.equal(reception.state.leftEnergy,62,"6 used, 8 recovered");
assert.equal(reception.state.healAmount,8);
assert.equal(reception.state.receiveStreak,1);
assert.ok(Math.hypot(reception.ball.x-248,reception.ball.y-376)<=12.01,"no ball teleportation");
assert.ok(reception.ball.vx>0&&reception.ball.vy<0,"outbound arc");
assert.ok(reception.p.contactFrames>0,"receiver animates hands");
reception.receive();
assert.match(reception.receive(),/연속 리시브 3회/);
assert.equal(reception.state.receiveStreak,3);
assert.equal(reception.state.leftEnergy,78,"three returns trigger +12 bonus");
assert.equal(reception.state.healAmount,20);
const full=contactCase();full.state.leftEnergy=99;full.receive();
assert.equal(full.state.leftEnergy,100,"HP capped");
const extremeCase=contactCase("extreme");extremeCase.receive();
assert.equal(extremeCase.state.healAmount,6);
const spikeCase=contactCase();spikeCase.p.impactSpeed=12;spikeCase.receive();
assert.equal(spikeCase.state.receiveStreak,0,"spikes do not heal");
assert.equal(spikeCase.state.healAmount,0);
console.log("PASS: arm-centered contact, smooth non-teleporting volley returns, forearm animation and earned healing");








// Difficulty asymmetry: EXTREME double-ball and chain, EASY/NORMAL clones, automatic chalk.
const cloneProfileMatch=volley.match(/const cloneProfiles=(\{[^}]+\});/);
assert.ok(cloneProfileMatch,"helper clones exist");
const cloneCounts=new Function("return "+cloneProfileMatch[1])();
assert.deepEqual(cloneCounts,{easy:2,normal:1,hard:0,very_hard:0,extreme:0});
const formation=(tier,serveLeft=true)=>new Function("tier","serveLeft",[
 "const currentDifficulty=tier,FLOOR=451,NET_X=450,clamp=(x,a,b)=>Math.max(a,Math.min(b,x));",
 "const volleyShackle={x:0,dir:-1},left={},right={},ball={trail:[]},secondBall={trail:[]};",
 "const state={serveLeft},activeBalls=[ball],clones=[],cloneProfiles="+cloneProfileMatch[1],
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
const helperStart=volley.indexOf("function cloneHit(ally,hitBall){");
const helperEnd=volley.indexOf("function moveAI()",helperStart);
assert.ok(helperStart>0&&helperEnd>helperStart);
const cloneHitSrc=volley.slice(helperStart,helperEnd);
const testCloneHit=new Function("hitBall","ally",[
 "const R=48,ballSpeedFactor=()=>1,tone=()=>{};",
 cloneHitSrc,"return cloneHit(ally,hitBall);"
].join("\n"));
const testHelper={x:210,y:420,contactFrames:0};
const protectedBall={x:240,y:380,vx:-9,vy:4,cooldown:0,shadowFrames:0,shadowColor:""};
assert.equal(testCloneHit(protectedBall,testHelper),true,"clone actually receives incoming ball");
assert.ok(protectedBall.vx>0&&protectedBall.vy<0,"clone returns ball over net");
assert.equal(protectedBall.cooldown,11,"clone cannot rapidly re-hit same ball");
assert.ok(testHelper.contactFrames>0,"helper contact animation runs");
assert.equal(testCloneHit({x:240,y:380,vx:8,vy:4,cooldown:0},testHelper),false,"clone never hits outbound ball");
assert.match(volley,/function drawVolleyShackle\(\)/);
assert.match(volley,/currentDifficulty!=="extreme"\|\|state\.phase==="ready"/);
assert.match(volley,/volleyShackle\.dir=left\.x>beforeMoveX\?-1:1/,"volleyball shackle trails movement direction");
assert.match(volley,/drawTeacher\(left, "#448bd8"\);\s*drawVolleyShackle\(\)/,"volleyball chain drawn on ankle");
const chalkMatch=runner.match(/const chalkProfiles=(\{[^\n]+\});/);
assert.ok(chalkMatch);
const chalkProfiles=new Function("return "+chalkMatch[1])();
assert.equal(chalkProfiles.easy.maxShots,2);
assert.equal(chalkProfiles.normal.maxShots,1);
assert.ok(chalkProfiles.easy.interval<chalkProfiles.normal.interval);
for(const t of ["hard","very_hard","extreme"])assert.equal(chalkProfiles[t],undefined,t+" disables chalk");
const chalkStart=runner.indexOf("function fireChalk(dt){");
const chalkEnd=runner.indexOf("function drawChalk(){",chalkStart);
assert.ok(chalkStart>0&&chalkEnd>chalkStart);
const chalkSource=runner.slice(chalkStart,chalkEnd);
const shoot=(tier,good=false)=>new Function("tier","good",[
 "const chalkProfiles="+chalkMatch[1],
 "const chalkProfile=()=>chalkProfiles[tier]||null;",
 'const state="playing",player={x:300,y:368};',
 'let items=[{x:300,y:260,good,r:23}],chalkShots=[],chalkCooldown=0,score=0,removed=0;',
 'const burst=()=>{removed++;},float=()=>{},playTone=()=>{},addScore=n=>{score+=n;};',
 chalkSource,
 'fireChalk(.05);const created=chalkShots.length;',
 'for(let i=0;i<5;i++)updateChalk(.05);',
 'return {created,remaining:items.length,score,removed};'
].join("\n"))(tier,good);
assert.deepEqual(shoot("easy"),{created:1,remaining:0,score:25,removed:1},"EASY chalk automatically destroys falling hazard");
assert.deepEqual(shoot("normal"),{created:1,remaining:0,score:25,removed:1},"NORMAL chalk also protects");
assert.deepEqual(shoot("hard"),{created:0,remaining:1,score:0,removed:0},"HARD has no chalk");
assert.deepEqual(shoot("extreme"),{created:0,remaining:1,score:0,removed:0},"EXTREME has no chalk");
assert.deepEqual(shoot("easy",true),{created:0,remaining:1,score:0,removed:0},"healing pickups are never shot");
assert.match(runner,/function drawShackle\(\)/);
assert.match(runner,/if\(profile\.jumpEnabled!==false\|\|state==="ready"\)return/);
assert.match(runner,/if\(profile\.jumpEnabled===false\)\{/,"runner shackle only follows EXTREME steps");
assert.match(runner,/shackle\.dir=player\.x>oldX\?-1:1/);
assert.match(runner,/drawItems\(\);drawChalk\(\);drawShackle\(\);playerDraw\(\)/);
assert.match(runner,/chalkShots=\[\];chalkCooldown=\.35/,"projectiles reset on new run");
assert.match(runner,/chalkShots=\[\];chalkCooldown=\.4/,"projectiles reset on next day");
assert.match(html,/teacher-volleyball\.html\?v=20261119-core-game1/);
assert.match(html,/teacher-run\.html\?v=20261119-core-game1/);
console.log("PASS: EXTREME dual volleyballs and both dragging shackles; EASY/NORMAL helper clones and automatic chalk aiming");

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
  if(site.body.includes("teacher-volleyball.html?v=20261119-core-game1")&&
     site.body.includes("teacher-run.html?v=20261119-core-game1"))return site;
  await new Promise(resolve=>setTimeout(resolve,8000));
 }
 throw new Error("Published game iframe versions did not update");
}
const [site,topVolley,topRun]=await Promise.all([
 waitForPublishedHome(),
 requestWithRetry(api+"?game=volleyball",200,{headers:origin}),
 requestWithRetry(api+"?game=teacher_run",200,{headers:origin})
]);
assert.match(site.body,/teacher-volleyball\.html\?v=20261119-core-game1/);
assert.match(site.body,/teacher-run\.html\?v=20261119-core-game1/);
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

