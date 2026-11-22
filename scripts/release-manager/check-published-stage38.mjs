#!/usr/bin/env node
/**
 * Read-only Stage 38 acceptance probe for a separately hosted, static RC.
 * Requires an independent, owner-reviewed SHA-256 for the RC manifest.
 * Requests every published static file with read-only GET and compares
 * exact content hashes plus response security headers. An optional short-lived
 * Vercel Trusted Sources OIDC token is sent ONLY to the pinned test project's
 * known hosts. Never logs or embeds the token in a URL or release manifest.
 * No cookies, application authentication, writes, deployment or promotion.
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
const REQUIRED_FILES = [
  "index.html", "js/supabase-config.js", "vercel.json",
  "data/public-compare-school-directory-v1.json"
];
const BUILD_ONLY_FILES = new Set(["vercel.json", ".nojekyll"]);
const SCHEMA = "beagu-independent-preview-package-v1";
// Authenticated same-project PREVIEW requests are allowed only on these
// exact project-owned hostname shapes. Never forward OIDC to arbitrary
// vercel.app subdomains, production, or an unreviewed custom domain.
const ALLOWED_VERCEL_HOST = /^(?:baegu-index-test\.vercel\.app|baegu-index-test-[a-z0-9-]+-ibelieveyou365-4134\.vercel\.app)$/;
const MAX_LISTED_ASSETS = 1500;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const sha256 = value => createHash("sha256").update(value).digest("hex");
const failure = (reason, detail) => ({
  status: "BLOCKED", reason, detail, staticReady: false,
  realAccountReady: false, productionReleaseReady: false
});
const safeRelativeAssetPath = value => (
  typeof value === "string" && value.length > 0 &&
  value.length < 512 && !value.includes("\\") &&
  !value.includes("?") && !value.includes("#") &&
  !value.startsWith("/") && !value.startsWith(".") &&
  value.split("/").every(part => part !== "" && part !== "." && part !== "..") &&
  !value.includes("%")
);
const auditableTextAsset = path =>
  /\.(?:html?|js|mjs|css|json|webmanifest|xml|svg|csv)$/i.test(path);

export async function inspectPublishedStaticPreview(
  siteUrl, {fetcher=globalThis.fetch, productionUrl="https://baeguindex.com/",
    expectedManifestSha256, vercelTrustedOidcToken}={}
) {
  const scope = inspectPreviewOrigin(productionUrl, siteUrl);
  if (!scope.pass) return failure("invalid_isolation_origin",scope.errors);
  if (typeof expectedManifestSha256 !== "string" || !/^[0-9a-f]{64}$/.test(expectedManifestSha256))
    return failure("trusted_manifest_digest_required");
  if (typeof fetcher !== "function") return failure("no_http_client");
  const origin = scope.preview_origin;
  const hasOidcToken = typeof vercelTrustedOidcToken === "string" &&
    vercelTrustedOidcToken.length > 0;
  if (vercelTrustedOidcToken !== undefined && !hasOidcToken)
    return failure("invalid_vercel_oidc_token");
  if (hasOidcToken && !ALLOWED_VERCEL_HOST.test(new URL(origin).hostname))
    return failure("oidc_token_host_not_approved");
  const readFile = async path => {
    let response;
    try {
      response = await fetcher(new URL("/"+path, origin).href, {
        method:"GET", redirect:"manual", cache:"no-store",
        ...(hasOidcToken ? {headers:{
          "x-vercel-trusted-oidc-idp-token":vercelTrustedOidcToken
        }} : {})
      });
    } catch {
      return {error:failure("network_unavailable",path)};
    }
    if (response.status === 401 || response.status === 403)
      return {error:failure("vercel_authentication_required",path)};
    if (response.status >= 300 && response.status < 400)
      return {error:failure("unexpected_redirect",path)};
    if (response.status !== 200)
      return {error:failure("missing_or_inaccessible_rc_asset",{path,status:response.status})};
    const len = Number(response.headers.get("content-length") ?? "0");
    if (Number.isFinite(len) && len > MAX_FILE_BYTES)
      return {error:failure("oversize_rc_asset",path)};
    let data;
    try {
      data = new Uint8Array(await response.arrayBuffer());
    } catch {
      return {error:failure("unreadable_rc_asset",path)};
    }
    if (data.byteLength > MAX_FILE_BYTES)
      return {error:failure("oversize_rc_asset",path)};
    const policy = response.headers.get("content-security-policy") || "";
    const robots = response.headers.get("x-robots-tag") || "";
    if (!policy.includes("https://"+STAGING_REF+".supabase.co") ||
        !policy.includes("frame-ancestors 'none'") ||
        !policy.includes("form-action 'self'") ||
        policy.includes(LIVE_REF))
      return {error:failure("missing_http_csp_header",path)};
    if (!robots.includes("noindex"))
      return {error:failure("missing_noindex_header",path)};
    if (response.headers.get("x-frame-options") !== "DENY")
      return {error:failure("missing_frame_protection",path)};
    return {data};
  };
  const response = await readFile("stage38-release-manifest.json");
  if (response.error) return response.error;
  const manifestText = new TextDecoder().decode(response.data);
  if (sha256(response.data) !== expectedManifestSha256)
    return failure("independent_manifest_digest_mismatch");
  let manifest;
  try { manifest = JSON.parse(manifestText); }
  catch { return failure("invalid_rc_manifest"); }
  if (!manifest || manifest.schema !== SCHEMA ||
      manifest.rc_version !== "v1.1.0-rc.1" ||
      manifest.source_sha !== PINNED_SHA ||
      manifest.supabase_project_ref !== STAGING_REF ||
      manifest.environment !== "isolated-test-package" ||
      manifest.deployment_status !== "unverified")
    return failure("rc_provenance_mismatch");

  const digests = manifest.files_sha256;
  if (!digests || typeof digests !== "object" || Array.isArray(digests))
    return failure("missing_file_integrity");
  const paths = Object.keys(digests);
  if (paths.length === 0 || paths.length > MAX_LISTED_ASSETS)
    return failure("invalid_rc_asset_inventory");
  for (const path of REQUIRED_FILES) {
    if (!Object.hasOwn(digests,path)) return failure("missing_file_integrity",path);
  }
  for (const path of paths) {
    if ((path !== ".nojekyll" && !safeRelativeAssetPath(path)) ||
        path === "stage38-release-manifest.json" ||
        !/^[0-9a-f]{64}$/.test(digests[path]))
      return failure("invalid_rc_asset_inventory",path);
  }

  // All publicly served files must be checked; looking only at index.html
  // permits changed JS/CSS/binary game assets to evade static acceptance.
  // vercel.json and .nojekyll are packaging controls, not HTTP-served assets.
  const servedPaths = paths.filter(path => !BUILD_ONLY_FILES.has(path)).sort();
  for (const path of servedPaths) {
    const received = await readFile(path);
    if (received.error) return received.error;
    if (sha256(received.data) !== digests[path])
      return failure("deployed_file_hash_mismatch",path);
    if (auditableTextAsset(path)) {
      const data = new TextDecoder().decode(received.data);
      if (data.includes(LIVE_REF) || data.includes(LIVE_KEY))
        return failure("production_supabase_reference",path);
      if (path === "js/supabase-config.js" &&
          (!data.includes(STAGING_REF) ||
           !data.includes("https://"+STAGING_REF+".supabase.co")))
        return failure("staging_supabase_reference_missing",path);
    }
  }
  return {
    status:"STATIC_HTTP_VERIFIED",
    staticReady:true,realAccountReady:false,productionReleaseReady:false,
    checkedOrigin:origin,pinnedSha:PINNED_SHA,
    trustedManifestSha256:expectedManifestSha256,
    checkedAssets:1 + servedPaths.length,
    totalManifestFiles:paths.length,
    remaining:"Owner approval, real-browser storage separation, staging Auth/RLS and E2E QA"
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url)===resolve(process.argv[1])) {
  if (process.argv.length!==4) {
    console.error("Usage: node scripts/release-manager/check-published-stage38.mjs https://independent-preview-host/ <trusted-manifest-sha256-from-approved-CI>");
    process.exitCode=2;
  } else {
    // vc env run injects a short-lived token into the process environment.
    // Its value must never be printed, committed, cached, or added to a URL.
    const result=await inspectPublishedStaticPreview(process.argv[2], {
      expectedManifestSha256:process.argv[3],
      ...(process.env.VERCEL_OIDC_TOKEN
        ? {vercelTrustedOidcToken:process.env.VERCEL_OIDC_TOKEN}
        : {})
    });
    process.stdout.write(JSON.stringify(result,null,2)+"\n");
    if (!result.staticReady) process.exitCode=1;
  }
}
