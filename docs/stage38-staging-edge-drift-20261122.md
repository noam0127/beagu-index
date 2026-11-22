# Stage 38 — Staging Edge Function drift and safe handoff (2026-11-22)

Project: `ycwuugggqbunlbwuzvbx` (isolated staging only). Branch: `hotfix/v1.1.0-preview-backend-isolation`.

## Verified live staging function inventory
- `beagu-admin-members-v1`: ACTIVE, version 2, `verify_jwt=false`. This is **not by itself a security failure** because its handler performs `db.auth.getUser(token)`, AAL2 claims, and the live MFA-session RPC; actual HTTP tests are still required.
- `beagu-level-api`: ACTIVE, version 5.
- `beagu-postit-api-v1`: ACTIVE, version 4.
- `beagu-stage38-release-guard`: ACTIVE, version 2, returns HTTP 410 (disabled after earlier QA).

## Discovered drift requiring reconciliation before redeploy
1. GitHub `supabase/functions/beagu-admin-members-v1/index.ts` permits production origins `https://baeguindex.com` and `https://www.baeguindex.com`.
2. The **currently deployed staging** `beagu-admin-members-v1` permits only `http://localhost:8000` and `http://127.0.0.1:8000`.
3. The deployed staging function additionally imports `./_shared/moderation-audit.mjs`, which persists an **intent audit before** the Supabase Auth moderation action, followed by success/error phase auditing. The current GitHub index source does not import that helper and audits only after updating the Auth user.
4. Replacing the deployed staging function with the GitHub index alone would therefore **regress moderation audit durability** and alter its origin allowlist. DO NOT perform that replacement without first reconciling both source files and tests.
5. A browser opened at the production domain cannot be used as a staging administrator against this staging function's local-only CORS policy. Prefer isolated localhost preview, not a production-domain CORS bypass.

## Confirmed DB tests
- Six critical paths have all required database objects (`METADATA_PRESENT_REQUIRES_E2E`), **not** E2E approval.
- School visibility tests pass with synthetic, rolled-back fixtures.
- Admin MFA/audit/SMS negative-security SQL tests pass.
- The school catalog is empty; `BLOCKED_NO_STAGING_SCHOOL_DATA` is the correct state.
- No real administrator MFA/browser E2E and no authenticated HTTP API E2E were performed during this check.

## Next safe implementation
- Reconcile the deployed `index.ts` and `_shared/moderation-audit.mjs` into a reviewable staging source snapshot; add regression tests for intent-first audit and staging-only CORS.
- Validate anonymous/invalid JWT and disallowed-origin responses via HTTP against the staging Edge URL, without credentials.
- Use an isolated local preview for authenticated end-to-end testing; never import production credentials, production user rows, or respondent records.
- Keep production, main, and the pinned RC unchanged until approval.
