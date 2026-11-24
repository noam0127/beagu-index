"use strict";
const {replayInPage}=require("./replay-engine.cjs");
const {validateReplay,TIERS}=require("./replay-protocol.cjs");
// Review-only worker adapter. The server owns openTrustedPage and the trusted
// immutable game artifact. Never accept a URL, script, browser or credentials
// from a replay submission. Production factory must use a fresh isolated
// browser context with all external networking disabled.
function createReplayVerifier({openTrustedPage,maxConcurrent=2,timeoutMs=15000}){
 if(typeof openTrustedPage!=="function"||!Number.isInteger(maxConcurrent)||maxConcurrent<1||maxConcurrent>4||!Number.isInteger(timeoutMs)||timeoutMs<1000||timeoutMs>30000)throw Error("invalid_worker_config");
 let running=0;
 return async input=>{
  validateReplay(input.replay);
  if(!TIERS.has(input.difficulty)||!Number.isInteger(input.seed)||input.seed<0||input.seed>4294967295||!Number.isFinite(input.elapsed)||input.elapsed<1||input.elapsed>3600||input.replay.at(-1).tick/60>input.elapsed+1)throw Error("invalid_session");
  if(running>=maxConcurrent)throw Error("verification_busy");
  running++;
  let resource,timer,expired=false,disposal=null;
  const dispose=()=>{if(resource&&!disposal)disposal=Promise.resolve().then(()=>resource.dispose());return disposal;};
  const work=(async()=>{try{
   const opened=await openTrustedPage(input.difficulty);
   if(!opened||!opened.page||typeof opened.dispose!=="function")throw Error("invalid_worker_resource");
   resource=opened;
   if(expired)throw Error("verification_timeout");
   return await replayInPage(resource.page,input);
  }finally{try{await dispose();}finally{running--;}}})();
  try{
   return await Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>{expired=true;reject(Error("verification_timeout"));},timeoutMs);})]);
  }finally{
   clearTimeout(timer);expired=true;
   // A timed-out task remains counted until its factory/evaluation and disposal settle.
   // Closing an opened page interrupts a stuck replay. Late resources close in work.finally.
   if(resource)void dispose()?.catch(()=>{});
  }
 };
}
module.exports={createReplayVerifier};
