import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync('teacher-volleyball.html','utf8');
assert.doesNotMatch(source,/id="volley-joystick"|id="volley-spike"|id="volley-dash"|id="volley-mobile-jump"/);
assert.doesNotMatch(source,/id="volley-attack"/);assert.match(source,/attackPointer=event.pointerId;requestSpike\(\)/);
assert.match(source,/canvas\.addEventListener\("pointerdown"/);
assert.match(source,/\["pointercancel","lostpointercapture"\]/);assert.match(source,/touchControl.up\(event.pointerId,[^;]+;endAttack\(event\)/);
assert.match(source,/state\.spikeBufferFrames=SPIKE_BUFFER/);
assert.match(source,/state\.dashCooldownFrames=mobile\?0:DASH_COOLDOWN/);
assert.match(source,/const vertical=hasPlayerWings\(\)&&canPlayerJump\(\)\?inputY:0/);
assert.match(source,/impactSpeed >= AUTO_SPIKE_SPEED\|\|state\.spikeBufferFrames>0\|\|charged/);
const w={};vm.runInNewContext(readFileSync('js/volley-touch-v1.js','utf8'),{window:w,Math});
const start=source.indexOf('  function controlPlayer(p, direction, jump, speed, jumpStrength=12.8) {'),end=source.indexOf('  function moveClones()',start);
const ms=source.indexOf('    const flightAllowed=hasPlayerWings()&&canPlayerJump();'),me=source.indexOf('    if(currentDifficulty==="extreme"){',ms);
assert(start>0&&end>start&&ms>end&&me>ms);
const control=source.slice(start,end),movement=source.slice(ms,me);
const frame=new Function('env',[
 'const {left,touchControl,keys,currentDifficulty,wingActive,shackle,state,attackPointer}=env;',
 'const FLOOR=451,NET_X=450,NET_W=14,NET_TOP=342,W=900,SPEED_MULTIPLIER=1,SPIKE_BUFFER=19;',
 'const battle={allySpeed:1,allyJump:1};const clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,v));',
 "const isMysteryBuff=(_side,item)=>item==='wings'?wingActive:item==='shackle'?shackle:false;",
 "const hasPlayerWings=()=>currentDifficulty==='easy'||isMysteryBuff('left','wings');",
 "const canPlayerJump=()=>!isMysteryBuff('left','shackle')&&(currentDifficulty!=='extreme'||hasPlayerWings());",
 'const playerCeiling=()=>hasPlayerWings()?86:NET_TOP-78;',
 'const keyboardDirection=(keys.right?1:0)-(keys.left?1:0);const keyboardVertical=(keys.down?1:0)-(keys.up?1:0);',
 'const beforeMoveX=left.x,beforeMoveY=left.y,itemSpeed=1;let lastMoveDirection=1;',
 'function aimDash(x,y){state.dashFrames=8;state.dashX=x||1;state.dashY=hasPlayerWings()&&canPlayerJump()?y:0;}',
 control,movement,'return {x:left.x,y:left.y,vy:left.vy,flightAllowed};'
].join('\n'));
const make=(difficulty,wing=false,shackle=false)=>({left:{x:180,y:420,vy:0,vx:0,side:'left',jumpLock:false},touchControl:w.BeaguVolleyTouch.create(),keys:{},currentDifficulty:difficulty,wingActive:wing,shackle,attackPointer:null,state:{dashFrames:0,dashX:1,dashY:0}});
const normal=make('normal');normal.touchControl.down(1,{x:340,y:420},420);frame(normal);assert(normal.left.x>180);assert.equal(normal.left.y,420);
normal.touchControl.up(1,false);normal.touchControl.down(2,{x:340,y:100},420);frame(normal);assert(normal.left.y<420&&normal.left.vy<0);
normal.touchControl.up(2,false);for(let i=0;i<125;i++)frame(normal);assert.equal(normal.left.y,420);assert.equal(normal.left.vy,0);
const easy=make('easy'),wings=make('normal',true);for(const game of [easy,wings]){game.touchControl.down(1,{x:180,y:100},420);for(let i=0;i<40;i++)frame(game);assert(game.left.y<180);const altitude=game.left.y;game.touchControl.up(1,true);for(let i=0;i<40;i++)frame(game);assert.equal(game.left.y,altitude);assert.equal(game.left.vy,0);}
const altitude=wings.left.y;wings.wingActive=false;frame(wings);assert(wings.left.y>=altitude);for(let i=0;i<125;i++)frame(wings);assert.equal(wings.left.y,420);
const chained=make('extreme',false,true);chained.touchControl.down(1,{x:180,y:100},420);frame(chained);assert.equal(chained.left.y,420);
const dash=make('normal'),plain=make('normal');dash.state.dashFrames=8;plain.keys.right=true;frame(plain);frame(dash);assert(dash.left.x-180>plain.left.x-180);assert.equal(dash.state.dashFrames,7);for(let i=0;i<7;i++)frame(dash);assert.equal(dash.state.dashFrames,0);
const held=make('normal');held.attackPointer=1;held.keys.right=true;for(let i=0;i<20;i++){frame(held);assert.equal(held.state.dashFrames,7);assert.equal(held.state.dashCooldownFrames,0);assert.equal(held.state.spikeBufferFrames,19);}
const pc=make('normal');pc.keys.right=true;pc.keys.jump=true;frame(pc);assert(pc.left.x>180&&pc.left.y<420);
console.log('PASS direct touch target, jump/gravity, flight hover and expiry, shackles, mobile held attack and desktop keyboard');
