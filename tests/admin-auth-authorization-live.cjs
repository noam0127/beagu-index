// Credential-free production probes. Never read or transmit user credentials.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const config = fs.readFileSync("js/supabase-config.js", "utf8");
const url = config.match(/SUPABASE_URL\s*=\s*["']([^"']+)["']/)?.[1];
const key = config.match(/SUPABASE_PUBLISHABLE_KEY\s*=\s*["']([^"']+)["']/)?.[1];
assert(url && key, "Publishable Supabase config is required");

async function invoke(slug, body, extras = {}, method = "POST") {
  return fetch(url + "/functions/v1/" + slug, {
    method,
    headers: { apikey: key, "Content-Type": "application/json", ...extras },
    ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15000)
  });
}
async function rpc(name, args) {
  return fetch(url + "/rest/v1/rpc/" + name, {
    method: "POST", headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify(args), signal: AbortSignal.timeout(15000)
  });
}
(async () => {
  const cases = [
    { slug:"beagu-admin-access", body:{action:"verify"} },
    { slug:"beagu-admin-dashboard-v1", body:{action:"dashboard",period:"7d"} },
    { slug:"beagu-2026-review-admin", body:{action:"queue",filter:"all",page:0} }
  ];
  for(const c of cases) {
    assert.equal((await invoke(c.slug,c.body)).status,401,c.slug+" anonymous POST");
    assert.equal((await invoke(c.slug,c.body,{Authorization:"Bearer definitely.invalid.jwt"})).status,401,c.slug+" forged JWT");
    assert.equal((await invoke(c.slug,c.body,{},"GET")).status,405,c.slug+" GET");
    assert.equal((await invoke(c.slug,c.body,{Origin:"https://untrusted.example"})).status,403,c.slug+" origin");
  }
  const restricted = [
    ["beagu_admin_dashboard_v1",{p_period:"all"}],
    ["beagu_admin_live_traffic_v1",{p_period:"today"}],
    ["beagu_admin_page_perf_v1",{p_period:"today"}],
    ["beagu_admin_active_mfa_session",{p_user:"00000000-0000-4000-8000-000000000000",p_session:"00000000-0000-4000-8000-000000000000"}],
    ["beagu_2026_admin_review_queue",{p_filter:"all",p_limit:1,p_offset:0}]
  ];
  for(const [name,args] of restricted) {
    const res=await rpc(name,args);
    assert.notEqual(res.status,200,name+" must not be directly executable by the public");
  }
  console.log("PASS: unauthenticated, forged JWT, cross-origin and direct RPC restrictions");
})().catch(e=>{console.error(e);process.exitCode=1;});
