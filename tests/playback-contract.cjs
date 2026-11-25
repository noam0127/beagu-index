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
assert.match(r,/tapGesture\.up\(e\)/);assert.match(r,/tapGesture\.move\(e\)/);assert.doesNotMatch(v,/volley-joystick|id="volley-spike"|id="volley-dash"/);assert.doesNotMatch(v,/id="volley-attack"/);assert.match(v,/attackPointer=event.pointerId;[\s\S]*?distance\/dt>=\.65/);assert.match(r,/isMysteryBuff\("wings"\)/);assert.match(r,/ctx\.textBaseline="middle"/);assert.match(r,/lines.slice\(0,2\)/);assert.doesNotMatch(r,/id="run-fullscreen-pause"/);
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
assert.match(v,/distance\/dt>=\.65[\s\S]*?state.dashCooldownFrames=0;state.spikeBufferFrames=SPIKE_BUFFER;/);assert.match(v,/e.code==="Space"[\s\S]*?requestSpike\(\);requestDash\(\)/);
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
const shareSource=read('js/arcade-result-share-v1.js');assert.doesNotMatch(shareSource,/navigator\.clipboard\.write/);assert.match(shareSource,/게임결과 저장/);assert.match(shareSource,/a\.download="baegu-game-result\.png"/);assert.match(shareSource,/image\/png/);assert.match(shareSource,/indischool\.com\/tweets\/channels\/lounge/);assert.doesNotMatch(shareSource,/fetch\(|sessionStorage|localStorage|school_name|school_id/);
for(const p of ['teacher-volleyball.html','teacher-run.html','teacher-run-4-preview.html'])assert.match(read(p),/resultView\.show\(/);
console.log('PASS result title classification, local-only PNG share and no automatic posting');

// Leave: persistent pickup opportunity, independently stored tickets, one-use and no stacking.
const lv=rules.createLeave();assert.equal(lv.advance(24.99).length,0);assert.equal(lv.advance(25)[0].days,3);assert.equal(lv.advance(30).length,0);assert.equal(lv.advance(50)[0].days,5);assert.equal(lv.state().pending.length,2);assert.equal(lv.collect(5),true);assert.equal(lv.collect(5),false);assert.equal(lv.collect(10),true);assert.equal(lv.use(5,51,50,100).hp,80);assert.equal(lv.active(53.99),true);assert.equal(lv.use(10,53,80,100),null);assert.equal(lv.active(54),false);assert.equal(lv.use(10,54,80,100).hp,100);assert.equal(lv.use(10,60,20,100),null);assert.equal(lv.advance(100)[0].days,7);assert.equal(lv.collect(20),true);assert.equal(lv.use(20,120,10,100).hp,80);assert.equal(lv.state().used,3);assert.equal(lv.remaining(120),7);assert.equal(lv.active(127),false);assert.match(preview,/leave\.active\(clock\)\|\|player\.inv>0/);assert.match(preview,/leave\.advance\(clock\)/);assert.match(preview,/run4-leave-fullscreen/);console.log('PASS leave inventory milestones, healing, invulnerability duration, non-stacking and single consumption');

// Exact copy change; no new referral entitlement or server action.
assert.match(read('js/challenge-referral-v1.js'),/동료에게 링크를 보내 1명 이상 참여하면 Lv\.2로 레벨업됩니다\./);assert.doesNotMatch(read('js/challenge-referral-v1.js'),/동료에게 링크를 보내세요\. 설문 참여가 확인되면 추천이 누적됩니다\./);
const gr=rules.createGrowth();assert.equal(gr.next(24.99),null);for(const year of [5,10,15,20,25,30,35]){const p=gr.next(year*5,()=>.5);assert.equal(p.year,year);assert.equal(p.choices.length,3);assert.equal(new Set(p.choices.map(x=>x.id)).size,3);assert.equal(gr.next(year*5),null);assert.equal(gr.choose("invalid"),false);assert.equal(gr.choose(p.choices[0].id),true);assert.equal(gr.choose(p.choices[0].id),false);assert.equal(gr.next(year*5),null);}assert.equal(gr.next(190),null);const cap=rules.createGrowth();for(let i=0;i<3;i++)assert.equal(cap.grant("guidance"),true);assert.equal(cap.grant("guidance"),false);assert.equal(cap.effects().damage,Math.pow(.8,3));assert.equal(cap.grant("shield"),true);assert.equal(cap.absorb(),true);assert.equal(cap.absorb(),false);assert.doesNotMatch(preview,/growth\.next\(clock,gameRandom\)/);assert.match(preview,/growth\.afterBoss\(defeated.id,gameRandom\)/);const after=rules.createGrowth();for(const b of rules.bossPlan){const pick=after.afterBoss(b.id,()=>.5);assert.equal(pick.choices.length,3);assert.equal(after.choose(pick.choices[0].id),true);assert.equal(after.afterBoss(b.id,()=>.5),null);}assert.match(preview,/function tenureEvents/);console.log('PASS seven growth selections, ten capped abilities, milestone separation, shield consumption and exact referral copy');

for(const p of ['teacher-run.html','teacher-run-4-preview.html']){const s=read(p);assert.match(s,/\{label:"↻ 다시 하기",action:\(\)=>start\(\)\},\s*\{label:"🏫 다른 학교",action:stopAndChangeSchool\}/);assert.match(s,/classList\.add\("arcade-result-replay-row"\)/);assert.match(s,/classList\.remove\("arcade-result-replay-row"\)/);}assert.match(read('styles/arcade-result-share-v1.css'),/\.panel \.choices\.arcade-result-replay-row\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);console.log('PASS survival result replay and school-change actions');

assert.equal(rules.items.length,16);assert.equal(rules.events.length,7);assert.equal(rules.pickEvent(0,()=>0,true),null);for(let st=0;st<5;st++)assert.ok(rules.pickEvent(st,()=>.99).stages.includes(st));const effect=rules.createEffects();effect.set("coffee",0,6);effect.set("coffee",1,6);effect.set("insomnia",1,5);assert.ok(effect.values(2).speed>=.65&&effect.values(2).speed<=1.35);assert.equal(effect.values(7).speed,1);effect.set("parental",10,5);assert.equal(effect.values(14.99).noSpawn,true);assert.equal(effect.values(15).noSpawn,false);effect.addShield();effect.addShield();assert.equal(effect.consumeShield(),true);assert.equal(effect.consumeShield(),false);assert.match(preview,/function applyFeature/);assert.match(preview,/rules\.pickEvent\(stage,gameRandom,/);console.log('PASS 16 item settings, seven stage-aware events, capped timed effects and shield');

const bc=rules.createBosses("normal");assert.equal(bc.advance(19.99).started,null);for(const b of rules.bossPlan){assert.equal(bc.advance(b.start).started.id,b.id);assert.equal(bc.advance(b.start+.01).started,null);assert.equal(bc.damage(999,b.start+.02).id,b.id);assert.equal(bc.damage(999,b.start+.03),null);assert.equal(bc.advance(b.end).started,null);}assert.equal(bc.defeated().length,5);const expiry=rules.createBosses("hard");expiry.advance(20);assert.equal(expiry.active().maxHP,Math.ceil(92*1.5));assert.equal(expiry.advance(30).expired,"confusion");assert.equal(expiry.active(),null);assert.equal(expiry.damage(50,30),null);assert.equal(rules.ending({win:true,bosses:5}).primary,"전설의 정년퇴직");assert.equal(rules.ending({win:false,bosses:5,allies:4}).primary,"새로운 인생의 시작");assert.ok(rules.ending({win:true,crises:2,combo:15,hits:2}).titles.includes("불굴의 교사"));assert.match(preview,/function updateBoss\(dt\)/);assert.match(preview,/bosses\.advance\(clock\)/);console.log('PASS five boss windows, single defeat rewards, expiry, difficulty scaling and independent retirement ending');

const team=rules.createAllies();assert.equal(team.canCooperate(0),false);for(let i=0;i<6;i++)assert.ok(team.join(0,()=>0));assert.equal(team.join(0,()=>0),null);assert.equal(team.count(),6);assert.equal(team.tick(1).length,0);assert.ok(team.tick(12).length>=5);assert.equal(team.cooperate(12),true);assert.equal(team.cooperate(12),false);assert.equal(team.cooldown(24),12);assert.equal(team.cooperate(36),true);assert.match(preview,/function cooperate\(\)/);assert.match(preview,/선생님들의 연대/);console.log('PASS ally roles, unique joining, timed support and cooperation cooldown');

assert.match(shareSource,/data\.metrics\.slice\(0,6\)/);assert.match(preview,/function drawRetirementScene/);assert.match(preview,/function playRetirementMusic/);assert.match(preview,/metrics:\["최종 "/);assert.match(preview,/finalScore=recordPolicy\.score\(rawScore,/);console.log('PASS retirement scene, sound opt-in, certificate details and consistent early-stop score');

const rw={};vm.runInNewContext(read('js/teacher-run-4-records-v1.js'),{window:rw});const rp=rw.BeaguRun4Records;
const rr={version:'4.0',game:rp.game,difficulty:'normal',baseScore:1000,score:3000,survivalSeconds:190,age:62,victory:true,bossIds:['confusion','final'],maxCombo:10,hits:2,crises:1,leaveDays:8,allies:2};
assert.equal(rp.validate(rr,190,'normal').score,3000);
for(const bad of [{...rr,score:3001},{...rr,version:'3.0'},{...rr,school_name:'private'},{...rr,verified:true},{...rr,bossIds:['final','final']},{...rr,leaveDays:4},{...rr,age:61},{...rr,survivalSeconds:30,victory:false,age:30,score:1500,bossIds:['final']}])assert.throws(()=>rp.validate(bad,190,'normal'));
assert.throws(()=>rp.validate(rr,100,'normal'));assert.throws(()=>rp.validate(rr,190,'hard'));
assert.equal(rp.storageKey,'beaguRun4LocalRecordsV1');assert.match(preview,/recordPolicy\.save\(localStorage,result\)/);assert.doesNotMatch(preview,/new window\.ArcadeLeaderboard/);
const rankingDraft=read('docs/run4-ranking-preflight/schema-draft.sql');assert.match(rankingDraft,/session_id uuid primary key/);assert.match(rankingDraft,/enable row level security/);assert.match(rankingDraft,/where r.verification_status='verified'/);assert.doesNotMatch(rankingDraft,/alter table public\.arcade_game_scores\b|drop table/i);
console.log('PASS version-separated local results and impossible-summary rejection; staged SQL remains unexecuted');

assert.equal(rp.score(200001,'hard',true),800004);assert.throws(()=>rp.validate({...rr,baseScore:200001,score:600003},190,'normal')); // render experimental result, reject oversized official envelope

const fakeStorage={raw:'[]',getItem(k){assert.equal(k,rp.storageKey);return this.raw;},setItem(k,v){assert.equal(k,rp.storageKey);this.raw=v;}};rp.save(fakeStorage,rr);rp.save(fakeStorage,{...rr,difficulty:'easy',score:2000});rp.save(fakeStorage,{...rr,victory:false,survivalSeconds:100,age:44,score:1500,bossIds:['confusion'],leaveDays:3});assert.equal(rp.list(fakeStorage,{difficulty:'normal'}).length,2);assert.equal(rp.list(fakeStorage,{outcome:'retired'}).length,2);assert.equal(rp.list(fakeStorage,{outcome:'all_bosses'}).length,0);assert.equal(rp.list(fakeStorage)[0].score,3000);assert.match(preview,/saveLocalResult\(rawScore,finalScore,false\)/);console.log('PASS 4.0 local leaderboard filters and partial results');

const {execFileSync}=require('node:child_process');execFileSync(process.execPath,['docs/run4-ranking-preflight/server-boundary-test.cjs'],{stdio:'inherit'});

assert.match(preview,/function stepRecording/);assert.match(preview,/function recordInput/);assert.match(preview,/recordingMode\?Math\.min\(RETIREMENT_SECONDS,recordTick\/60\)/);assert.match(preview,/function applyReplayInput/);assert.match(preview,/run4-trace-download/);assert.match(preview,/cosmeticRandom/);console.log('PASS opt-in fixed tick recording structure, isolated local export');

// Regression: support collection may shrink items during the collision loop.
const loop=preview.slice(preview.indexOf(' // A collected support item'),preview.indexOf(' updateChalk(dt);',preview.indexOf(' // A collected support item')));
assert.match(loop,/for\(const a of items\.slice\(\)\.reverse\(\)\)/);assert.match(loop,/const i=items\.indexOf\(a\);if\(i<0\)continue/);
const collisionFixture=new Function('const items=[{x:100,y:100,r:10,good:false,speed:0,phase:0,wobble:0},{x:100,y:100,r:10,good:true,speed:0,phase:0,wobble:0}];let hits=0;const dt=1/60,clock=1,W=600,H=420,player={x:100,y:100,r:20},profile={zigzag:0,homing:0,heroSize:1},state="playing";function hit(a){hits++;if(a.good)items.length=0;}'+loop+'return {hits,remaining:items.length};');assert.deepEqual(collisionFixture(),{hits:1,remaining:0});console.log('PASS support item removes hazards safely during collision iteration');

assert.match(preview,/run4-official-submit/);assert.match(read('js/run4-official-client-v1.js'),/enabled:false,endpoint:/);assert.match(preview,/activeOfficial\.seed/);assert.match(preview,/official\.submit\(captured\.session,captured\.envelope\)/);console.log('PASS official client stays disabled by default and explicit submit UI');

// Scoped release: the shipped default must not touch tokens, auth or the network.
(async()=>{
 const officialWindow={};let calls=0;
 const forbidden=()=>{calls++;throw Error('unexpected external access');};
 vm.runInNewContext(read('js/run4-official-client-v1.js'),{window:officialWindow,fetch:forbidden});
 const api=officialWindow.BeaguRun4Official.create({fetcher:forbidden,getToken:forbidden,getAdminBearer:forbidden});
 assert.equal(api.enabled,false);assert.equal(Object.isFrozen(officialWindow.BeaguRun4Official.defaultConfig),true);
 for(const action of [()=>api.start({school_id:'fixture'}),()=>api.submit({seed:1,difficulty:'easy',session:'fixture'},{seed:1,difficulty:'easy',events:[]}),()=>api.list('all','all')])await assert.rejects(action(),/verification_unavailable/);
 assert.equal(calls,0);
 const manifest=JSON.parse(read('release-candidate.json'));assert.ok(manifest.summary.length<=500);assert.match(manifest.summary,/4\.0 공식 랭킹 비활성화/);assert.match(manifest.summary,/기존 3\.0 공식 랭킹 유지/);
 console.log('PASS scoped personal preview: zero default official API, token and auth access');
})().catch(error=>{console.error(error);process.exitCode=1;});
