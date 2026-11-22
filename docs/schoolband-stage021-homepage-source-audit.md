# Schoolband 021 — existing school homepage source audit

2026-11-23, read-only inspection. No production data or application updated.

## Verified sources
- Google Drive: `2024 배구지수 편집본`, spreadsheet ID `1DVZs-L8rV7SOr4pbZ4bVm4ryHGFGZuDpkvhz-QqUmH4`, tab `학교별자료` (6805 rows, 90 columns). Current linked content contains `#REF!`; rows 5-12 and 100-103 returned no values. Do NOT claim homepage column was verified in this workbook.
- Supabase project `snvzwrexuqavnfvzgxqj`, public `schools` table has a `homepage` column (verified via information_schema).
- Read-only count for schools WHERE `school_kind='초등학교' AND status='운영'`: total 6335, nonempty homepage 6306, homepage starting http(s) 5387. Missing 29; 919 nonempty homepage values need scheme/pattern verification. Do not assume website uptime/ownership from URL text alone.

## Stage 021 source priority
1. User-selected school_id → server-validated `schools.homepage` record; normalize and validate URL on a READ-ONLY backend. Keep exact school identity and link evidence.
2. Visit official site and find '학교소개/학교상징/교가' with school-specific navigation, without blindly scraping downloads.
3. If homepage missing/unreachable, use sanctioned school information API and a search link as fallback.
4. Candidate media title, video ID and source URL should remain marked unreviewed until reviewed for exact school and availability.
5. Music transcription and game playback remain disabled until separate rights and chart QA (022-023).

## Architecture guardrails
- Current `schoolband-school-read-v1` public Edge Function deliberately whitelists school_id/name/region/tier; it does not return homepage. Do not change this production function during trial development.
- Provide a separate reviewed, allowlisted school-homepage read path (or generate a public sanitized build-time catalogue in the playtest branch), with no private survey/identity fields.
- Avoid exposing internal Supabase secrets or uploading private 2024 workbook. Only the verified public homepage strings are potential game metadata.
- Tests must cover blank homepage, missing URI scheme, misleading/nonofficial domains, redirects, duplicates and mismatched school ID.
