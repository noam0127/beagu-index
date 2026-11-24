"use strict";
const {validateReplay,MAX_TICKS,TIERS}=require("./replay-protocol.cjs");
function instrumentTrustedSource(source){
 const anchor="resize();intro();requestAnimationFrame(tick);postHeight();";
 if(source.split(anchor).length!==2)throw Error("unsupported_source");
 return source.replace(anchor,`resize();intro();
 // Render state-only UI in the accelerated fixture, without advancing simulation.
 const syncFixtureUI=()=>{document.body.classList.toggle("arcade-run-game-playing",state==="playing"||state==="paused");syncFullscreenPause();syncLeave();draw();};
 function fixturePaint(){syncFixtureUI();requestAnimationFrame(fixturePaint);}
 requestAnimationFrame(fixturePaint);
 let replayStarted=false;
 const snapshot=()=>({tick:recordTick,state,clock,life,score});
 const stepTo=target=>{
  if(!Number.isInteger(target)||target<recordTick||target>11400)throw Error("invalid_tick");
  while(recordTick<target){if(!stepRecording())throw Error("action_required");}
  syncFixtureUI();
 };
 const startSeed=async seed=>{
  if(replayStarted||!recordingMode)throw Error("already_started_or_wrong_mode");
  if(!Number.isInteger(seed)||seed<0||seed>4294967295)throw Error("invalid_seed");
  replayStarted=true;recordSeedOverride=seed;soundOn=false;await start();if(state!=="playing")throw Error("start_denied");syncFixtureUI();
 };
 window.__trustedRun4Replay=Object.freeze({
  async run(seed,events){await startSeed(seed);for(const e of events){stepTo(e.tick);applyReplayInput(e);}if(state!=="over"||!recordEnvelope)throw Error("not_finished");return {result:recordEnvelope.result,terminal:snapshot()};},
  startSeed,stepTo,snapshot,envelope:()=>recordEnvelope,
  autoAdvance(){
   let aimAt=-1;
   while(state==="playing"&&recordTick<11400){
    if(clock>=aimAt){
     aimAt=clock+.18;
     const threats=[...items.filter(a=>!a.good).map(a=>({x:a.x,y:a.y,vx:0,vy:a.speed,r:a.r})),...paperBullets.map(a=>({x:a.x,y:a.y,vx:a.vx,vy:a.vy,r:a.r})),...bossProjectiles.filter(a=>!a.friendly).map(a=>({x:a.x,y:a.y,vx:a.vx,vy:a.vy,r:a.r})),...sideStudents.map(a=>({x:a.x,y:a.y-10,vx:a.vx*(175+stage*10),vy:0,r:a.r}))];
     const xs=Array.from({length:11},(_,n)=>27+(W-54)*n/10),ys=canPlayerRise()?[Math.max(76,H*.35),H*.60,H-52]:[H-52];
     let bestAim={x:player.x,y:player.y},bestUtility=-Infinity,minGap=Infinity;
     for(const a of threats)minGap=Math.min(minGap,Math.hypot(player.x-a.x,player.y-a.y)-a.r-player.r);
     for(const x of xs)for(const y of ys){
      const distance=Math.hypot(x-player.x,y-player.y);let utility=-distance*.025;
      for(const a of threats)for(const t of [.18,.4,.65]){const fraction=Math.min(1,285*profile.heroSpeed*growth.effects().speed*t/Math.max(1,distance));const px=player.x+(x-player.x)*fraction,py=player.y+(y-player.y)*fraction;const gap=Math.hypot(px-a.x-a.vx*t,py-a.y-a.vy*t)-a.r-player.r;if(gap<60)utility-=(60-gap)*(gap<0?4:1);}
      for(const a of items)if(a.good&&a.y>H*.2){const d=Math.hypot(x-a.x,y-a.y-a.speed*.35);if(d<85)utility+=(85-d)*(.25+(1-life/maxLife)*.45);}
      if(utility>bestUtility){bestUtility=utility;bestAim={x,y};}
     }
     applyReplayInput({action:"move",x:bestAim.x/W,y:bestAim.y/H});
     const held=leave.state().held;if(life/maxLife<.55&&held.length&&!leave.active(clock))applyReplayInput({action:"leave",choice:held[held.length-1].years});
     if((minGap<20||bosses.active())&&specialCooldown<=0)applyReplayInput({action:"special"});
     if(allies.canCooperate(clock)&&(life/maxLife<.65||bosses.active()))applyReplayInput({action:"cooperate"});
     for(const p of leave.state().pending)applyReplayInput({action:"collect",choice:p.years});
    }
    stepRecording();
   }
   draw();syncLeave();return snapshot();
  }
 });
 `);
}
async function replayInPage(page,{seed,difficulty,replay,elapsed}){
 validateReplay(replay);
 if(!TIERS.has(difficulty)||!Number.isInteger(seed)||seed<0||seed>4294967295||!Number.isFinite(elapsed)||elapsed<1||elapsed>3600)throw Error("invalid_session");
 const last=replay.at(-1).tick;if(last/60>elapsed+1||last>MAX_TICKS)throw Error("invalid_time");
 const output=await page.evaluate(({seed,replay})=>window.__trustedRun4Replay.run(seed,replay),{seed,replay});
 if(output.result.difficulty!==difficulty||output.result.survivalSeconds>Math.floor(elapsed)+1)throw Error("invalid_result");return output.result;
}
module.exports={instrumentTrustedSource,replayInPage};
