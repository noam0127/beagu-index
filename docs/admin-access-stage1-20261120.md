# 2026-11-20: Administrator authentication, stage 1

## Investigation / current facts

- Static GitHub Pages-style frontend; shared public Supabase client from js/supabase-config.js.
- Lv.1/Lv.2 uses the separate beagu-level-api and beagu_level_sessions / challenge referral structures, not auth.users.
- auth.users count during inspection: 0 (NO administrator account exists).
- Counts at inspection: private visits 2,711; school_search_events 467; arcade_game_sessions 227; arcade_game_scores 18; school_interest_daily 0; referral_profiles 0.
- User game records belong to arcade-leaderboard Edge Function (not to Auth).
- The visual novel currently uses pure functional state transitions and has no proven persistent gameplay analytics.
- No historical series should be invented. Event counts are not equivalent to distinct visitors.

## Stage 1 implementation

- public.beagu_admin_accounts: service-role-only allowlist (auth.users UUID, role, enabled).
- public.beagu_admin_audit_events: service-role-only security audit log. RLS, no client access, excludes passwords, tokens and IP.
- beagu-admin-access Edge Function: calls Supabase Auth getUser on the bearer JWT before checking the allowlist. Only status (AAL1 onboarding, no data) works before MFA. Privileged verify requires AAL2 and writes audit.
- admin.html: no link in public navigation. Uses signInWithPassword, Supabase Auth TOTP enrollment and challengeAndVerify, then server verification. Explicitly does not load site visit telemetry.
- Placeholders on dashboard are labeled as uncollected/unconnected, not 0.

## Manual account bootstrap (required; do not expose these details in GitHub)

1. In the Supabase dashboard for project snvzwrexuqavnfvzgxqj create/invite a dedicated confirmed Auth user with a strong unique password. Use trusted dashboard controls only. Do NOT permit self-signup to grant admin.
2. Copy that Auth user's UUID from the Auth dashboard. In the trusted SQL editor execute with that actual UUID:
   INSERT INTO public.beagu_admin_accounts (user_id,role,enabled)
   VALUES ('<actual-auth-user-uuid>'::uuid,'owner',true)
   ON CONFLICT(user_id) DO UPDATE SET enabled=true;
3. Visit /admin.html, sign in using that Auth account, enroll TOTP using a private authenticator app, enter its 6-digit code; subsequent sessions must verify MFA again.
4. Validate a second unlisted Auth account is denied. Never grant admin based on a frontend flag or user_metadata.

## Release gates and limitations

- The public dashboard page HTML is not a security boundary. All future admin data APIs must run this same bearer-user + server allowlist + AAL2 check.
- Stage 1 does not provide actual dashboard metric retrieval. Do not turn placeholder into a numeric 0.
- Admin suppression has been added at the **BEFORE INSERT** stage for visits and school search events. The arcade Edge Function v18 also avoids session and score writes when a valid admin Auth JWT is sent. Do not remove Auth bearer forwarding from the game clients.
- **Not complete**: challenge participation and future visual-novel/event collectors, any unauthenticated traffic, manual user actions outside Auth, and the full statistics dashboard still require separate treatment. Do not assert a site-wide guarantee until those paths are covered and a live admin AAL2 session is tested.
- A browser using no Auth token is indistinguishable from an unauthenticated visitor. Every future telemetry endpoint must receive a verified user bearer token when an administrator is signed in; never trust a client-side isAdmin flag.
- Password login failures are registered by Supabase Auth's own audit subsystem; this application stage audits server-verified administrator access.
- Node regression tests are static checks. Actual MFA enrollment and authorized E2E await creation of a real admin identity.
