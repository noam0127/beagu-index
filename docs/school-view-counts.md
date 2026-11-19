# 학교별 조회수 (2026-11-20)
- Displays a small eye counter on Lv.0/Lv.1 search cards and the public school report.
- Meaning: one anonymous browser per school per Asia/Seoul calendar day after actual `detail_viewed`. Search-result impressions and searches do not count.
- Starts at installation; older school-search telemetry events are not backfilled, since legacy events cannot reliably deduplicate repeat browsers or identify tests/admin actions.
- Server keeps no raw visitor UUID, IP, name, email, or search query in the new view tables. Private daily rows contain salted SHA-256 pseudonyms; the public table contains only counts. All tables have RLS and no anon direct table access.
- RPCs: `beagu_record_school_view` validates a recent saved `detail_viewed` action and only increments a distinct daily visitor; `beagu_school_view_counts` returns at most 40 aggregate counts.
- Admin exclusion is ready for verified Supabase Auth app_metadata admin roles and a private owner-browser exclusion digest. No admin identity or browser has been registered here; until admin login/registration exists, unauthenticated operator browsing still counts.
- Network failures do not show a fictitious value. The counter updates only on confirmed server results.
