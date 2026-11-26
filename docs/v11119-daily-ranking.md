# v1.11.19 코트 다듬기 — server activation deferred

**Release scope:** front-end only. The ranking markup is hidden, script loading disabled, and the script itself refuses to start on a hidden root. Region requests use the existing TOP5 endpoint only. Keep all TOP10 SQL and public ranking API code as inactive development candidates for v1.11.20. Do not deploy backend code or run candidate SQL. Admin registration requires clean-release-validation success, not backend activation.

## Deferred ranking design
- Base: v1.11.18.1 / 160f6fa6a419f4b4ab878200a25cb42dae35c467. No production writes or deployment.
- Home: under today's school; show all ten immediately at Lv0/Lv1/Lv2. Explicit owner-requested exception: public fixed ranking list (school identity, region, rank, approved percentile) only. Lv0 detail links to public report; Lv1/Lv2 to unified verified search; existing detail and arbitrary percentile API permissions unchanged. Use fixed Lv1-approved ranking snapshot only, not caller-supplied IDs/levels.
- Backend: daily private snapshot, source_version and percentile_method explicitly pinned to the reviewed verticality (100−VI13) PERCENT_RANK pipeline. Do not enable unverified, legacy-direction, or withheld candidates. No raw survey, free text, respondent count, Q31/Q51, private candidates, or public static ranking JSON.
- Competition rank by stored approved percentile, deterministic school ID tie break; exactly 10 rows at most (ties at the cutoff share the rank but may be truncated). The snapshot does not recalculate percentile on a subset; it sorts already approved national percentiles. Raw survey sync and exact 572-school recalculation remain upstream work.
- The fixed public ranking action revalidates each score using the Lv1 approval gate; existing signed API still checks session for every other protected action using the same school percentile projection (edited precedence, holds, revocations). If any score changes, fail closed, not stale. Snapshot failure leaves prior transaction intact; prior date shown only if current approval revalidation succeeds.
- Before operational activation: confirm corrected verticality source and actual source_version/method; verify scope and decisions per tier, install candidate SQL in an isolated environment first, verify production backend compatibility, then separately authorize DB installation, singleton configuration, initial refresh, and pg_cron scheduling at 15:00 UTC (00:00 KST). Never run cron SQL during CI or apply unapproved rows. No Vercel.
- Use SQL cron timezone UTC (verify cron.timezone). Source synchronization must complete before the job; upstream changes after midnight appear next day. Home polls at five minutes/visibility; level changes repaint links and at KST midnight; no guarantee exactly on the second if the scheduler or source is delayed.
- No ranking activation until full CI and backend installation/activation are separately authorized. Rollback: disable cron job, remove/disable config, restore previous API and Pages candidate. Preserve all prior survey data and approval records.

## Court tidy scope
- Report-only school detail UI; preserve existing server correction authorization and records. Rising school TOP10; region TOP5 only in v1.11.19; TOP10 SQL preserved for a separately authorized later release.
- Official facts 2×2, protected price separate; matching heart/eye placement and geometry.
- BGM and SFX share one per-game AudioContext unlocked during initiating gesture. Physical iOS/Android audio output still requires device verification.
