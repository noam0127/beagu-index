import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { inspectPublishedStaticPreview } from "../scripts/release-manager/check-published-stage38.mjs";

const production="https://baeguindex.com/";
const site="https://baegu-index-test.vercel.app/";
const pinned="5c95aadad971901a8222f83c52e93bf901a3aeb7";
const stage="ycwuugggqbunlbwuzvbx";
const index="<html><head></head><body>Preview RC only</body></html>";
const config="const SUPABASE_URL='https://ycwuugggqbunlbwuzvbx.supabase.co';";
const hash=value=>createHash("sha256").update(value).digest("hex");
const fileHashes={
  "index.html":hash(index),
  "js/supabase-config.js":hash(config),
  "vercel.json":hash('{"review":"headers-only"}')
};
const manifest={
  schema:"beagu-independent-preview-package-v1",
  rc_version:"v1.1.0-rc.1",
  source_sha:pinned,
  supabase_project_ref:stage,
  environment:"isolated-test-package",
  deployment_status:"unverified",
  files_sha256:fileHashes
};
const trustedManifestSha256=hash(JSON.stringify(manifest));
const inspect=async (url, options={}) => inspectPublishedStaticPreview(url, {
  expectedManifestSha256:trustedManifestSha256, ...options
});
const policy="connect-src 'self' https://"+stage+".supabase.co wss://"+stage+".supabase.co; form-action 'self'; frame-ancestors 'none'; base-uri 'self'";
const headers={
  "content-security-policy":policy,
  "x-robots-tag":"noindex, nofollow",
  "x-frame-options":"DENY"
};
// Do not allow an unsigned same-server manifest to become its own trust root.
assert.equal((await inspectPublishedStaticPreview(site,{fetcher:async()=>{throw Error("should not make network calls")}})).reason,
  "trusted_manifest_digest_required");
assert.equal((await inspectPublishedStaticPreview(site,{expectedManifestSha256:"not-a-sha",fetcher:async()=>{throw Error("should not make network calls")}})).reason,
  "trusted_manifest_digest_required");
const routes={
  "/stage38-release-manifest.json":JSON.stringify(manifest),
  "/index.html":index,
  "/js/supabase-config.js":config
};
function mocked({routeOverrides={},headerOverrides={},statusOverrides={}}={}){
  const calls=[];
  const fetcher=async(url,opts)=>{
    calls.push({url,opts});
    const path=new URL(url).pathname;
    const status=statusOverrides[path]??200;
    const body=routeOverrides[path]??routes[path]??"";
    return new Response(body,{status,headers:{...headers,...headerOverrides}});
  };
  return {fetcher,calls};
}
{
  const {fetcher,calls}=mocked();
  const result=await inspect(site,{fetcher,productionUrl:production});
  assert.equal(result.status,"STATIC_HTTP_VERIFIED");
  assert.equal(result.staticReady,true);
  assert.equal(result.realAccountReady,false);
  assert.equal(result.productionReleaseReady,false);
  assert.equal(result.pinnedSha,pinned);
  assert.equal(calls.length,3);
  assert.ok(calls.every(x=>x.opts.method==="GET"&&x.opts.redirect==="manual"));
  assert.ok(calls.every(x=>x.url.startsWith(site)));
}
{
  let called=false;
  const result=await inspect(
    "https://baeguindex.com/_preview/",
    {fetcher:async()=>{called=true;throw Error("must not request production")}}
  );
  assert.equal(result.status,"BLOCKED");
  assert.equal(result.reason,"invalid_isolation_origin");
  assert.equal(called,false);
}
for (const status of [401,403]) {
  const {fetcher}=mocked({statusOverrides:{"/stage38-release-manifest.json":status}});
  const result=await inspect(site,{fetcher});
  assert.equal(result.reason,"vercel_authentication_required");
  assert.equal(result.staticReady,false);
}
{
  const {fetcher}=mocked({statusOverrides:{"/stage38-release-manifest.json":404}});
  assert.equal((await inspect(site,{fetcher})).reason,"missing_or_inaccessible_rc_asset");
}
{
  const {fetcher}=mocked({statusOverrides:{"/stage38-release-manifest.json":307}});
  assert.equal((await inspect(site,{fetcher})).reason,"unexpected_redirect");
}
{
  const malicious=JSON.stringify({...manifest,source_sha:"0".repeat(40)});
  const {fetcher}=mocked({routeOverrides:{"/stage38-release-manifest.json":malicious}});
  assert.equal((await inspect(site,{fetcher})).reason,"rc_provenance_mismatch");
}
{
  const {fetcher}=mocked({routeOverrides:{"/index.html":"tampered static page"}});
  assert.equal((await inspect(site,{fetcher})).reason,"deployed_file_hash_mismatch");
}
{
  const bad=JSON.stringify({...manifest,files_sha256:{"index.html":fileHashes["index.html"]}});
  const {fetcher}=mocked({routeOverrides:{"/stage38-release-manifest.json":bad}});
  assert.equal((await inspect(site,{fetcher})).reason,"missing_file_integrity");
}
{
  const {fetcher}=mocked({headerOverrides:{"content-security-policy":"default-src *"}});
  assert.equal((await inspect(site,{fetcher})).reason,"missing_http_csp_header");
}
{
  const {fetcher}=mocked({headerOverrides:{"x-robots-tag":""}});
  assert.equal((await inspect(site,{fetcher})).reason,"missing_noindex_header");
}
{
  const {fetcher}=mocked({headerOverrides:{"x-frame-options":"SAMEORIGIN"}});
  assert.equal((await inspect(site,{fetcher})).reason,"missing_frame_protection");
}
{
  const {fetcher}=mocked({routeOverrides:{"/js/supabase-config.js":config+" // snvzwrexuqavnfvzgxqj"}});
  assert.equal((await inspect(site,{fetcher})).reason,"deployed_file_hash_mismatch");
}
{
  // A malicious host changes HTML, config AND its self-declared manifest,
  // keeping the pinned SHA field intact. This must fail against the trusted
  // digest obtained from approved CI, even if all supplied hashes agree.
  const forgedHtml="<html><body>spoofed candidate</body></html>";
  const forgedConfig="const SUPABASE_URL='https://ycwuugggqbunlbwuzvbx.supabase.co';";
  const forgedManifest={...manifest,files_sha256:{
    ...manifest.files_sha256,
    "index.html":hash(forgedHtml),
    "js/supabase-config.js":hash(forgedConfig)
  }};
  const {fetcher}=mocked({routeOverrides:{
    "/stage38-release-manifest.json":JSON.stringify(forgedManifest),
    "/index.html":forgedHtml,
    "/js/supabase-config.js":forgedConfig
  }});
  assert.equal((await inspect(site,{fetcher})).reason,"independent_manifest_digest_mismatch");
}
console.log("PASS: Stage 38 HTTP acceptance rejects same-origin, SSO, redirects, stale or altered RC, live backend references and missing security headers.");
console.log("No network was used; all GETs exercised against an in-process mock.");
