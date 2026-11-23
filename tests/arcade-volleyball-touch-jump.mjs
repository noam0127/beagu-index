import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync('teacher-volleyball.html','utf8');
assert.match(source,/id="volley-joystick"/,'mobile uses analog stick');
assert.match(source,/id="volley-spike"/,'mobile has a manual attack button');
assert.match(source,/id="volley-dash"/,'mobile has a dash button');
assert.doesNotMatch(source,/volley-mobile-jump|touchControl\.jumpQueued|touchControl\.targetX|touchControl\.targetY/,'old tap-to-jump and drag controls are removed');
assert.match(source,/const flightAllowed=hasPlayerWings\(\)&&canPlayerJump\(\)/);
assert.match(source,/controlPlayer\(left,moveX,canPlayerJump\(\)&&\(keys\.jump\|\|keys\.up\|\|inputY<-.58\)/,'stick-up jump remains difficulty gated');
assert.match(source,/touchControl\.pointerId!==null/,'active joystick pointer is tracked');
assert.match(source,/if\(dashing\)state\.dashFrames--/,'dash ends after a bounded burst');
assert.match(source,/state\.dashCooldownFrames=DASH_COOLDOWN/,'dash uses a cooldown');
assert.match(source,/ArrowRight:"right"/,'keyboard right binding remains');

const controlStart=source.indexOf('function controlPlayer(p, direction, jump, speed, jumpStrength=12.8) {');
const controlEnd=source.indexOf('function moveClones()',controlStart);
const movementStart=source.indexOf('const keyboardDirection = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);',controlEnd);
const movementEnd=source.indexOf('if(currentDifficulty==="extreme"){',movementStart);
assert.ok(controlStart>0&&controlEnd>controlStart&&movementStart>controlEnd&&movementEnd>movementStart,
 'must execute the actual game movement and gravity code');
const control=source.slice(controlStart,controlEnd);
const movement=source.slice(movementStart,movementEnd);

// Run the exact in-game gravity and dash movement block with deterministic inputs.
const frame=new Function('env',[
 'const {left,touchControl,keys,state,currentDifficulty,wingActive,shackle}=env;',
 'let lastMoveDirection=env.lastMoveDirection??1;',
 'const FLOOR=451,NET_X=450,NET_W=14,NET_TOP=342,W=900,SPEED_MULTIPLIER=2;',
 'const battle={allySpeed:1,allyJump:1};',
 'const clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,v));',
 "const isMysteryBuff=(_side,item)=>item==='wings'?wingActive:item==='shackle'?shackle:false;",
 "const hasPlayerWings=()=>currentDifficulty==='easy'||isMysteryBuff('left','wings');",
 "const canPlayerJump=()=>!isMysteryBuff('left','shackle')&&(currentDifficulty!=='extreme'||hasPlayerWings());",
 'const playerCeiling=()=>hasPlayerWings()?86:NET_TOP-78;',
 control,movement,
 'env.lastMoveDirection=lastMoveDirection;',
 'return {x:left.x,y:left.y,vy:left.vy,flightAllowed,remainingDash:state.dashFrames};'
].join('\n'));
const actor=()=>({x:180,y:420,vy:0,vx:0,side:'left',jumpLock:false});
const controls=()=>({pointerId:null,axisX:0,axisY:0});
const keys=()=>({left:false,right:false,up:false,down:false,jump:false});
function make(difficulty='normal',wingActive=false,shackle=false){
 return {left:actor(),touchControl:controls(),keys:keys(),
  state:{dashFrames:0,dashX:1,dashY:0},currentDifficulty:difficulty,wingActive,shackle,lastMoveDirection:1};
}
const neutral=make();
assert.equal(frame(neutral).x,180,'neutral joystick cannot drift');
assert.equal(neutral.left.y,420,'neutral grounded joystick stays grounded');

const right=make();
right.touchControl.pointerId=3;right.touchControl.axisX=1;
for(let i=0;i<4;i++)frame(right);
assert.ok(right.left.x>180,'horizontal joystick moves the teacher');
right.touchControl.pointerId=null;
const stoppedX=right.left.x;
frame(right);
assert.equal(right.left.x,stoppedX,'releasing the joystick stops horizontal movement');

const ground=make();
ground.touchControl.pointerId=1;ground.touchControl.axisY=-1;
let result=frame(ground);
assert.ok(result.y<420&&result.vy<0,'holding joystick up creates a physical jump');
for(let i=0;i<125;i++)result=frame(ground);
assert.equal(result.y,420,'holding upward on non-winged difficulty lands under gravity');
assert.equal(result.vy,0);

const keyboard=make('hard');
keyboard.keys.up=true;
assert.ok(frame(keyboard).y<420,'keyboard W/up retains jump parity');
for(let i=0;i<125;i++)frame(keyboard);
assert.equal(keyboard.left.y,420,'keyboard up cannot create unlimited flight');

const easy=make('easy');
easy.touchControl.pointerId=5;easy.touchControl.axisY=-1;
for(let i=0;i<18;i++)frame(easy);
assert.ok(easy.left.y<180,'EASY retains vertical flight');
easy.touchControl.pointerId=null;
const hover=easy.left.y;
for(let i=0;i<40;i++)frame(easy);
assert.equal(easy.left.y,hover,'EASY hovers after joystick release');

const wings=make('normal',true);
wings.touchControl.pointerId=6;wings.touchControl.axisY=-1;
for(let i=0;i<18;i++)frame(wings);
assert.ok(wings.left.y<180,'wing pickup grants controlled flight');
wings.touchControl.pointerId=null;
const wingAltitude=wings.left.y;
frame(wings);
assert.equal(wings.left.y,wingAltitude,'releasing stick freezes altitude while wings are active');
wings.wingActive=false;
result=frame(wings);
assert.ok(result.y>=wingAltitude&&result.y<264,'wing expiration begins falling, not teleporting');
for(let i=0;i<125;i++)frame(wings);
assert.equal(wings.left.y,420,'expired wings land normally');

const blocked=make('extreme',false,true);
blocked.touchControl.pointerId=8;blocked.touchControl.axisY=-1;
frame(blocked);
assert.equal(blocked.left.y,420,'shackles and EXTREME prevent upward movement');

const walking=make('hard');
walking.touchControl.pointerId=4;walking.touchControl.axisX=1;
const walkX=frame(walking).x-180;
const dash=make('hard');
dash.touchControl.pointerId=4;dash.touchControl.axisX=1;
dash.state.dashFrames=8;
result=frame(dash);
assert.ok(result.x-180>walkX*1.9,'dash delivers a meaningful horizontal speed boost');
assert.equal(result.remainingDash,7,'dash duration is consumed per frame');
for(let i=0;i<100;i++)frame(dash);
assert.ok(dash.left.x<=450-14/2-36,'dash never crosses into the enemy half');
const wingDash=make('easy');
wingDash.state.dashFrames=8;wingDash.state.dashX=0;wingDash.state.dashY=-1;
assert.ok(frame(wingDash).y<400,'wings permit vertical dash');
console.log('PASS volleyball analog: normal jump/landing, wing hover/expiration, extreme shackle, dash speed and court bounds');
