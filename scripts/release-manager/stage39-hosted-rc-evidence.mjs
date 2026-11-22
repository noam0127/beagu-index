#!/usr/bin/env node
// Stage39: verify a hosted, isolated RC deployment receipt before accepting E2E.
// Pure/side-effect-free; no Vercel API call or credentials required.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

export const RC_SHA = "5c95aadad971901a8222f83c52e93bf901a3aeb7";
export const TEST_PROJECT = "prj_AfPd5IvdT6DlIJkTuSfGxu2PaVVA";
export const STAGING_REF = "ycwuugggqbunlbwuzvbx";
export const PRODUCTION_REF = "snvzwrexuqavnfvzgxqj";

export function validateStage39Evidence(record) {
  assert.ok(record && typeof record === "object" && !Array.isArray(record));
  // A READY deployment in the separate test project is necessary but not sufficient.
  assert.equal(record.project_id, TEST_PROJECT, "Not the isolated Vercel test project");
  assert.equal(record.target, "preview", "Only unaliased preview deployments can be reviewed");
  assert.equal(record.state, "READY", "Preview build is not ready");
  assert.equal(record.source_sha, RC_SHA, "Deployed source is not pinned RC");
  assert.equal(record.manifest_source_sha, RC_SHA, "Packaged source mismatch");
  assert.equal(record.staging_supabase_ref, STAGING_REF);
  assert.notEqual(record.staging_supabase_ref, PRODUCTION_REF);
  assert.equal(record.production_domain_attached, false);
  assert.equal(record.production_api_requests, 0);
  assert.equal(record.production_domain_links, 0);
  assert.equal(record.e2e_hosted_desktop_passed, true);
  assert.equal(record.e2e_hosted_mobile_passed, true);
  assert.equal(record.e2e_real_signup_email_verified, true);
  assert.equal(record.e2e_admin_aal2_passed, true);
  assert.equal(record.e2e_cross_role_denied, true);
  assert.equal(record.e2e_revoked_session_denied, true);
  assert.equal(record.e2e_2026_privacy_passed, true);
  assert.equal(record.rollback_staging_only_passed, true);
  assert.equal(record.owner_approved, true);
  assert.equal(record.production_release_approved, false);
  const url = new URL(record.preview_url);
  assert.equal(url.protocol, "https:");
  assert.equal(url.pathname, "/");
  assert.equal(url.search, "");
  assert.equal(url.hash, "");
  assert.match(url.hostname, /^[a-z0-9-]+\\.vercel\\.app$/);
  assert.notEqual(url.hostname, "baegu-index-test.vercel.app", "Preview cannot be a mutable shared alias");
  assert.notEqual(url.hostname, "beagu-index.vercel.app");
  assert.ok(typeof record.deployment_id === "string" && /^dpl_[a-zA-Z0-9]+$/.test(record.deployment_id));
  assert.ok(typeof record.github_actions_url === "string");
  const ci = new URL(record.github_actions_url);
  assert.equal(ci.hostname, "github.com");
  assert.match(ci.pathname, /^\\/noam0127\\/beagu-index\\/actions\\/runs\\/[0-9]+\\/?$/);
  return true;
}

if (process.argv[1] && import.meta.url === new URL("file://" + process.argv[1]).href) {
  if (process.argv.length !== 3) {
    process.stderr.write("Usage: node stage39-hosted-rc-evidence.mjs verified-evidence.json\\n");
    process.exitCode = 2;
  } else {
    try {
      validateStage39Evidence(JSON.parse(readFileSync(process.argv[2], "utf8")));
      console.log("PASS: Stage39 evidence structure and required release gates");
      console.log("NOTE: evidence authenticity must be independently verified against Vercel, CI and Supabase");
    } catch (err) {
      console.error("NO-GO:", err.message);
      process.exitCode = 1;
    }
  }
}
