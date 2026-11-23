import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync('teacher-volleyball.html','utf8');
assert.match(source,/touchControl\.jumpQueued = canPlayerJump\(\)/,'touch down must queue a jump');
assert.match(source,/touchControl\.targetY = hasPlayerWings\(\) && canPlayerJump\(\) \?/,'only wings use vertical pointer target');
assert.match(source,/const flightAllowed=hasPlayerWings\(\)&&canPlayerJump\(\)/);
assert.match(source,/const tapJump=touchControl\.jumpQueued;\s*touchControl\.jumpQueued=false/,'one jump impulse per tap');
assert.match(source,/controlPlayer\(left,direction,canPlayerJump\(\)&&\(tapJump\|\|keys\.jump\|\|keys\.up\)/);
assert.match(source,/🏐 터치하면 점프 · 드래그는 좌우 이동/);
assert.doesNotMatch(source,/Touch\/drag: fly freely/);
const down=source.slice(source.indexOf('canvas.addEventListener("pointerdown"'),source.indexOf('canvas.addEventListener("pointermove"'));
assert.match(down,/touchControl\.jumpQueued = canPlayerJump\(\)/);
const release=source.slice(source.indexOf('function endCourtTouch'),source.indexOf('canvas.addEventListener("pointerup"'));
assert.doesNotMatch(release,/left\.vy\s*=/,'pointer release must not kill a jump arc');

const controlStart=source.indexOf('  function controlPlayer(p, direction, jump, speed, jumpStrength=12.8) {');
const controlEnd=source.indexOf('  function moveClones()',controlStart);
const movementStart=source.indexOf('    const flightAllowed=hasPlayerWings()&&canPlayerJump();');
const movementEnd=source.indexOf('    if(currentDifficulty==="extreme"){',movementStart);
assert(controlStart>0&&controlEnd>controlStart&&movementStart>controlEnd&&movementEnd>movementStart);
const control=source.slice(controlStart,controlEnd);
const movement=source.slice(movementStart,movementEnd);

// Execute the game's actual movement and gravity code with a deterministic court.
const frame=new Function('env',String.raw`
 const {left,touchControl,keys,currentDifficulty,wingActive,shackle}=env;
 const FLOOR=451,NET_X=450,NET_W=14,NET_TOP=342,W=900,SPEED_MULTIPLIER=1;
 const battle={allySpeed:1,allyJump:1};
 const clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,v));
 const isMysteryBuff=(_side,item)=>item==='wings'?wingActive:item==='shackle'?shackle:false;
 const hasPlayerWings=()=>currentDifficulty==='easy'||isMysteryBuff('left','wings');
 const canPlayerJump=()=>!isMysteryBuff('left','shackle')&&(currentDifficulty!=='extreme'||hasPlayerWings());
 const playerCeiling=()=>hasPlayerWings()?86:NET_TOP-78;
 const keyboardDirection=(keys.right?1:0)-(keys.left?1:0);
 const keyboardVertical=(keys.down?1:0)-(keys.up?1:0);
 const beforeMoveX=left.x,beforeMoveY=left.y;
 const itemSlow=1,itemFast=1,itemSpeed=1;
 ${control}
 ${movement}
 return {x:left.x,y:left.y,vy:left.vy,flightAllowed,tapJump};
`);
const actor=()=>({x:180,y:420,vy:0,vx:0,side:'left',jumpLock:false});
const controls=()=>({pointerId:null,targetX:null,targetY:null,jumpQueued:false});
const keys=()=>({left:false,right:false,up:false,down:false,jump:false});
function make(difficulty,wing=false,shackle=false){
 return {left:actor(),touchControl:controls(),keys:keys(),currentDifficulty:difficulty,wingActive:wing,shackle};
}
const normal=make('normal');
normal.touchControl.pointerId=3;
normal.touchControl.targetX=300;
normal.touchControl.targetY=90; // malicious/stale vertical drag must still be ignored.
normal.touchControl.jumpQueued=true;
let result=frame(normal);
assert(result.y<420,'tap lifts player by a physical jump');
assert(result.vy<0,'jump starts with upward momentum');
assert.equal(normal.touchControl.jumpQueued,false,'tap impulse consumed once');
for(let i=0;i<125;i++)result=frame(normal);
assert.equal(result.y,420,'normal held touch must land, not hover or fly');
assert.equal(result.vy,0,'normal gravity finishes on floor');
assert(normal.left.x>180,'drag should still move horizontally');
const up=make('hard');
up.keys.up=true;
result=frame(up);
assert(result.y<420,'up arrow should jump without free flight');
for(let i=0;i<125;i++)frame(up);
assert.equal(up.left.y,420,'holding up must not fly');
const quickTap=make('normal');
quickTap.touchControl.jumpQueued=true; // pointer already released before frame.
result=frame(quickTap);
assert(result.y<420,'very short taps should still jump');
const easy=make('easy');
easy.touchControl.pointerId=5;easy.touchControl.targetX=240;easy.touchControl.targetY=90;
for(let i=0;i<18;i++)frame(easy);
assert(easy.left.y<180,'EASY retains vertical flight');
const wings=make('normal',true);
wings.touchControl.pointerId=6;wings.touchControl.targetX=240;wings.touchControl.targetY=90;
for(let i=0;i<18;i++)frame(wings);
assert(wings.left.y<180,'wings pickup retains flight on normal');
const altitude=wings.left.y;
wings.wingActive=false;
result=frame(wings);
assert(result.y>=altitude&&result.y<264,'expired wings start falling rather than teleporting');
for(let i=0;i<125;i++)frame(wings);
assert.equal(wings.left.y,420,'expired wings eventually land');
const chained=make('extreme',false,true);
chained.touchControl.pointerId=8;chained.touchControl.targetX=250;chained.touchControl.jumpQueued=true;
frame(chained);
assert.equal(chained.left.y,420,'shackles still prevent jumping');
console.log('PASS volleyball touch: grounded jump, gravity, horizontal drag, short taps, EASY/wings flight, expiration, shackles');
