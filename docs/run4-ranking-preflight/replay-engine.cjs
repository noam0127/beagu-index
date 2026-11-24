"use strict";
const {validateReplay,MAX_TICKS,TIERS}=require("./replay-protocol.cjs");
// Trusted server-owned source instrumentation, NEVER pass client HTML or scripts.
// Test-only adapter: existing complete game simulation runs in isolated Chromium.
// Canonical 600x420 world, fixed 60Hz, seed assigned by server, no rendering between inputs.
function instrumentTrustedSource(source){
 const anchor="resize();intro();requestAnimationFrame(tick);postHeight();";
 if(source.split(anchor).length!==2)throw Error("unsupported_source");
 const start=source.indexOf("function resize(){"),end=source.indexOf('if(typeof ResizeObserver!=="undefined"){new ResizeObserver(resize)',start);
 if(start<0||end<=start)throw Error("unsupported_resize");
 const canonical=source.slice(0,start)+'function resize(){W=600;H=420;dpr=1;canvas.width=W;canvas.height=H;ctx.setTransform(1,0,0,1,0,0);}\n'+source.slice(end);
 return canonical.replace(anchor,`resize();intro();
 let replayTick=0,replayStarted=false;
 const replaySnapshot=()=>({tick:replayTick,state,clock,life,score,growth:rules.growthPlan.filter(p=>growth.level(p.id)>0).map(p=>p.id)});
 const stepReplay=target=>{
  if(!Number.isInteger(target)||target<replayTick||target>11400)throw Error("invalid_tick");
  while(replayTick<target){
   if(state!=="playing")throw Error("action_required");
   replayTick++;
   update(replayTick===11400?Math.max(1e-9,190-clock):1/60);
  }
 };
 const inputReplay=e=>{
  stepReplay(e.tick);
  if(e.action==="end"){if(state!=="over")throw Error("not_finished");return;}
  if(e.action==="growth"){
   if(state!=="between"||!applyGrowth(e.choice))throw Error("invalid_growth");
   state="playing";updateLabels();closeMessage();return;
  }
  if(state!=="playing")throw Error("invalid_state");
  if(e.action==="move"){pointerId=1;pointerX=Math.max(27,Math.min(W-27,e.x*W));pointerY=canPlayerRise()?Math.max(76,Math.min(H-52,e.y*H)):H-52;}
  else if(e.action==="release"){pointerId=null;pointerX=null;pointerY=null;}
  else if(e.action==="special"){if(!activateSpecial())throw Error("invalid_special");}
  else if(e.action==="collect"){if(!leave.collect(e.choice))throw Error("invalid_collect");syncLeave();}
  else if(e.action==="leave"){const b=leave.use(e.choice,clock,life,maxLife,bosses.tier.leave);if(!b)throw Error("invalid_leave");life=b.hp;burst(player.x,player.y,"#ffdf80",22);updateLabels();}
  else if(e.action==="cooperate"){if(!allies.canCooperate(clock))throw Error("invalid_cooperate");cooperate();}
  else if(e.action==="stop"){if(clock<1)throw Error("invalid_stop");finish(false);}
  else throw Error("invalid_action");
 };
 window.__trustedRun4Replay=Object.freeze({
  async run(seed,events){
   if(replayStarted)throw Error("already_started");replayStarted=true;
   if(!Number.isInteger(seed)||seed<0||seed>4294967295)throw Error("invalid_seed");
   let n=seed>>>0;Math.random=()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};
   localStorage.removeItem(recordPolicy.storageKey);soundOn=false;
   await start();if(state!=="playing")throw Error("start_denied");
   for(const e of events)inputReplay(e);
   if(state!=="over")throw Error("not_finished");
   const records=recordPolicy.list(localStorage);
   if(records.length!==1)throw Error("result_missing");
   return {result:records[0],terminal:replaySnapshot()};
  }
 });
 `);
}
async function replayInPage(page,{seed,difficulty,replay,elapsed}){
 validateReplay(replay);
 if(!TIERS.has(difficulty)||!Number.isInteger(seed)||seed<0||seed>4294967295||!Number.isFinite(elapsed)||elapsed<1||elapsed>3600)throw Error("invalid_session");
 const last=replay.at(-1).tick;
 if(last/60>elapsed+1||last>MAX_TICKS)throw Error("invalid_time");
 const output=await page.evaluate(({seed,replay})=>window.__trustedRun4Replay.run(seed,replay),{seed,replay});
 if(output.result.difficulty!==difficulty||output.result.survivalSeconds>Math.floor(elapsed)+1)throw Error("invalid_result");
 return output.result;
}
module.exports={instrumentTrustedSource,replayInPage};
