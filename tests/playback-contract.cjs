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
