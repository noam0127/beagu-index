const assert=require("node:assert/strict");
const fs=require("node:fs");
const cfg=fs.readFileSync("js/supabase-config.js","utf8");
const api=cfg.match(/SUPABASE_URL\s*=\s*["']([^"']+)["']/)?.[1];
const key=cfg.match(/SUPABASE_PUBLISHABLE_KEY\s*=\s*["']([^"']+)["']/)?.[1];
assert(api&&key);
async function probe(endpoint,payload,auth){
 const response=await fetch(api+"/functions/v1/"+endpoint,{
   method:"POST",headers:{"Content-Type":"application/json","apikey":key,...(auth?{"Authorization":auth}:{})},
   body:JSON.stringify(payload),signal:AbortSignal.timeout(18000)
 });
 return response;
}
(async()=>{
 const endpoint="beagu-admin-dashboard-v1";
 assert.equal((await probe(endpoint,{action:"dashboard",period:"7d"})).status,401);
 assert.equal((await probe(endpoint,{action:"dashboard",period:"all"},"Bearer definitely.invalid.jwt")).status,401);
 const forbidden=await fetch(api+"/rest/v1/rpc/beagu_admin_dashboard_v1",{
   method:"POST",headers:{"Content-Type":"application/json","apikey":key},
   body:JSON.stringify({p_period:"all"}),signal:AbortSignal.timeout(18000)
 });
 assert.notEqual(forbidden.status,200,"Public may not execute private aggregate");
 const wrongMethod=await fetch(api+"/functions/v1/"+endpoint,{method:"GET",headers:{"apikey":key},signal:AbortSignal.timeout(18000)});
 assert.equal(wrongMethod.status,405);
 console.log("PASS: production admin endpoint rejects anonymous/forged JWT; direct RPC denies anonymous queries");
})().catch(err=>{console.error(err);process.exitCode=1;});