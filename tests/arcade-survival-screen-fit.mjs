import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const load=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const run=load("teacher-run.html"),volley=load("teacher-volleyball.html");
const home=load("index.html"),hostLock=load("js/arcade-play-lock-v1.js");
const css=load("styles/arcade-fullscreen-v1.css");
assert.match(run,/styles\/arcade-fullscreen-v1\.css\?v=20261123-survival-contain1/);
assert.match(home,/href="games\.html/);assert.match(load("games.html"),/href="teacher-run\.html"/);
assert.match(run,/document\.body\.classList\.toggle\("arcade-run-game-playing",state==="playing"\|\|state==="paused"\)/);
assert.match(css,/body\.arcade-run-game-playing \.stage:not\(\.arcade-fullscreen-fallback\)/);
assert.match(css,/--arcade-run-parent-visible-height,100svh/);
assert.match(css,/height:100%!important;[\s\S]{0,120}max-width:100%!important;max-height:100%!important/);
assert.match(css,/aspect-ratio:auto!important;object-fit:contain!important/);
assert.match(hostLock,/const survival=Boolean\(canvas\?\.closest\?\.\("\.stage"\)\)/);
assert.match(hostLock,/if\(canvas&&\(mobile\|\|survival\)&&!fullscreen\)/);
assert.doesNotMatch(home,/id="teacher-run-frame"|id="teacher-game-frame"/,"The current Playcourt opens standalone pages");
assert.doesNotMatch(home,/const bottom=frameRect\.top\+canvasRect\.bottom/);

// Execute the currently reachable standalone lock with actual page geometry.
function check(viewportHeight,isMobile,survival=true){
 let playHeight=400,setHeight=null,scrolled=null,locked=false;
 const canvas={closest(sel){return survival&&sel===".stage"?{}:null},getBoundingClientRect(){return {top:800,height:playHeight,bottom:800+playHeight};}};
 const window={scrollY:200,pageYOffset:200,innerHeight:viewportHeight,visualViewport:{height:viewportHeight,offsetTop:0},matchMedia(){return {matches:isMobile}},scrollTo(_x,y){scrolled=y},addEventListener(){}};
 window.parent=window;
 const document={documentElement:{scrollHeight:4000,classList:{toggle(_c,v){locked=v}},style:{setProperty(name,value){assert.equal(name,"--arcade-run-parent-visible-height");setHeight=Number.parseFloat(value);playHeight=Math.min(400,Math.max(205,setHeight-32));}}},
 body:{scrollHeight:4000,style:{position:"",top:"",left:"",right:"",width:"",overflow:""}},querySelector(sel){return sel===".arcade-game-viewport canvas"?canvas:null},addEventListener(){}};
 new Function("window","document",hostLock)(window,document);
 window.ArcadePlayLock.sync(true);
 assert.equal(locked,true);assert.equal(document.body.style.position,"fixed");
 const center=scrolled===null?null:200+800+playHeight/2-scrolled;
 window.ArcadePlayLock.sync(false);assert.equal(locked,false);assert.equal(document.body.style.position,"");
 return {setHeight,playHeight,center};
}
for(const h of [375,568,844,1080]){
 const found=check(h,h<768);assert.equal(found.setHeight,h);assert(found.playHeight<=h-24);assert(Math.abs(found.center-h/2)<1);
}
assert.equal(check(1080,false,false).center,null,"desktop volleyball scroll behavior remains unchanged");

// Simulate the survival movement segment directly extracted from the game.
const movementStart=run.indexOf(' const dir=(pressed.has("right")?1:0)');
const movementEnd=run.indexOf(' player.x=Math.max(27,Math.min(W-27,player.x));',movementStart);
assert(movementStart>0&&movementEnd>movementStart);
const movement=run.slice(movementStart,movementEnd);
const move=new Function("env",[
 'const player={x:200,y:env.y},pointerId=null,pointerX=null,pointerY=null;',
 'const W=600,H=420,dt=.016,skill={speed:1},pressed=new Set();',
 'const difficultyProfiles={easy:{jumpEnabled:true,heroSpeed:1},hard:{jumpEnabled:true,heroSpeed:1},extreme:{jumpEnabled:false,heroSpeed:1}};',
 'const profile=difficultyProfiles[env.difficulty];',
 'const isMysteryBuff=item=>item==="wings"?env.wings:item==="shackle"?env.shackle:false;',
 'const canPlayerRise=()=>!isMysteryBuff("shackle")&&(profile.jumpEnabled!==false||isMysteryBuff("wings"));',
 movement,
 'return player.y;'
].join("\n"));
assert.equal(move({difficulty:"hard",wings:true,y:175}),175,"wing pickup holds altitude");
assert.equal(move({difficulty:"easy",wings:false,y:175}),175,"EASY holds altitude");
assert(move({difficulty:"hard",wings:false,y:175})>175,"gravity resumes without wings");
assert.equal(move({difficulty:"extreme",wings:true,y:175}),175,"wings temporarily override extreme grounding");
assert.match(volley,/if\(flightAllowed\)\{[\s\S]*?left\.vy=left\.y-beforeMoveY;/,
 "volleyball wing effect holds altitude");
console.log("PASS: survival fullscreen sizing, standalone desktop/mobile center, wing-hover and gravity");
