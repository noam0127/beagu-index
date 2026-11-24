const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
let time=0;const window={};vm.runInNewContext(fs.readFileSync('js/arcade-gestures-v1.js','utf8'),{window,performance:{now:()=>time},Math});
const e=(id=1,x=100,y=100)=>({pointerId:id,clientX:x,clientY:y});
let g=window.BeaguArcadeGestures.create();
function tap(t,x=100,y=100){time=t;g.down(e(1,x,y));time+=30;return g.up(e(1,x,y));}
assert.equal(tap(0),false);assert.equal(tap(100),true);assert.equal(tap(200),false);
g.cancel();assert.equal(tap(300),false);time=400;g.down(e());g.move(e(1,150));assert.equal(g.up(e(1,150)),false);assert.equal(tap(450),false);
g.cancel();assert.equal(tap(600),false);assert.equal(tap(1000),false);g.cancel();assert.equal(tap(1100),false);assert.equal(tap(1200,170),false);
g.cancel();time=1300;g.down(e());g.cancel();assert.equal(g.up(e()),false);assert.equal(tap(1400),false);
const read=p=>fs.readFileSync(p,'utf8');const v=read('teacher-volleyball.html'),r=read('teacher-run.html');
for(const s of [v,r]){assert.equal((s.match(/id="pause"/g)||[]).length,1);assert.match(s,/id="pause" class="arcade-playback"/);for(const m of s.matchAll(/<script>([\s\S]*?)<\/script>/g))new Function(m[1]);}
assert.match(v,/if\(state.phase==="paused"\)return;/);assert.match(v,/pausedPhase=state.phase;state.phase="paused";releaseKeys\(true\)/);assert.match(v,/state.phase=pausedPhase/);assert.match(v,/if\(!preserveMomentum\)\{state.dashFrames=0;state.spikeBufferFrames=0;left.vy=0/);assert.match(v,/hasPlayerWings\(\)&&canPlayerJump\(\)/);assert.match(v,/15.8\*battle.allyJump/);
assert.match(r,/tapGesture\.up\(e\)/);assert.match(r,/tapGesture\.move\(e\)/);assert.doesNotMatch(v,/volley-joystick|id="volley-spike"|id="volley-dash"/);assert.match(v,/id="volley-attack"/);assert.match(r,/isMysteryBuff\("wings"\)/);assert.match(r,/ctx.globalAlpha=.07/);assert.match(r,/lines.slice\(0,2\)/);assert.doesNotMatch(r,/id="run-fullscreen-pause"/);
const rail=read('js/arcade-scroll-rail-v1.js');assert.doesNotMatch(rail,/createElement|pointerdown/);assert.match(rail,/show:hide/);{const v=JSON.parse(read('release-info.json')).version;const candidate=JSON.parse(read('release-candidate.json')).version;const versions=JSON.parse(read('development-roadmap.json')).versions.map(x=>x.version);assert.equal(v,candidate);assert.ok(versions.includes('v1.4.0')&&versions.indexOf(v)>=versions.indexOf('v1.4.0'),'candidate includes feature release');}
console.log('PASS: tap/drag/cancel, pause source contracts, old flight rules and retired rail');

// Real target helper: jump is single-use; normal mode cannot fly, flight mode can.
const touchWindow={};vm.runInNewContext(read('js/volley-touch-v1.js'),{window:touchWindow,Math});
const t=touchWindow.BeaguVolleyTouch.create();assert.equal(t.down(1,{x:300,y:120},420),true);assert.equal(t.down(2,{x:400,y:100},420),false);
assert.equal(t.axes(210,420,false).x,1);assert.equal(t.axes(210,420,false).y,0);assert.equal(t.takeJump(),true);assert.equal(t.takeJump(),false);
assert.equal(t.limitX(12,295),5);t.up(1,false);assert.equal(t.axes(295,420,false).x,1);t.settled(300,false);assert.equal(t.axes(300,420,false),null);
t.down(3,{x:100,y:100},420);assert.equal(t.axes(210,420,true).y,-1);t.up(3,true);assert.equal(t.axes(210,420,true),null);
t.down(4,{x:100,y:100},420);t.cancel(4);assert.equal(t.axes(210,420,false),null);assert.equal(t.takeJump(),false);
assert.match(v,/if\(!canPlayerJump\(\)\)\{left.y=FLOOR-31;left.vy=0;\}/);assert.match(v,/canPlayerJump\(\)&&\(keys.jump\|\|keys.up\|\|touchJump\)/);
assert.match(v,/if\(attackPointer!==null\)\{\s*aimDash\(inputX,inputY\);state.dashCooldownFrames=0;state.spikeBufferFrames=SPIKE_BUFFER;/);
assert.match(v,/p.contactFrames=spike\|\|cpuSmash\?12:9/);
console.log('PASS target touch jump, flight exception, pointer cancel, unlimited held attack and contact debounce');

// Desktop keyboard keeps its original direction, jump and cooldown. Mobile only has unlimited attack.
assert.match(v,/if\(e.code==="KeyJ"\)\{e.preventDefault\(\);if\(!e.repeat\)requestSpike\(\);return;\}/);
assert.match(v,/if\(!e.repeat\)requestDash\(\);return;/);
assert.match(v,/\(!mobile&&state.dashCooldownFrames>0\)/);assert.match(v,/state.dashCooldownFrames=mobile\?0:DASH_COOLDOWN/);
assert.match(v,/event.pointerType==="mouse"\|\|state.phase!=="playing"/);
assert.match(v,/const inputX=axes\?axes.x:keyboardDirection/);
assert.match(v,/const inputY=axes\?axes.y:keyboardVertical/);

// 4.0 pure rules: timeline boundaries, independent avoidance rewards, one-time crises.
const run4Window={};vm.runInNewContext(read('js/teacher-run-4-rules.js'),{window:run4Window,Math});
const rules=run4Window.BeaguRun4Rules;
assert.equal(rules.duration,190);assert.equal(rules.age(0),24);assert.equal(rules.age(190),62);
for(const [time,round] of [[0,0],[29.99,0],[30,1],[79.99,1],[80,2],[129.99,2],[130,3],[179.99,3],[180,4],[190,4]])assert.equal(rules.roundAt(time),round);
const career=rules.create(),obstacle={good:false};
assert.equal(career.nearMiss(obstacle,10),90);assert.equal(career.nearMiss(obstacle,10),0);
assert.equal(career.nearMiss({},0),0);assert.equal(career.nearMiss({good:true},10),0);
for(let n=2;n<=32;n++)assert.equal(career.nearMiss({},10),Math.round(90*(n>=30?3:n>=20?2:n>=10?1.5:n>=5?1.2:1)));
assert.equal(career.stats().maxCombo,32);career.hit(35);assert.equal(career.stats().combo,0);
assert.equal(career.health(40,10,100).length,0);assert.equal(career.health(44.9,10,100).length,0);
assert.equal(career.health(45,10,100)[0].id,'low-survival');assert.equal(career.health(46,10,100).length,0);
assert.equal(career.health(50,80,100)[0].id,'low-recovery');assert.equal(career.health(51,100,100).length,0);
assert.equal(career.complete(189.9).length,0);assert.equal(career.complete(190)[0].id,'final-ten');assert.equal(career.complete(190).length,0);
const late=rules.create();late.hit(181);assert.equal(late.complete(190).length,0);
const preview=read('teacher-run-4-preview.html');assert.doesNotMatch(preview,/new window\.ArcadeLeaderboard|teacherRunRetirementBestV1/);
assert.match(preview,/teacherRun4PreviewBestV1/);assert.match(preview,/beagu-game-lv1-gate-v1\.js/);assert.match(preview,/run4\.nearMiss\(a,a\.closestClearance\)/);
assert.match(preview,/!document.hidden&&!\$\("teacher-run-protected"\).hidden/);
console.log('PASS 4.0 exact round boundaries, avoidance rewards, crisis deduplication, separate local-only preview');

// Result sharing only consumes local game state; no account or school identifiers.
const resultWindow={};vm.runInNewContext(read('js/arcade-result-share-v1.js'),{window:resultWindow});
const resultTitle=resultWindow.BeaguArcadeResult.volleyballTitle;
assert.match(resultTitle({won:true,opponent:20,maxDeficit:5}).title,/대역전승/);
assert.match(resultTitle({won:true,opponent:24,maxDeficit:1}).title,/역전승/);
assert.match(resultTitle({won:true,opponent:0,maxDeficit:0}).title,/25대 0/);
assert.match(resultTitle({won:true,opponent:24,maxDeficit:0}).title,/접전/);
assert.match(resultTitle({won:true,opponent:9,maxDeficit:0}).title,/압승/);
assert.doesNotMatch(resultTitle({won:false,early:true,opponent:2,maxDeficit:4}).title,/승리|역전승/);
const shareSource=read('js/arcade-result-share-v1.js');assert.match(shareSource,/navigator\.clipboard\.write/);assert.match(shareSource,/image\/png/);assert.match(shareSource,/indischool\.com\/tweets\/channels\/lounge/);assert.doesNotMatch(shareSource,/fetch\(|sessionStorage|localStorage|school_name|school_id/);
for(const p of ['teacher-volleyball.html','teacher-run.html','teacher-run-4-preview.html'])assert.match(read(p),/resultView\.show\(/);
console.log('PASS result title classification, local-only PNG share and no automatic posting');

// Leave: persistent pickup opportunity, independently stored tickets, one-use and no stacking.
const lv=rules.createLeave();assert.equal(lv.advance(24.99).length,0);assert.equal(lv.advance(25)[0].days,3);assert.equal(lv.advance(30).length,0);assert.equal(lv.advance(50)[0].days,5);assert.equal(lv.state().pending.length,2);assert.equal(lv.collect(5),true);assert.equal(lv.collect(5),false);assert.equal(lv.collect(10),true);assert.equal(lv.use(5,51,50,100).hp,80);assert.equal(lv.active(53.99),true);assert.equal(lv.use(10,53,80,100),null);assert.equal(lv.active(54),false);assert.equal(lv.use(10,54,80,100).hp,100);assert.equal(lv.use(10,60,20,100),null);assert.equal(lv.advance(100)[0].days,7);assert.equal(lv.collect(20),true);assert.equal(lv.use(20,120,10,100).hp,80);assert.equal(lv.state().used,3);assert.equal(lv.remaining(120),7);assert.equal(lv.active(127),false);assert.match(preview,/leave\.active\(clock\)\|\|player\.inv>0/);assert.match(preview,/leave\.advance\(clock\)/);assert.match(preview,/run4-leave-fullscreen/);console.log('PASS leave inventory milestones, healing, invulnerability duration, non-stacking and single consumption');
