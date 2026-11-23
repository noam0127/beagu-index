# Independent staging cutover checklist

- Current approved production baseline: 36c68c8394a77a94541a2ad04a83db7242639c0c.
- Independent test site: https://baegu-index-test.vercel.app/ (already directly deployed and HTTP checked; not yet an admin-approved release).
- Configure `BEAGU_STAGE_VERCEL_TOKEN` and `BEAGU_STAGE_VERCEL_BYPASS` in GitHub Actions secrets for the existing protected deployment environment. Never put values in source, chat, or logs.
- Review and test controller against isolated fixtures first. Do not activate on main until checks pass and owner confirms production admin-only rollout.
- Verify a real owner MFA stage-sync request, matching immutable commit and Vercel canonical alias, and a signed completion/history entry. Until then legacy preview is retained.
- Verify browser behavior (search, levels, games, administrator, test-only submission) using synthetic accounts/data. A 200 response alone does not establish functional parity.
- After successful cutover, remove legacy preview on a separately approved Pages publish. Do not alter the production business data or roll back the public production commit.
