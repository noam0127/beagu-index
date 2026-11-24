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
for(const s of [v,r]){assert.equal((s.match(/id="pause"/g)||[]).length,1);assert.match(s,/id="pause" class="arcade-playback"/);assert.match(s,/tapGesture\.up\(e\)/);assert.match(s,/tapGesture\.move\(e\)/);for(const m of s.matchAll(/<script>([\s\S]*?)<\/script>/g))new Function(m[1]);}
assert.match(v,/if\(state.phase==="paused"\)return;/);assert.match(v,/pausedPhase=state.phase;state.phase="paused";releaseKeys\(true\)/);assert.match(v,/state.phase=pausedPhase/);assert.match(v,/if\(!preserveMomentum\)\{left.vy=0/);assert.match(v,/hasPlayerWings\(\)&&canPlayerJump\(\)/);assert.match(v,/15.8\*battle.allyJump/);
assert.match(r,/isMysteryBuff\("wings"\)/);assert.match(r,/ctx.globalAlpha=.07/);assert.match(r,/lines.slice\(0,2\)/);assert.doesNotMatch(r,/id="run-fullscreen-pause"/);
const rail=read('js/arcade-scroll-rail-v1.js');assert.doesNotMatch(rail,/createElement|pointerdown/);assert.match(rail,/show:hide/);assert.equal(JSON.parse(read('release-info.json')).version,'v1.4.0');
console.log('PASS: tap/drag/cancel, pause source contracts, old flight rules and retired rail');
