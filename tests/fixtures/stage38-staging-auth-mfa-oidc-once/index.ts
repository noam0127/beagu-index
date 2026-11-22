// STAGE38 STAGING ONLY: temporary end-to-end Supabase Auth (password -> real TOTP -> AAL2).
// The endpoint is callable ONLY with a verified GitHub Actions OIDC token from one
// branch, one workflow, and one audience. No production GitHub/Supabase access.
// No secrets, credentials, TOTP codes or JWTs are logged or returned.
// After the one-time CI verification, replace this function with an HTTP 410 stub.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { createRemoteJWKSet, jwtVerify } from "https://esm.sh/jose@5.10.0";

const PROJECT = "ycwuugggqbunlbwuzvbx";
const PROD_REF = "snvzwrexuqavnfvzgxqj";
const AUD = "beagu-stage38-e2e-test";
const REPO = "noam0127/beagu-index";
const REF = "refs/heads/hotfix/v1.1.0-preview-backend-isolation";
const WORKFLOW = REPO + "/.github/workflows/stage38-staging-member-live-contract.yml@" + REF;
const origin = "http://localhost:8000";
const jwks = createRemoteJWKSet(new URL("https://token.actions.githubusercontent.com/.well-known/jwks"));
const json = (value: object, status: number) =>
  new Response(JSON.stringify(value), {
    status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
const assert = (ok: unknown, label: string): asserts ok => {
  if (!ok) throw new Error(label);
};
function claims(token: string): Record<string, unknown> {
  const s = token.split(".")[1] || "";
  return JSON.parse(atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=")));
}
function randomPassword(): string {
  const value = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(value, b => b.toString(16).padStart(2, "0")).join("");
}
function base32Decode(secret: string): Uint8Array {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bytes: number[] = [];
  let buffer = 0, bits = 0;
  for (const char of secret.toUpperCase().replace(/\s|=/g, "")) {
    const value = alphabet.indexOf(char);
    if (value < 0) throw Error("invalid_totp_secret_encoding");
    buffer = (buffer << 5) | value;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >>> bits) & 255);
    }
  }
  return new Uint8Array(bytes);
}
async function totpCode(secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", base32Decode(secret), {
    name: "HMAC", hash: "SHA-1",
  }, false, ["sign"]);
  const counter = new ArrayBuffer(8);
  new DataView(counter).setBigUint64(0, BigInt(Math.floor(Date.now() / 30_000)), false);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, counter));
  const offset = mac[mac.length - 1] & 15;
  const value = ((mac[offset] & 127) << 24) | ((mac[offset+1] & 255) << 16) |
    ((mac[offset+2] & 255) << 8) | (mac[offset+3] & 255);
  return String(value % 1000000).padStart(6, "0");
}
async function callEndpoint(url: string, jwt: string, body: Record<string, unknown>) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Origin: origin,
      Authorization: "Bearer " + jwt,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(14000),
  });
  const parsed: Record<string, unknown> = await res.json();
  return { status: res.status, body: parsed };
}
Deno.serve(async (req: Request) => {
  // No CORS/preflight surface; this endpoint is never browser accessible.
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (req.headers.has("Origin")) return json({ error: "browser_request_not_allowed" }, 403);
  const bearer = req.headers.get("Authorization")?.match(/^Bearer ([A-Za-z0-9._-]+)$/)?.[1];
  if (!bearer) return json({ error: "not_authorized" }, 401);
  try {
    const { payload } = await jwtVerify(bearer, jwks, {
      issuer: "https://token.actions.githubusercontent.com",
      audience: AUD,
    });
    const trustedBranchPush = payload.ref === REF &&
      payload.workflow_ref === WORKFLOW && payload.event_name === "push";
    // PR #244 is the current same-repository staging integration branch.
    const trustedSameRepoPR = payload.event_name === "pull_request" &&
      payload.ref === "refs/pull/244/merge" &&
      payload.workflow_ref === REPO +
        "/.github/workflows/stage38-staging-member-live-contract.yml@refs/pull/244/merge" &&
      payload.head_ref === "hotfix/v1.1.0-preview-backend-isolation" &&
      payload.base_ref === "main";
    if (payload.repository !== REPO || !(trustedBranchPush || trustedSameRepoPR)) {
      return json({ error: "untrusted_workflow" }, 403);
    }
  } catch { return json({ error: "untrusted_oidc" }, 403); }

  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const clientKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (!url.includes(PROJECT) || url.includes(PROD_REF) || !serviceKey || !clientKey) {
    return json({ error: "not_isolated_staging" }, 503);
  }

  const service = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const client = createClient(url, clientKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const checks: string[] = [];
  let id: string | undefined;
  let created = false, cleaned = false;
  let resultError: string | null = null;
  let accountClean = false, authClean = false;
  try {
    // The starting point must be empty. Never interact with existing real users.
    const initial = await service.from("beagu_admin_accounts").select("user_id", { count: "exact", head: true });
    assert(!initial.error && initial.count === 0, "unexpected_staging_admin_accounts");
    const email = "stage38-" + crypto.randomUUID().replaceAll("-", "") + "@example.invalid";
    const password = randomPassword();
    const createdUser = await service.auth.admin.createUser({
      email, password, email_confirm: true,
      app_metadata: { stage38_synthetic: true },
    });
    assert(!createdUser.error && !!createdUser.data.user?.id, "create_user_failed");
    id = createdUser.data.user!.id;
    created = true;
    checks.push("auth_admin_create_confirmed");

    const inserted = await service.from("beagu_admin_accounts")
      .insert({ user_id: id, role: "owner", enabled: true });
    assert(!inserted.error, "admin_owner_fixture_failed");
    checks.push("isolated_owner_allowlist");

    const login = await client.auth.signInWithPassword({ email, password });
    assert(!login.error && !!login.data.session?.access_token, "password_login_failed");
    const aal1 = login.data.session!.access_token;
    const claims1 = claims(aal1);
    assert(claims1.sub === id && claims1.aal === "aal1" && !!claims1.session_id, "aal1_claims_invalid");
    checks.push("real_password_login_aal1");

    const gateUrl = url + "/functions/v1/beagu-admin-access";
    const dashUrl = url + "/functions/v1/beagu-admin-dashboard-v1";
    const releaseUrl = url + "/functions/v1/beagu-release-manager-v1";
    const initialVerify = await callEndpoint(gateUrl, aal1, { action: "verify" });
    assert(initialVerify.status === 403 && initialVerify.body.error === "mfa_required", "aal1_gate_not_denied");
    const initialDash = await callEndpoint(dashUrl, aal1, { action: "dashboard", period: "7d" });
    assert(initialDash.status === 403 && initialDash.body.error === "mfa_required", "aal1_dashboard_not_denied");
    const initialRelease = await callEndpoint(releaseUrl, aal1, { action: "status" });
    assert(initialRelease.status === 403 && initialRelease.body.error === "admin_mfa_required", "aal1_release_not_denied");
    checks.push("aal1_privileged_actions_denied");

    const enrolled = await client.auth.mfa.enroll({ factorType: "totp", friendlyName: "stage38-private-test" });
    assert(!enrolled.error && !!enrolled.data?.id && !!enrolled.data?.totp?.secret, "totp_enroll_failed");
    const challenge = await client.auth.mfa.challenge({ factorId: enrolled.data!.id });
    assert(!challenge.error && !!challenge.data?.id, "totp_challenge_failed");
    // Secret remains only in the Edge Function process memory; no QR or OTP is output.
    const code = await totpCode(enrolled.data!.totp!.secret!);
    const verified = await client.auth.mfa.verify({
      factorId: enrolled.data!.id, challengeId: challenge.data!.id, code,
    });
    assert(!verified.error, "totp_verify_failed");
    const sessionResponse = await client.auth.getSession();
    const aal2 = (verified.data as { access_token?: string })?.access_token ||
      sessionResponse.data.session?.access_token || "";
    assert(!!aal2, "aal2_token_missing");
    const claims2 = claims(aal2);
    assert(claims2.sub === id && claims2.aal === "aal2" && !!claims2.session_id, "aal2_claims_invalid");
    checks.push("real_totp_challenge_verified_aal2");

    const adminGate = await callEndpoint(gateUrl, aal2, { action: "verify" });
    assert(adminGate.status === 200 && adminGate.body.permitted === true &&
      adminGate.body.mfa_verified === true && adminGate.body.role === "owner", "aal2_admin_gate_failed");
    checks.push("aal2_owner_access");

    const dashboard = await callEndpoint(dashUrl, aal2, { action: "dashboard", period: "7d" });
    const analytics = dashboard.body.analytics as Record<string, unknown> | undefined;
    assert(dashboard.status === 200 && analytics?.period === "7d" &&
      typeof analytics.site === "object", "aal2_dashboard_failed");
    checks.push("aal2_dashboard_aggregation");

    const readRelease = await callEndpoint(releaseUrl, aal2, { action: "status" });
    assert(readRelease.status === 200 &&
      readRelease.body.release_actions_enabled === false &&
      readRelease.body.mode === "isolated_preview_read_only", "aal2_release_status_failed");
    checks.push("aal2_readonly_release_status");

    const forbidden = await callEndpoint(releaseUrl, aal2, { action: "stage_apply" });
    assert(forbidden.status === 403 && forbidden.body.error === "staging_read_only", "release_write_not_denied");
    const forbiddenWorker = await callEndpoint(releaseUrl, aal2, { action: "worker_next" });
    assert(forbiddenWorker.status === 403 && forbiddenWorker.body.error === "staging_read_only", "release_worker_not_denied");
    checks.push("aal2_release_writes_and_worker_denied");

    const jobs = await service.from("beagu_site_release_jobs_v1").select("id", { head: true, count: "exact" });
    const history = await service.from("beagu_site_release_history_v1").select("id", { head: true, count: "exact" });
    assert(!jobs.error && jobs.count === 0 && !history.error && history.count === 0, "release_side_effect_detected");
    checks.push("release_side_effects_zero");
  } catch (err) {
    // Error codes only. NEVER include access tokens, credentials or TOTP secrets in logs.
    resultError = err instanceof Error ? err.message.slice(0, 75) : "unknown_test_error";
  } finally {
    if (id) {
      // Admin audits intentionally remain append-only, and contain only synthetic UUIDs.
      const accountResult = await service.from("beagu_admin_accounts").delete().eq("user_id", id);
      accountClean = !accountResult.error;
      const userResult = await service.auth.admin.deleteUser(id);
      authClean = !userResult.error;
    }
    cleaned = created && accountClean && authClean;
  }
  return json({
    test: "stage38_staging_real_auth_mfa",
    passed: resultError === null && cleaned,
    checks,
    cleanup: { created, account_removed: accountClean, auth_user_removed: authClean },
    error_code: resultError,
    note: "Synthetic-only test. No credentials or personal data. Audit entries are append-only.",
  }, resultError === null && cleaned ? 200 : 503);
});
