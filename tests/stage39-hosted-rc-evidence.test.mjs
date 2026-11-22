import test from "node:test";
import assert from "node:assert/strict";
import {validateStage39Evidence, RC_SHA, TEST_PROJECT, STAGING_REF} from "../scripts/release-manager/stage39-hosted-rc-evidence.mjs";

const valid = () => ({
  project_id: TEST_PROJECT, target: "preview", state: "READY",
  source_sha: RC_SHA, manifest_source_sha: RC_SHA,
  staging_supabase_ref: STAGING_REF,
  production_domain_attached: false,
  production_api_requests: 0, production_domain_links: 0,
  e2e_hosted_desktop_passed: true, e2e_hosted_mobile_passed: true,
  e2e_real_signup_email_verified: true, e2e_admin_aal2_passed: true,
  e2e_cross_role_denied: true, e2e_revoked_session_denied: true,
  e2e_2026_privacy_passed: true, rollback_staging_only_passed: true,
  owner_approved: true, production_release_approved: false,
  preview_url: "https://baegu-test-immutable-42.vercel.app/",
  deployment_id: "dpl_TESTabcdef123",
  github_actions_url: "https://github.com/noam0127/beagu-index/actions/runs/12345"
});

test("valid synthetic receipt satisfies shape (not a live approval)", () => {
  assert.equal(validateStage39Evidence(valid()), true);
});
for (const [field, value] of [
  ["project_id", "prj_wrong"], ["target", "production"],
  ["source_sha", "d746bf18f4cadce77f516243939b1b5c352f8f29"],
  ["manifest_source_sha", "x"], ["staging_supabase_ref", "snvzwrexuqavnfvzgxqj"],
  ["production_domain_attached", true], ["production_api_requests", 1],
  ["e2e_admin_aal2_passed", false], ["e2e_real_signup_email_verified", false],
  ["e2e_2026_privacy_passed", false], ["owner_approved", false],
  ["production_release_approved", true],
  ["preview_url", "https://baeguindex.com/"],
  ["github_actions_url", "https://example.com/not-ci"]
]) {
  test("fail closed: " + field, () => {
    assert.throws(() => validateStage39Evidence({...valid(), [field]: value}));
  });
}
