import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { inspectPublishedStaticPreview } from "../scripts/release-manager/check-published-stage38.mjs";

const production="https://baeguindex.com/";
const site="https://baegu-index-test.vercel.app/";
const pinned="5c95aadad971901a8222f83c52e93bf901a3aeb7";
const stage="ycwuugggqbunlbwuzvbx";
const index="<html><head></head><body>Preview RC only</body></html>";
const config="const SUPABASE_URL='https://ycwuugggqbunlbwuzvbx.supabase.co';";
const directory='{"version":"PINNED_RC_DIRECTORY"}';
const extraJs="window.stage38=true;";
const tinyImage=new Uint8Array([82,73,70,70,1,2,3,4,87,69,66,80]);
const hash=value=>createHash("sha256").update(value).digest("hex");
const fileHashes={
  "index.html":hash(index),
  "js/supabase-config.js":hash(config),
  "vercel.json":hash('{"review":"headers-only"}'),
  "data/public-compare-school-directory-v1.json":hash(directory),
  "js/extra-safe.js":hash(extraJs),
  "assets/picture.webp":hash(tinyImage)
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
  "/js/supabase-config.js":config,
  "/data/public-compare-school-directory-v1.json":directory,
  "/js/extra-safe.js":extraJs,
  "/assets/picture.webp":tinyImage
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
  assert.equal(calls.length,6);
  assert.equal(result.checkedAssets,6);
  assert.equal(result.totalManifestFiles,6);
  assert.ok(calls.every(x=>x.opts.method==="GET"&&x.opts.redirect==="manual"));
  assert.ok(calls.every(x=>x.url.startsWith(site)));
}
{
  // Vercel Trusted Sources: a short-lived caller token may be used to read
  // a protected PREVIEW in the approved test project, but no other host.
  const shortLivedToken="test-oidc-secret-do-not-print-62419";
  const {fetcher,calls}=mocked();
  const result=await inspect(site,{fetcher,vercelTrustedOidcToken:shortLivedToken});
  assert.equal(result.status,"STATIC_HTTP_VERIFIED");
  assert.equal(result.realAccountReady,false);
  assert.equal(result.productionReleaseReady,false);
  assert.equal(calls.length,6);
  assert.ok(calls.every(x=>new URL(x.url).hostname==="baegu-index-test.vercel.app"));
  assert.ok(calls.every(x=>x.opts.redirect==="manual"));
  assert.ok(calls.every(x=>x.opts.headers?.["x-vercel-trusted-oidc-idp-token"]===shortLivedToken));
  assert.ok(!JSON.stringify(result).includes(shortLivedToken));
}
{
  // An unaliased deployment must retain the test project's known team-owned
  // Vercel hostname structure. A sibling Vercel project is never trusted.
  const shortLivedToken="test-oidc-secret-do-not-print-62419";
  const verifiedHost="https://baegu-index-test-rc123-ibelieveyou365-4134.vercel.app/";
  const {fetcher,calls}=mocked();
  assert.equal((await inspect(verifiedHost,{fetcher,vercelTrustedOidcToken:shortLivedToken})).status,
    "STATIC_HTTP_VERIFIED");
  assert.ok(calls.every(x=>x.url.startsWith(verifiedHost)));
}
for (const unapproved of [
  "https://attacker.vercel.app/",
  "https://beagu-index-latest-ibelieveyou365-4134.vercel.app/",
  "https://preview-other-example.net/",
  "https://baegu-index-test-rc123-otherteam.vercel.app/"
]) {
  let called=false;
  const token="private-oidc-never-echo-123456";
  const result=await inspect(unapproved,{
    vercelTrustedOidcToken:token,
    fetcher:async()=>{called=true;throw Error("must not send OIDC")}
  });
  assert.equal(result.reason,"oidc_token_host_not_approved");
  assert.equal(called,false);
  assert.ok(!JSON.stringify(result).includes(token));
}
{
  let called=false;
  const result=await inspect(site,{
    vercelTrustedOidcToken:"",
    fetcher:async()=>{called=true;throw Error("invalid token must stop")}
  });
  assert.equal(result.reason,"invalid_vercel_oidc_token");
  assert.equal(called,false);
}
{
  const {fetcher,calls}=mocked();
  const result=await inspect(site,{fetcher});
  assert.equal(result.status,"STATIC_HTTP_VERIFIED");
  assert.ok(calls.every(x=>!x.opts.headers));
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
  assert.equal((await inspect(site,{fetcher,expectedManifestSha256:hash(malicious)})).reason,"rc_provenance_mismatch");
}
{
  const {fetcher}=mocked({routeOverrides:{"/index.html":"tampered static page"}});
  assert.equal((await inspect(site,{fetcher})).reason,"deployed_file_hash_mismatch");
}
{
  // A newer unapproved directory must not pass even when RC HTML/JS match.
  const {fetcher}=mocked({routeOverrides:{"/data/public-compare-school-directory-v1.json":'{"version":"UNAPPROVED_NEW_DIRECTORY"}'}});
  assert.equal((await inspect(site,{fetcher})).reason,"deployed_file_hash_mismatch");
}
{
  // Changing a secondary JS file must fail even when index/config/data match.
  const {fetcher}=mocked({routeOverrides:{"/js/extra-safe.js":"window.stage38=false;"}});
  const result=await inspect(site,{fetcher});
  assert.equal(result.reason,"deployed_file_hash_mismatch");
  assert.equal(result.detail,"js/extra-safe.js");
}
{
  // Binary assets are hashed byte-for-byte, not via UTF-8 text conversion.
  const {fetcher}=mocked({routeOverrides:{"/assets/picture.webp":new Uint8Array([82,73,70,70,9])}});
  const result=await inspect(site,{fetcher});
  assert.equal(result.reason,"deployed_file_hash_mismatch");
  assert.equal(result.detail,"assets/picture.webp");
}
{
  const traversal=JSON.stringify({...manifest,files_sha256:{...fileHashes,"../supabase/config.json":hash("bad")}});
  const {fetcher}=mocked({routeOverrides:{"/stage38-release-manifest.json":traversal}});
  const result=await inspect(site,{fetcher,expectedManifestSha256:hash(traversal)});
  assert.equal(result.reason,"invalid_rc_asset_inventory");
}
{
  const bad=JSON.stringify({...manifest,files_sha256:{"index.html":fileHashes["index.html"]}});
  const {fetcher}=mocked({routeOverrides:{"/stage38-release-manifest.json":bad}});
  assert.equal((await inspect(site,{fetcher,expectedManifestSha256:hash(bad)})).reason,"missing_file_integrity");
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
console.log("PASS: approved test-host OIDC is forwarded only to the exact host; unapproved hosts receive no requests or secrets.");
console.log("No network was used; all GETs exercised against an in-process mock.");
