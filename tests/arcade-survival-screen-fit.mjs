import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const load=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const run=load("teacher-run.html"),volley=load("teacher-volleyball.html");
const home=load("index.html"),hostLock=load("js/arcade-play-lock-v1.js");
const css=load("styles/arcade-fullscreen-v1.css");
assert.match(run,/styles\/arcade-fullscreen-v1\.css\?v=20261123-survival-contain1/);
assert.match(home,/teacher-run\.html\?v=20261123-screen-center-wings1/);
assert.match(run,/document\.body\.classList\.toggle\("arcade-run-game-playing",state==="playing"\|\|state==="paused"\)/);
assert.match(css,/body\.arcade-run-game-playing \.stage:not\(\.arcade-fullscreen-fallback\)/);
assert.match(css,/--arcade-run-parent-visible-height,100svh/);
assert.match(css,/height:100%!important;[\s\S]{0,120}max-width:100%!important;max-height:100%!important/);
assert.match(css,/aspect-ratio:auto!important;object-fit:contain!important/);
assert.match(hostLock,/const survival=Boolean\(canvas\?\.closest\?\.\("\.stage"\)\)/);
assert.match(hostLock,/if\(canvas&&\(mobile\|\|survival\)&&!fullscreen\)/);
assert.match(home,/frame\.id!=="teacher-run-frame"/);
assert.doesNotMatch(home,/const bottom=frameRect\.top\+canvasRect\.bottom/);

// Execute the actual homepage centering code against nested iframe geometry.
const begin=home.indexOf("    function centerGameBeforeLock(frame){");
const end=home.indexOf("    function lockPageDuringMatch(frame,playing){",begin);
assert(begin>0&&end>begin,"parent centering must exist");
const center=new Function("frame","window","document","expandedFrame",
  home.slice(begin,end)+"\nreturn centerGameBeforeLock(frame);");
function check(viewportHeight,isMobile,gameName="teacher-run-frame"){
 let playHeight=400,setHeight=null,scrolled=null;
 const frame={
  id:gameName,hidden:false,getBoundingClientRect(){return {top:900,height:720};},
  contentDocument:{
   documentElement:{style:{setProperty(name,value){
    assert.equal(name,"--arcade-run-parent-visible-height");
    setHeight=Number.parseFloat(value);
    playHeight=Math.min(400,Math.max(205,setHeight-32));
   }}},
   querySelector(){return {getBoundingClientRect(){return {top:135,height:playHeight,bottom:135+playHeight};}};}
  }
 };
 const window={
  scrollY:200,pageYOffset:200,innerHeight:viewportHeight,
  visualViewport:{height:viewportHeight,offsetTop:0},
  matchMedia(){return {matches:isMobile};},
  scrollTo(_x,y){scrolled=y;}
 };
 const document={documentElement:{scrollHeight:4000},body:{scrollHeight:4000}};
 const y=center(frame,window,document,null);
 return {y,scrolled,playHeight,setHeight,centered:200+900+135+playHeight/2-y};
}
for(const h of [375,568,844,1080]){
 const found=check(h,h<768);
 assert.equal(found.setHeight,h,"parent viewport height passed into iframe");
 assert(found.playHeight<=h-24,"canvas fits the viewport");
 assert.equal(found.scrolled,found.y);
 assert(Math.abs(found.centered-h/2)<1,"canvas is centered in viewport");
}
assert.equal(check(1080,false,"teacher-game-frame").y,null,
 "desktop volleyball scroll behavior remains unchanged");

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
assert.match(volley,/else if\(flightAllowed\) \{[\s\S]*?left\.vy=0;/,
 "volleyball wing effect holds altitude");
console.log("PASS: survival fullscreen sizing, desktop/mobile center, wing-hover and gravity");
