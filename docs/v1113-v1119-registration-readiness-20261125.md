# v1.11.3–v1.11.9 isolated candidate review, 2026-11-25 KST
Status: PARTIAL_VERIFICATION / NOT_REGISTERABLE. No production DB, release queue, Pages or Vercel changes. Account and integrated control tower remain deferred.
 
## Source lineage (cumulative; not independently approved releases)
- v1.11.3: 542dd16df4127b1456b034ff968592539c4c2da2
- v1.11.5: 5ca5149404d7e109f33d37db6c01a30cdc12d696
- v1.11.6: 206d40947a0c62f755a30afc3e891599808be9dc
- v1.11.7: 67937dfac2a6ff01af650061bdafc2c230c16936
- v1.11.8: ba5b23e1435c330d2482acd137035de4b0d6bb1c
- v1.11.9: cea45d0af5221bb3b4316484b4a106d890406096
- Regression correction: 0e794987030af757d6084a76210e5b53c8306a8d

## Observed evidence
- Exact Git blob bad55c3290d094fed6cba44058df3811d00ae90c (arcade-leaderboard-v1.js) executed in real Chromium 144.0.7559.96, isolated DOM, mocked server and clipboard, no external network. 320/390/1440 CSS px x two games x ten checks = 60 pass. Actual PNG downloads 900x500; default school-name omission and explicit opt-in, medal display, reset, rejected, admin and stale results.
- Exact Git blob ebf33706f36ebe05727cd0ab7e49c4f5f5c59297 (arcade-history-v1.js) executed in real Chromium with fixture DOM and mocked fetch/history URL. 1–100 ordinal positions, page boundaries, filter reset, invalid school link exclusion passed.
- Fourteen common navigation pages: exact labels and routes pass. Both game HTML files normalize exactly to 497682f baseline after reversing only approved UI changes; prior auth/physics logic preserved by source comparison.
- Earlier syntax and mock tests passed. Corrected stale regression expectations in this branch; full official suite has NOT run. Browser fixture is not a full site/browser integration test. No actual clipboard permission, Safari, real API or official CI verification.

## Registration gates
1. Run full offline Chromium regression on exact candidate tree, including game start/pause/resume, item graphics, Lv0/1/2, search/compare, postit nickname/API compatibility.
2. Preserve deferred permanent aliases and cumulative school/participation medals; do not claim school-wide aggregate rankings. Check current approved production SHA and backend compatibility without writing to production.
3. Existing release-info.json and release-candidate.json still identify v1.11.4. Do not use them to register this branch as a completed release. Select the intended release scope and fix candidate-only metadata and version catalog after exact validation; do not change the operational catalog or queue without authorization.
4. Pin exact verified SHA, independently validate production-base diff and rollback SHA. No automatic deploy; only owner-approved admin action in a later authorized step.
5. Missing official CI and full-browser coverage remain release blockers. No version declared complete or registered.
