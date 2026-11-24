"use strict";
const assert=require("node:assert/strict"),crypto=require("node:crypto");
(async()=>{
 const base="http://127.0.0.1:8080",secret="ab".repeat(32);
 const data={seed:42,difficulty:"normal",elapsed:6,replay:[{tick:0,action:"move",x:.5,y:.85},{tick:120,action:"move",x:.25,y:.7},{tick:240,action:"release"},{tick:300,action:"stop"}]};
 const raw=JSON.stringify(data);
 function sign(body,nonce=crypto.randomBytes(16).toString("hex"),ts=String(Date.now())){
  return {"content-type":"application/json","x-run4-time":ts,"x-run4-nonce":nonce,"x-run4-signature":crypto.createHmac("sha256",Buffer.from(secret,"hex")).update("run4-v1\n"+ts+"\n"+nonce+"\n"+body).digest("hex")};
 }
 const send=(body,headers)=>fetch(base+"/v1/replay",{method:"POST",body,headers});
 for(let i=0;i<30;i++){try{if((await fetch(base+"/healthz")).ok)break;}catch{}await new Promise(r=>setTimeout(r,500));}
 assert.equal((await send(raw,{"content-type":"application/json"})).status,401);
 const signed=sign(raw),a=await send(raw,signed),first=await a.json();assert.equal(a.status,200,JSON.stringify(first));
 assert.equal(first.result.survivalSeconds,5);assert.equal(first.result.difficulty,"normal");
 assert.equal((await send(raw,signed)).status,409);
 const b=await send(raw,sign(raw));assert.equal(b.status,200);assert.deepEqual(await b.json(),first);
 const forged=JSON.stringify({...data,score:999999});assert.equal((await send(forged,sign(forged))).status,400);
 const invalid=JSON.stringify({...data,replay:[{tick:0,action:"leave",choice:20},{tick:60,action:"stop"}]});assert.equal((await send(invalid,sign(invalid))).status,400);
 console.log("PASS RUN4_CONTAINER_HTTP real replay, HMAC, nonce, result consistency and invalid actions");
})().catch(e=>{console.error(e);process.exitCode=1;});
