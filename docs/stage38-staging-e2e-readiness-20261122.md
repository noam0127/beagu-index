# Stage38 independent staging E2E readiness — 2026-11-22

## Verified evidence
- Isolated Supabase project: `ycwuugggqbunlbwuzvbx`; production project `snvzwrexuqavnfvzgxqj` must not be modified.
- Latest direct read-only staging SQL counts: `public.schools=1` (fictional school only), `public.beagu_school_report_yearly=1` (2026 `PENDING`, not privacy-reviewed), `public.beagu_admin_accounts=0`, `public.beagu_admin_audit_events=0`, `auth.users=0`, `auth.sessions=0`. The earlier zero-school observation is superseded by the isolated synthetic fixture.
- Live staging admin Edge Function v2 denies anonymous and forged bearer requests with HTTP 401 (GitHub Actions run 45003564875).
- Forbidden browser origins are rejected with HTTP 403, local OPTIONS receives 204 (run 45003707914).
- Staging Auth `/auth/v1/health` and `/auth/v1/settings` both returned HTTP 200 with the project publishable API key (run 45007594357). Five CI checks for commit `133814b4` passed. A real Auth negative-path HTTP test passed in Actions run `45020219118`: nonexistent password credentials were rejected with HTTP 400 and forged bearer `/user` was rejected with HTTP 403; neither response exposed a session/token or user profile. All five workflows on commit `e5f64f0` succeeded.
- Real headless Chromium smoke against the **pinned, standalone RC served locally** passed for `/index.html`, `/admin.html`, `/admin-updates.html`, `/result.html`, and `/js/challenge.html` (run `45021003088`; commit `adf52a73`). All returned HTTP 200 and visible body text; no browser network requests to the production web domain or production Supabase host were observed. With empty staging Auth, the browser verified that a nonexistent credential fails login without exposing admin or MFA panels; the password field is cleared. On the release-center page, unauthenticated users see the login gate while the deployment dashboard is hidden and deployment/rollback controls remain disabled. The independent QA builder now disables the direct production link in `admin-updates.html`, removes two production canonical links, and fails closed on future production-site URL references. Packaging showed **zero** remaining production-site references and Chromium verified zero production-domain links on rendered pages (Actions run `45021270435`, source commit `6030d6b5`). These are verified **negative browser paths**, not successful real-account login, MFA, authorization, or a hosted preview test.
- All five CI checks for commit `6030d6b5` completed successfully (including pinned-RC packaging, real Chromium smoke, and negative authentication checks). The RC was **not deployed**.

## Staging security advisor review (2026-11-22)
- Supabase security advisor reported 32 `INFO` findings for RLS-enabled tables without policies, and two `WARN` findings for the same intended public `SECURITY DEFINER` performance telemetry entrypoint (`public.beagu_perf_record_v1`) exposed to `anon` and `authenticated`.
- Direct privilege inspection found **zero** policyless-RLS tables with SELECT/INSERT/UPDATE/DELETE grants for `anon` or `authenticated`. This is the intended service-only deny posture for these tables, not proof that all possible access paths are safe.
- `beagu_private.beagu_consume_perf_global_budget_v1()` is not directly executable by `anon` or `authenticated`. The public recorder validates page, operation and duration and uses a global 10,000-attempt hourly budget plus per-visitor/page/operation 20-second sample deduplication. **Remaining risk**: a hostile actor can exhaust the shared hourly quota via otherwise valid calls; the advisor warning is not waived as a universal security guarantee.
- Actual isolated staging SQL regression `tests/stage38-staging-advisor-security-regression.sql` ran successfully under a transaction and impersonated `anon` for the negative calls: invalid page, duration and page/operation pairing all returned `false`. No production changes; the script rolls back.
- References: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy and https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable

## Release blocker
**BLOCKED_NO_STAGING_E2E_AUTH_SESSIONS_AND_HOSTED_PREVIEW**: the staging database contains one fictional school but has zero genuine Auth users, sessions and admin accounts. Local Chromium smoke succeeded but cannot prove valid admin MFA login, member moderation or real hosted browser E2E. The independently packaged QA copy now has no production-site links; authenticated MFA E2E and an independently hosted browser check are still required.

## Safe unblock procedure
1. Keep production Supabase, production GitHub branch and production website unchanged. Do not copy production personal data, authentication secrets or member records.
2. The non-identifying fictional school and pending report already exist. Provision staging-only test users (one owner MFA AAL2, one ordinary member, one non-MFA admin) through approved Supabase Auth methods, not direct `auth.users` / `auth.sessions` SQL. Ensure IDs and credentials are test-only.
3. Validate staging RLS and MFA with real signed sessions; test member list, owner-only moderation, intent-first audit record, failure recovery, and postit school context. Verify no audit/member data is exposed to anonymous clients.
4. Provide an independently hosted review URL for the pinned RC SHA; run actual browser tests with isolated cookies and network checks that no production Supabase reference is used.
5. Remove or disable test users and synthetic fixtures after testing; preserve redacted evidence. No release approval until E2E succeeds.

## Status
Stage38 remains IN PROGRESS. CI PASS does not mean E2E PASS or production readiness.
