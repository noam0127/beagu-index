"use strict";
const http=require("node:http"),crypto=require("node:crypto");
const {createFactory}=require("./factory.cjs");
const {createReplayVerifier}=require("./replay-worker.cjs");
const {validateReplay,TIERS}=require("./replay-protocol.cjs");
const MAX=1048576;
function createServer({verify,secret,now=Date.now}){
 if(typeof verify!=="function"||!(/^[a-f0-9]{64}$/.test(secret||"")))throw Error("missing_server_config");
 const nonces=new Map();let active=false;
 function reply(res,status,value){res.writeHead(status,{"content-type":"application/json","cache-control":"no-store","x-content-type-options":"nosniff"});res.end(JSON.stringify(value));}
 return http.createServer({requestTimeout:20000,headersTimeout:5000,maxHeaderSize:8192},async(req,res)=>{
  if(req.method==="GET"&&req.url==="/healthz")return reply(res,200,{ok:true});
  if(req.method!=="POST"||req.url!=="/v1/replay")return reply(res,404,{error:"not_found"});
  const ts=req.headers["x-run4-time"],nonce=req.headers["x-run4-nonce"],sig=req.headers["x-run4-signature"];
  const at=now();
  if(typeof ts!=="string"||!/^\d{13}$/.test(ts)||Math.abs(at-Number(ts))>60000||typeof nonce!=="string"||!(/^[a-f0-9]{32}$/.test(nonce))||typeof sig!=="string"||!(/^[a-f0-9]{64}$/.test(sig)))return reply(res,401,{error:"unauthorized"});
  if(req.headers["content-type"]!=="application/json"||Number(req.headers["content-length"]||0)>MAX)return reply(res,413,{error:"invalid_body"});
  if(active)return reply(res,429,{error:"verification_busy"});
  active=true;
  try{
   let total=0;const chunks=[];
   for await(const c of req){total+=c.length;if(total>MAX){reply(res,413,{error:"invalid_body"});return;}chunks.push(c);}
   const raw=Buffer.concat(chunks),expected=crypto.createHmac("sha256",Buffer.from(secret,"hex")).update("run4-v1\n"+ts+"\n"+nonce+"\n").update(raw).digest();
   if(!crypto.timingSafeEqual(expected,Buffer.from(sig,"hex")))return reply(res,401,{error:"unauthorized"});
   for(const [key,until] of nonces)if(until<at)nonces.delete(key);
   if(nonces.has(nonce)||nonces.size>=1024)return reply(res,409,{error:"replayed_request"});
   nonces.set(nonce,at+120000);
   let data;try{data=JSON.parse(raw.toString("utf8"));if(!data||Object.keys(data).sort().join(",")!=="difficulty,elapsed,replay,seed"||!TIERS.has(data.difficulty)||!Number.isInteger(data.seed)||data.seed<0||data.seed>4294967295||!Number.isFinite(data.elapsed)||data.elapsed<1||data.elapsed>3600)throw Error();validateReplay(data.replay);}catch{return reply(res,400,{error:"invalid_replay"});}
   try{const result=await verify(data);return reply(res,200,{result});}catch(e){const code=e?.message||"";return reply(res,code==="verification_busy"?429:code==="verification_timeout"?503:400,{error:code==="verification_busy"||code==="verification_timeout"?code:"replay_rejected"});}
  }catch{return reply(res,400,{error:"invalid_request"});}finally{active=false;}
 });
}
async function main(){
 const secret=process.env.RUN4_WORKER_HMAC;
 if(!/^[a-f0-9]{64}$/.test(secret||""))throw Error("missing_server_config");
 const factory=await createFactory();
 const server=createServer({verify:createReplayVerifier({openTrustedPage:factory.openTrustedPage,maxConcurrent:1,timeoutMs:15000}),secret});
 server.listen(Number(process.env.PORT||8080),"0.0.0.0");
 process.on("SIGTERM",()=>{server.close();void factory.close().finally(()=>process.exit(0));});
}
if(require.main===module)main().catch(()=>{console.error("worker startup failed");process.exitCode=1;});
module.exports={createServer};
