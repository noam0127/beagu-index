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
assert.match(volley,/43 \* \.75 \* battle\.allyReach/,"baseline reach is tier-adjusted");
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
// Personal high score shown upper-right is saved per device.
assert.match(volley,/class="volley-best-row"/);
assert.match(volley,/id="volley-best-label"/);
assert.ok(volley.indexOf('class="volley-best-row"')<volley.indexOf('id="player-score"'),"best score precedes team scores");
assert.match(volley,/const BEST_KEY="teacherVolleyballBestV1"/);
assert.match(volley,/rememberBest\(getFinalScore\(\)\)/,"finished game updates personal best");
const bestSource=volley.slice(volley.indexOf('function rememberBest(score){'),volley.indexOf('const canPlayerJump='));
assert.ok(bestSource.includes("localStorage.setItem"),"personal high score persists");
const mockStore={value:null,setItem(k,v){this.value=v;}},bestLabel={textContent:""};
const updatedBest=new Function("localStorage","bestLabel",[
 'let bestScore=0;const BEST_KEY="teacherVolleyballBestV1";',
 bestSource,
 'rememberBest(1390);rememberBest(1000);',
 'return bestScore;'
].join("\n"))(mockStore,bestLabel);
assert.equal(updatedBest,1390,"lower finish cannot replace high score");
assert.equal(mockStore.value,"1390");
assert.match(bestLabel.textContent,/1,390/);
// Intro overlay now reflects school choice instead of permanent PRESS START.
assert.doesNotMatch(volley,/overlay\("PRESS START"/);
const introStart=volley.indexOf('if (state.phase === "ready") {',volley.indexOf('function render()'));
const introEnd=volley.indexOf('else if (state.phase === "paused")',introStart);
assert.ok(introStart>0&&introEnd>introStart);
const overlaySnippet=volley.slice(introStart,introEnd);
const introOverlay=new Function("school",[
 'const state={phase:"ready"},schoolPicker={get:()=>school};',
 'const diffName={extreme:"EXTREME",easy:"EASY"};',
 'let shown=null;const overlay=(...args)=>{shown=args;};',
 overlaySnippet,
 'return shown;'
].join("\n"));
assert.equal(introOverlay(null)[0],"학교를 선택하세요");
assert.equal(introOverlay({eligible:true,school_name:"가람초등학교",difficulty:"easy"})[0],"가람초등학교");
assert.equal(introOverlay({eligible:false})[0],"조사 참여 필요");
// Permanent double-touch helper copy removed; core special actions remain.
assert.doesNotMatch(volley,/id="volley-special-status"|class="volley-special-status"/);
assert.doesNotMatch(runner,/id="run-special-status"|class="arcade-run-special-status"/);
assert.match(volley,/function activateSuperSpike\(\)/);
assert.match(runner,/function activateSpecial\(\)/);
console.log("PASS: EXTREME ground restriction, personal HI-SCORE, school-intro overlay and tutorial text removal");

// Life depletion → round reset → final KO, spike shadows and sound toggle.
const volleyLifeSource=volley.match(/const lifeProfiles=(\{[^}]+\});/);
assert.ok(volleyLifeSource,"volleyball has tier-based life profiles");
const volleyLifeProfile=new Function("return "+volleyLifeSource[1])();
assert.deepEqual(volleyLifeProfile,{easy:3,normal:2,hard:2,very_hard:1,extreme:1});
assert.match(volley,/id="volley-lives"/);
assert.match(volley,/id="volley-round-label"/);
assert.match(volley,/id="player-energy-progress"/);
assert.match(volley,/id="sound" class="sound-toggle"/);
assert.match(volley,/soundButton\.addEventListener\("click"/);
assert.match(volley,/localStorage\.setItem\(SOUND_KEY/);
assert.match(volley,/function unlockSound\(\)/);
assert.match(volley,/window\.AudioContext\|\|window\.webkitAudioContext/);
assert.match(volley,/function spikeSound\(superSpike=false\)/);
assert.match(volley,/spikeSound\(charged\)/);
assert.match(volley,/ball\.shadowFrames=charged\?26:18/);
assert.match(volley,/ball\.trail\.length > \(ball\.shadowFrames>0\?14:6\)/);
assert.match(volley,/if\(ball\.shadowFrames>0\)/);
assert.match(volley,/ctx\.ellipse\(ball\.x-ball\.vx\*i\*1\.55/);
const volleyFunctionsStart=volley.indexOf('function finishMatch(knockout=false){');
const volleyFunctionsEnd=volley.indexOf('function step() {',volleyFunctionsStart);
assert.ok(volleyFunctionsStart>0&&volleyFunctionsEnd>volleyFunctionsStart);
const volleyLifeFunctions=volley.slice(volleyFunctionsStart,volleyFunctionsEnd);
const lifeTestState={
 phase:"playing",leftEnergy:0,rightEnergy:75,leftMaxEnergy:100,rightMaxEnergy:100,
 livesLeft:2,maxLives:2,round:1,knockout:false,leftScore:3,rightScore:1,spikes:2
};
const lifeObserved={resets:0,positions:0,rank:null,unlocked:0};
const mockedLifeFunctions=new Function("state","observed",[
  'const tone=()=>{},releaseKeys=()=>{},syncUI=()=>{},updateEnergyUI=()=>{},setStatus=()=>{};',
  'const schoolPicker={setLocked:()=>{observed.unlocked++;}};',
  'const rememberBest=()=>{},getFinalScore=()=>550,getBaseScore=()=>270,getSurvivalSeconds=()=>70,getSurvivalBonus=()=>280;',
  'const resetEnergy=()=>{observed.resets++;state.leftEnergy=100;};',
  'const resetPositions=()=>{observed.positions++;};',
  'const ranking={finish:(score,stats)=>{observed.rank={score,stats};}};',
  'const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),energy={allyCost:1,enemyCost:1};',
  volleyLifeFunctions,'return {loseLife,point,finishMatch};'
].join("\n"))(lifeTestState,lifeObserved);
assert.equal(mockedLifeFunctions.loseLife(),true);
assert.equal(lifeTestState.livesLeft,1,"first exhaustion consumes exactly one life");
assert.equal(lifeTestState.round,2,"first exhaustion advances round");
assert.equal(lifeTestState.phase,"point","round intermission protects the user from instant repeated KO");
assert.equal(lifeTestState.leftEnergy,100,"round restores stamina");
assert.equal(lifeObserved.resets,1);
assert.equal(lifeObserved.positions,1);
assert.equal(lifeObserved.rank,null,"intermediate rounds do not submit records");
lifeTestState.phase="playing";lifeTestState.leftEnergy=0;
assert.equal(mockedLifeFunctions.loseLife(),true);
assert.equal(lifeTestState.livesLeft,0);
assert.equal(lifeTestState.phase,"finished");
assert.equal(lifeTestState.knockout,true);
assert.equal(lifeObserved.rank.stats.knockout,true);
assert.equal(lifeObserved.rank.stats.livesLost,2);
assert.equal(lifeObserved.rank.stats.survivalSeconds,70);
assert.equal(lifeObserved.rank.score,550);
assert.equal(lifeObserved.resets,1,"final KO must not start a new round");
// Server accepts verified difficulty-based knockouts before seven points.
assert.equal(scoreFns.scoreFromVolleyball({
 player:3,cpu:1,spikes:2,survivalSeconds:70,knockout:true,livesLost:1
},80,"extreme"),3*120+2*25+70*4,"KO receives no undeserved victory bonus");
assert.equal(scoreFns.scoreFromVolleyball({
 player:3,cpu:1,spikes:2,survivalSeconds:70,knockout:true,livesLost:2
},80,"hard"),3*120+2*25+70*4,"hard two-life KO allowed");
assert.throws(()=>scoreFns.scoreFromVolleyball({
 player:3,cpu:1,spikes:2,survivalSeconds:70,knockout:true,livesLost:1
},80,"hard"),/invalid_lives/);
assert.throws(()=>scoreFns.scoreFromVolleyball({
 player:7,cpu:1,spikes:2,survivalSeconds:70,knockout:true,livesLost:1
},80,"extreme"),/invalid_match/);
assert.throws(()=>scoreFns.scoreFromVolleyball({
 player:3,cpu:1,spikes:2,survivalSeconds:90,knockout:true,livesLost:1
},70,"extreme"),/invalid_survival_time/);
assert.throws(()=>scoreFns.scoreFromVolleyball({
 player:3,cpu:1,spikes:2,survivalSeconds:70,knockout:true,livesLost:1
},80,"mystery"),/invalid_lives/);
assert.equal(scoreFns.scoreFromVolleyball({
 player:7,cpu:3,spikes:2,survivalSeconds:70
},80,"easy"),7*120+2*25+600+(7-3)*30+70*4,"normal winning match remains compatible");
assert.match(backend,/scoreFromVolleyball\(payload\.stats,elapsed,session\.difficulty\)/);
console.log("PASS: volleyball life rounds, final KO, tier verification, time score, shaded spike trails and sound control");

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
 "const FLOOR=451,NET_X=450,state={serveLeft},left={},right={},ball={trail:[]};",
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
  if(site.body.includes("teacher-volleyball.html?v=20261119-netballscore1")&&
     site.body.includes("teacher-run.html?v=20261119-extreme-best-intro1"))return site;
  await new Promise(resolve=>setTimeout(resolve,8000));
 }
 throw new Error("Published game iframe versions did not update");
}
const [site,topVolley,topRun]=await Promise.all([
 waitForPublishedHome(),
 requestWithRetry(api+"?game=volleyball",200,{headers:origin}),
 requestWithRetry(api+"?game=teacher_run",200,{headers:origin})
]);
assert.match(site.body,/teacher-volleyball\.html\?v=20261119-netballscore1/);
assert.match(site.body,/teacher-run\.html\?v=20261119-extreme-best-intro1/);
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

