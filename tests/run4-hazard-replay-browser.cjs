"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),{execFileSync}=require("node:child_process");
(async()=>{
 const directory=fs.mkdtempSync(path.join(process.cwd(),".run4-fire-fixture-")),artifact=path.join(directory,"artifact");
 let factory;
 try{
  execFileSync(process.execPath,["docs/run4-ranking-preflight/cloud-run/prepare-context.cjs",artifact],{stdio:"inherit"});
  factory=await require(path.join(artifact,"factory.cjs")).createFactory();
  const {createReplayVerifier}=require(path.join(artifact,"replay-worker.cjs"));
  const capturePage=await factory.openTrustedPage("easy");let capture;
  try{
   const page=capturePage.page;await page.evaluate(()=>window.__trustedRun4Replay.startSeed(20261125));
   for(let i=0;i<9;i++){
    const snapshot=await page.evaluate(()=>window.__trustedRun4Replay.autoAdvance());
    if(snapshot.state==="over")break;
    assert.equal(snapshot.state,"between");
    const buttons=page.locator("#choices button"),labels=await buttons.allTextContents();
    const preferred=["자기관리","생활지도","위기 대응","동료 관계","교육자의 신념","학급운영","수업 전문성"].map(label=>labels.findIndex(x=>x.includes(label))).find(i=>i>=0);
    await buttons.nth(preferred??0).click();
   }
   capture=await page.evaluate(()=>window.__trustedRun4Replay.envelope());
   assert.ok(capture&&capture.events.length&&capture.result.survivalSeconds>=30,"fixture must reach the second career round");
  }finally{await capturePage.dispose();}
  const verifier=createReplayVerifier({openTrustedPage:factory.openTrustedPage,timeoutMs:30000});
  const replay=await verifier({seed:capture.seed,difficulty:"easy",elapsed:190,replay:capture.events});
  assert.deepEqual(replay,capture.result);
  console.log("PASS real isolated browser capture/replay parity "+JSON.stringify({seconds:replay.survivalSeconds,score:replay.score,bosses:replay.bossIds.length,events:capture.events.length}));
 }finally{if(factory)await factory.close();fs.rmSync(directory,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
