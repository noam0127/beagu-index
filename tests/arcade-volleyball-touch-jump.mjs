import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync('teacher-volleyball.html','utf8');
assert.match(source,/id="volley-joystick"/);assert.match(source,/id="volley-spike"/);assert.match(source,/id="volley-dash"/);assert.doesNotMatch(source,/id="volley-mobile-jump"/);
assert.match(source,/joystick.setPointerCapture/);assert.match(source,/\["pointerup","pointercancel","lostpointercapture"\]/);
assert.match(source,/state.spikeBufferFrames=SPIKE_BUFFER/);assert.match(source,/state.dashCooldownFrames=DASH_COOLDOWN/);
assert.match(source,/const vertical=hasPlayerWings\(\)&&canPlayerJump\(\)\?inputY:0/);
assert.match(source,/impactSpeed >= AUTO_SPIKE_SPEED\|\|state.spikeBufferFrames>0\|\|charged/);
const start=source.indexOf('  function controlPlayer(p, direction, jump, speed, jumpStrength=12.8) {'),end=source.indexOf('  function moveClones()',start);
const ms=source.indexOf('    const flightAllowed=hasPlayerWings()&&canPlayerJump();'),me=source.indexOf('    if(currentDifficulty==="extreme"){',ms);
assert(start>0&&end>start&&ms>end&&me>ms);
const control=source.slice(start,end),movement=source.slice(ms,me);
const frame=new Function('env',`
 const {left,touchControl,keys,currentDifficulty,wingActive,shackle,state}=env;
 const FLOOR=451,NET_X=450,NET_W=14,NET_TOP=342,W=900,SPEED_MULTIPLIER=1;
 const battle={allySpeed:1,allyJump:1};
 const clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,v));
 const isMysteryBuff=(_side,item)=>item==='wings'?wingActive:item==='shackle'?shackle:false;
 const hasPlayerWings=()=>currentDifficulty==='easy'||isMysteryBuff('left','wings');
 const canPlayerJump=()=>!isMysteryBuff('left','shackle')&&(currentDifficulty!=='extreme'||hasPlayerWings());
 const playerCeiling=()=>hasPlayerWings()?86:NET_TOP-78;
 const keyboardDirection=(keys.right?1:0)-(keys.left?1:0);
 const keyboardVertical=(keys.down?1:0)-(keys.up?1:0);
 const beforeMoveX=left.x,beforeMoveY=left.y,itemSpeed=1;
 let lastMoveDirection=1;
 ${control}
 ${movement}
 return {x:left.x,y:left.y,vy:left.vy,flightAllowed};
`);
const make=(difficulty,wing=false,shackle=false)=>({left:{x:180,y:420,vy:0,vx:0,side:'left',jumpLock:false},touchControl:{pointerId:3,axisX:1,axisY:0},keys:{},currentDifficulty:difficulty,wingActive:wing,shackle,state:{dashFrames:0,dashX:1,dashY:0}});
const normal=make('normal');frame(normal);assert(normal.left.x>180);assert.equal(normal.left.y,420);
normal.touchControl.axisY=-1;frame(normal);assert(normal.left.y<420&&normal.left.vy<0);for(let i=0;i<125;i++)frame(normal);assert.equal(normal.left.y,420);assert.equal(normal.left.vy,0);
const easy=make('easy'),wings=make('normal',true);for(const game of [easy,wings]){game.touchControl.axisY=-1;for(let i=0;i<25;i++)frame(game);assert(game.left.y<180);const altitude=game.left.y;game.touchControl.pointerId=null;for(let i=0;i<40;i++)frame(game);assert.equal(game.left.y,altitude);assert.equal(game.left.vy,0);}
const altitude=wings.left.y;wings.wingActive=false;frame(wings);assert(wings.left.y>=altitude&&wings.left.y<264);for(let i=0;i<125;i++)frame(wings);assert.equal(wings.left.y,420);
const chained=make('extreme',false,true);chained.touchControl.axisY=-1;frame(chained);assert.equal(chained.left.y,420);
const dash=make('normal');dash.state.dashFrames=8;const plain=make('normal');frame(plain);frame(dash);assert(dash.left.x-180>plain.left.x-180);assert.equal(dash.state.dashFrames,7);
for(let i=0;i<7;i++)frame(dash);assert.equal(dash.state.dashFrames,0);
console.log('PASS joystick movement, physical jump, gravity, wing hover, expiry, shackles, and dash duration');
