#!/usr/bin/env node
/**
 * Read-only Stage 38 acceptance probe for a separately hosted, static RC.
 * Requests 3 public files with GET and checks exact content hashes and
 * response security headers. No credentials, cookies, authentication, writes,
 * deployment, promotion or release-manager commands are used.
 *
 * Passing is ONLY static-host verification; full QA and owner AAL2 approval
 * remain separately required.
 */
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { inspectPreviewOrigin } from "./staging-origin-gate.mjs";

const PINNED_SHA = "5c95aadad971901a8222f83c52e93bf901a3aeb7";
const STAGING_REF = "ycwuugggqbunlbwuzvbx";
const LIVE_REF = "snvzwrexuqavnfvzgxqj";
const LIVE_KEY = "sb_publishable_WbByHRhd0RmNiRrYHaINXQ_u5dfegL2";
const DIGEST_PATHS = ["index.html", "js/supabase-config.js", "vercel.json"];
const SCHEMA = "beagu-independent-preview-package-v1";

const sha256 = value => createHash("sha256").update(value).digest("hex");
const failure = (reason, detail) => ({
  status: "BLOCKED", reason, detail, staticReady: false,
  realAccountReady: false, productionReleaseReady: false
});

export async function inspectPublishedStaticPreview(
  siteUrl, {fetcher=globalThis.fetch, productionUrl="https://baeguindex.com/"}={}
) {
  const scope=inspectPreviewOrigin(productionUrl,siteUrl);
  if (!scope.pass) return failure("invalid_isolation_origin",scope.errors);
  if (typeof fetcher!=="function") return failure("no_http_client");
  const origin=scope.preview_origin;
  const responses={};
  for (const path of ["stage38-release-manifest.json","index.html","js/supabase-config.js"]) {
    const url=new URL("/"+path,origin).href;
    let response;
    try {
      response=await fetcher(url,{method:"GET",redirect:"manual",cache:"no-store"});
    } catch {
      return failure("network_unavailable",path);
    }
    if (response.status===401 || response.status===403)
      return failure("vercel_authentication_required",path);
    if (response.status>=300 && response.status<400)
      return failure("unexpected_redirect",path);
    if (response.status!==200)
      return failure("missing_or_inaccessible_rc_asset",{path,status:response.status});
    const body=await response.text();
    responses[path]={body,headers:response.headers};
  }
  const manifestText=responses["stage38-release-manifest.json"].body;
  let manifest;
  try { manifest=JSON.parse(manifestText); }
  catch { return failure("invalid_rc_manifest"); }
  if (!manifest || manifest.schema!==SCHEMA ||
      manifest.rc_version!=="v1.1.0-rc.1" ||
      manifest.source_sha!==PINNED_SHA ||
      manifest.supabase_project_ref!==STAGING_REF ||
      manifest.environment!=="isolated-test-package" ||
      manifest.deployment_status!=="unverified")
    return failure("rc_provenance_mismatch");
  for (const path of DIGEST_PATHS) {
    if (typeof manifest.files_sha256?.[path]!=="string" ||
        !/^[0-9a-f]{64}$/.test(manifest.files_sha256[path]))
      return failure("missing_file_integrity",path);
  }
  const html=responses["index.html"].body;
  const config=responses["js/supabase-config.js"].body;
  if (sha256(html)!==manifest.files_sha256["index.html"] ||
      sha256(config)!==manifest.files_sha256["js/supabase-config.js"])
    return failure("deployed_file_hash_mismatch");
  if (!config.includes(STAGING_REF) || !config.includes("ycwuugggqbunlbwuzvbx.supabase.co") ||
      config.includes(LIVE_REF) || config.includes(LIVE_KEY) ||
      html.includes(LIVE_REF) || html.includes(LIVE_KEY))
    return failure("production_supabase_reference");
  for (const [path,{headers}] of Object.entries(responses)) {
    const policy=headers.get("content-security-policy")||"";
    const robots=headers.get("x-robots-tag")||"";
    if (!policy.includes("https://"+STAGING_REF+".supabase.co") ||
        !policy.includes("frame-ancestors 'none'") ||
        !policy.includes("form-action 'self'") ||
        policy.includes(LIVE_REF))
      return failure("missing_http_csp_header",path);
    if (!robots.includes("noindex"))
      return failure("missing_noindex_header",path);
    if (headers.get("x-frame-options")!=="DENY")
      return failure("missing_frame_protection",path);
  }
  return {
    status:"STATIC_HTTP_VERIFIED",
    staticReady:true,realAccountReady:false,productionReleaseReady:false,
    checkedOrigin:origin,pinnedSha:PINNED_SHA,checkedAssets:3,
    remaining:"Owner approval, real-browser storage separation, staging Auth/RLS and E2E QA"
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url)===resolve(process.argv[1])) {
  if (process.argv.length!==3) {
    console.error("Usage: node scripts/release-manager/check-published-stage38.mjs https://independent-preview-host/");
    process.exitCode=2;
  } else {
    const result=await inspectPublishedStaticPreview(process.argv[2]);
    process.stdout.write(JSON.stringify(result,null,2)+"\n");
    if (!result.staticReady) process.exitCode=1;
  }
}
