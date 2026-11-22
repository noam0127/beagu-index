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

## Implementation update — 2026-11-23
- The school homepage catalogue is stored at `games/nangam-schoolband-v08/charts/school-homepages.v1.json` on `schoolband-playtest` only.
- Read-only source: 6,335 operating elementary schools; 6,306 nonblank homepage values. 6,288 usable external HTTP(S) links keyed by `school_id` after syntax/scheme/hostname checks; 18 incomplete or unsupported links excluded. This does **not** prove site ownership, site availability, or the existence of an anthem.
- The game loads the catalogue as a **same-origin static JSON file** and only opens a selected school's recorded homepage after a click. Search links are narrowed to the recorded hostname when available; fallback is school-name search. No crawling, automatic audio extraction, remote-code execution or third-party API.
- Unknown/mismatched school IDs cannot borrow another school's link. Missing links are hidden and school-name search remains available; original creative volleyball practice remains playable.
- New static/data/browser test: `scripts/test-schoolband-stage021-homepages.cjs`, included in `.github/workflows/schoolband-stage021.yml`. Source syntax and 13 static contract checks passed in connector-side analysis; full Node/Playwright + GitHub Actions results not yet verified.
- User restrictions: **no requests for copyright permissions, no paid APIs or purchases, and no subjective playfeel or audio checking.** Real school anthem game playback stays disabled unless already-cleared, properly registered song assets exist; no workaround violating copyright.
- No writes to production Supabase / `main` / `baeguindex.com`.
