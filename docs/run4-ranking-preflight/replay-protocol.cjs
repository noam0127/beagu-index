"use strict";
// Strict experimental replay format, never accepts client result fields.
const MAX_TICKS=11400,MAX_EVENTS=12000,TIERS=new Set(["easy","normal","hard","very_hard","extreme"]);
const GROWTH=new Set(["guidance","speed","power","rate","ally","vital","shield","heal","workload","community"]);
function validateReplay(replay){
 if(!Array.isArray(replay)||!replay.length||replay.length>MAX_EVENTS)throw Error("invalid_replay");
 let last=-1,atTick=0,stopped=false;
 for(const e of replay){
  if(!e||typeof e!=="object"||Array.isArray(e)||!Number.isInteger(e.tick)||e.tick<last||e.tick>MAX_TICKS||stopped)throw Error("invalid_replay");
  if(e.tick!==last)atTick=0;if(++atTick>12)throw Error("invalid_replay");last=e.tick;
  const keys=["tick","action"];
  if(e.action==="move"){keys.push("x","y");if(![e.x,e.y].every(n=>Number.isFinite(n)&&n>=0&&n<=1))throw Error("invalid_replay");}
  else if(e.action==="collect"||e.action==="leave"){keys.push("choice");if(![5,10,20].includes(e.choice))throw Error("invalid_replay");}
  else if(e.action==="keys"){keys.push("choice");if(!Number.isInteger(e.choice)||e.choice<0||e.choice>15)throw Error("invalid_replay");}
  else if(e.action==="growth"){keys.push("choice");if(!GROWTH.has(e.choice))throw Error("invalid_replay");}
  else if(!["release","special","cooperate","stop","end"].includes(e.action))throw Error("invalid_replay");
  if(Object.keys(e).length!==keys.length||Object.keys(e).some(k=>!keys.includes(k)))throw Error("invalid_replay");
  if(e.action==="stop"||e.action==="end")stopped=true;
 }
 if(!stopped)throw Error("invalid_replay");
 return replay;
}
module.exports={validateReplay,MAX_TICKS,TIERS};
