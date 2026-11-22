#!/usr/bin/env node
/**
 * Stage 38 review helper: URL-level checks for a proposed independent
 * staging site. Passing does NOT verify DNS ownership, cookie scope,
 * actual server configuration, Auth isolation, or the live HTTP content.
 *
 * Deliberately rejects a subdomain of the production host too: although
 * it is a different origin, Domain=.baeguindex.com cookies can span
 * both hosts. This conservative gate is specific to this deployment.
 */
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

function parseUrl(value) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password ||
        parsed.search || parsed.hash || !parsed.hostname ||
        parsed.port || parsed.hostname.endsWith(".") ||
        parsed.hostname === "localhost" || parsed.hostname.endsWith(".localhost"))
      return null;
    return parsed;
  } catch {
    return null;
  }
}

export function inspectPreviewOrigin(productionUrl, previewUrl) {
  const prod = parseUrl(productionUrl);
  const preview = parseUrl(previewUrl);
  const errors = [];
  if (!prod) errors.push("invalid_production_https_url");
  if (!preview) errors.push("invalid_preview_https_url");
  if (prod && preview) {
    // Standalone artifact is built for an origin root, not a /_preview/
    // subpath. An unrelated hostname with a subpath is still not ready.
    if (preview.pathname !== "/") errors.push("preview_not_site_root");
    if (prod.origin === preview.origin) errors.push("same_origin");
    const base = prod.hostname.replace(/^www\./, "");
    if (preview.hostname === base || preview.hostname.endsWith("." + base))
      errors.push("production_cookie_domain_overlap");
    const prevBase = preview.hostname.replace(/^www\./, "");
    if (base === prevBase) errors.push("same_site_host");
    if (preview.hostname.includes(":") || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(preview.hostname))
      errors.push("ip_address_not_reviewed_host");
  }
  return {
    pass: errors.length === 0,
    production_origin: prod?.origin ?? null,
    preview_origin: preview?.origin ?? null,
    errors,
    note: "URL candidate check only; independently verify TLS, DNS control, cookie scope, browser storage, Auth and HTTP before live testing."
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  if (process.argv.length !== 4) {
    console.error("Usage: node staging-origin-gate.mjs https://baeguindex.com/ https://independent-preview-host.example/");
    process.exitCode = 2;
  } else {
    const result = inspectPreviewOrigin(process.argv[2], process.argv[3]);
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    if (!result.pass) process.exitCode = 1;
  }
}
