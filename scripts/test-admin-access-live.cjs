/* Unauthenticated live smoke for deployed administrator gate.
   Never creates an Auth user and never writes a statistics event. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const config=fs.readFileSync("js/supabase-config.js","utf8");
const key=config.match(/SUPABASE_PUBLISHABLE_KEY\s*=\s*["']([^"']+)["']/)?.[1];
const origin=config.match(/SUPABASE_URL\s*=\s*["']([^"']+)["']/)?.[1];
assert(key && key.startsWith("sb_publishable_"));
assert(origin && origin.endsWith(".supabase.co"));
async function check() {
  const base=origin+"/functions/v1/beagu-admin-access";
  const headers={"apikey":key,"Content-Type":"application/json"};
  const noAuth=await fetch(base,{method:"POST",headers,body:JSON.stringify({action:"status"}),signal:AbortSignal.timeout(15000)});
  assert.equal(noAuth.status,401,"Unauthenticated status must be HTTP 401");
  const bogus=await fetch(base,{method:"POST",headers:{...headers,Authorization:"Bearer invalid.invalid.invalid"},body:JSON.stringify({action:"verify"}),signal:AbortSignal.timeout(15000)});
  assert.equal(bogus.status,401,"Forged bearer must be rejected");
  const get=await fetch(base,{method:"GET",headers,signal:AbortSignal.timeout(15000)});
  assert.equal(get.status,405,"Admin gate must not expose GET data");
  for(const table of ["beagu_admin_accounts","beagu_admin_audit_events"]){
    const response=await fetch(origin+"/rest/v1/"+table+"?select=*",{
      headers:{"apikey":key},signal:AbortSignal.timeout(15000)
    });
    assert.notEqual(response.status,200,"Anon must not read "+table);
    assert([401,403,404].includes(response.status),"Unexpected anon status "+response.status+" for "+table);
  }
  console.log("Live unauthenticated admin access denied; private RLS surfaces blocked");
}
check().catch(e=>{console.error(e);process.exitCode=1;});