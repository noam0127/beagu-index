// Review-only request handler. No automatic network or deployment.
const allowedOrigins=new Set(["https://baeguindex.com","https://www.baeguindex.com","https://noam0127.github.io"]);
const tiers=new Set(["all","easy","normal","hard","very_hard","extreme"]),outcomes=new Set(["all","retired","all_bosses"]);
const statuses={unauthorized:401,admin_excluded:403,invalid_school:400,school_ineligible:409,invalid_replay:400,invalid_time:400,session_expired:409,rate_limited:429,verification_busy:429,verification_unavailable:503};
async function boundedJson(req){
 const max=1048576;if(Number(req.headers.get("content-length")||0)>max)throw Error("too_large");
 const reader=req.body?.getReader();if(!reader)throw Error("invalid_body");
 const decoder=new TextDecoder("utf-8",{fatal:true});let n=0,raw="";
 try{while(true){const {done,value}=await reader.read();if(done)break;n+=value.length;if(n>max){await reader.cancel();throw Error("too_large");}raw+=decoder.decode(value,{stream:true});}const v=JSON.parse(raw+decoder.decode());if(!v||typeof v!=="object"||Array.isArray(v))throw Error("invalid_body");return v;}finally{reader.releaseLock();}
}
const exact=(v,keys)=>Object.keys(v).sort().join(",")===keys.slice().sort().join(",");
export function createGateway({boundary,authenticate,listRecords,enabled=()=>false}){
 return async req=>{
  const origin=req.headers.get("origin")||"",cors=allowedOrigins.has(origin)?{"access-control-allow-origin":origin,"access-control-allow-methods":"POST,OPTIONS","access-control-allow-headers":"content-type,x-beagu-session,authorization,apikey","vary":"Origin"}:{};
  const reply=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{...cors,"content-type":"application/json","cache-control":"no-store","x-content-type-options":"nosniff"}});
  if(origin&&!allowedOrigins.has(origin))return reply({error:"origin_denied"},403);
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
  if(req.method!=="POST")return reply({error:"method_denied"},405);
  if(!enabled())return reply({error:"verification_unavailable"},503);
  if(!(req.headers.get("content-type")||"").startsWith("application/json"))return reply({error:"invalid_body"},400);
  let data;try{data=await boundedJson(req);}catch(e){return reply({error:e.message==="too_large"?"too_large":"invalid_body"},e.message==="too_large"?413:400);}
  const credentials={levelToken:req.headers.get("x-beagu-session"),adminBearer:req.headers.get("authorization")};
  try{
   if(data.action==="start"&&exact(data,["action","schoolId"]))return reply(await boundary.start({credentials,schoolId:data.schoolId}));
   if(data.action==="submit"&&exact(data,["action","sessionId","replay"]))return reply(await boundary.submit({credentials,sessionId:data.sessionId,replay:data.replay}));
   if(data.action==="list"&&exact(data,["action","difficulty","outcome"])){
    if(!tiers.has(data.difficulty)||!outcomes.has(data.outcome))return reply({error:"invalid_filter"},400);
    const actor=await authenticate(credentials);if(!actor||actor.level<1||actor.admin)return reply({error:"unauthorized"},401);
    const rows=await listRecords(data.difficulty,data.outcome);
    if(!Array.isArray(rows))throw Error("store_unavailable");
    return reply({game:"teacher_run_retirement_v4",version:"4.0",records:rows.slice(0,10).map(r=>({score:r.score,difficulty:r.difficulty,survivalSeconds:r.survival_seconds,retired:r.victory,bossCount:r.boss_count}))});
   }
   return reply({error:"invalid_action"},400);
  }catch(e){const code=e?.code||e?.message;return reply({error:Object.hasOwn(statuses,code)?code:"verification_unavailable"},statuses[code]||503);}
 };
}
