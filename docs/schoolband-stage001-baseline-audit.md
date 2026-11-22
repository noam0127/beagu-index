# 『난감한 스쿨밴드』 001/030 — 기준 상태·격리·결함 감사

작성일: 2026-11-22 (KST). 출처: GitHub 저장소 실조회 및 Supabase Edge Function 읽기 전용 조회. 이 문서는 실기 검증이 아니라 기준 상태 조사이다.

## 1. 출처 및 버전 고정

- repository: noam0127/beagu-index (public, push permission verified)
- default branch: main, HEAD (조회 시점) \`0ca283cd09cd63520d9ce8e37463bed8d2f65541\`
- separate branch: schoolband-playtest, HEAD (감사 시작 시점) \`582fc4fb3f92e93c6841209a864dfb3377b0b73f\`
- latest game found on test branch: \`games/nangam-schoolband-v08/index.html\` (blob \`88d5ed2089498fc67c7e951a2af8cf1b6fb01635\`; 31,188 characters returned by GitHub API)
- \`games/nangam-schoolband-v08/index.html\` on main: 404 NOT_FOUND (test-only file)
- earlier dirs present on test branch: \`games/nangam-schoolband\`, v05, v06, v07.
- CNAME on both branches: \`baeguindex.com\`; identical blob \`b2ef85d5242bbc72dbc57792cd511771fa8059d9\`. CNAME alone does not prove two independent sites.
- GitHub Pages legacy direct main-push deploy workflow is explicitly disabled; administration release controller owns production releases.

## 2. Delivery chain and access status

1. Source: \`schoolband-playtest/games/nangam-schoolband-v08/index.html\`.
2. RawGitHack candidate: https://raw.githack.com/noam0127/beagu-index/schoolband-playtest/games/nangam-schoolband-v08/index.html
3. Supabase function: \`schoolband-playtest-v02\`, ACTIVE version 6, \`verify_jwt=false\`, observed source emits HTTP 302 Location to the exact RawGitHack candidate, with no-store and no-referrer. It does not itself serve \`text/html\`.
4. Read API: \`schoolband-school-read-v1\`, ACTIVE version 1, \`verify_jwt=false\`; GET/OPTIONS public CORS proxy to \`arcade-leaderboard\`. Query inputs \`schools\` / \`school_id\` are separated. Search output is capped at 12 results; detail output is reduced to school_id, school_name, region, difficulty, eligible, source_year.
5. Public website: https://baeguindex.com (separate production domain).
6. The tool-access environment could not reach RawGitHack, Supabase function URL or baeguindex.com at HTTP level. The web fetcher returned inaccessible/cache miss; local requests failed DNS/connection. **Live HTTP status, final content-type, browser layout, sound and device playback were NOT verified.** Listing an ACTIVE function is not a live HTTP test.

## 3. Invariant and baseline static tests

- Four instruments: guitar \`D F J K\` = 4, drums \`D F J K\` = 4, bass \`F Space J\` = 3, keys \`A S D J K\` = 5.
- Five tiers: easy / normal / hard / very_hard / extreme. Public tier thresholds 20/40/60/80 belong to the upstream source, not independently validated at this stage; unevaluated schools use explicitly labelled NORMAL practice.
- A parse of the actual v0.8 \`PARTS\` table found every lane represented at every tier: **20/20 combinations PASS (static)**. Note counts **per bar**:
  - guitar: 5, 7, 9, 11, 18.
  - drums: 4, 6, 9, 14, 21.
  - bass: 4, 6, 8, 10, 16.
  - keys: 5, 7, 8, 10, 18.
- Self-composed demo melody \`MELODY\` has **28 notes** and 8 chord roots in an 8-bar / 108 BPM song. 16th-note spacing = 60/108/4 = 0.13889 seconds; expected song duration ≈17.78 seconds.
- Canvas is 380 × 365 internal pixels; note rectangle uses \`y-12\` and height \`24\`. CSS scales canvas, so perceived CSS pixel thickness on narrow screens is smaller: see step 003.
- Timing uses \`AudioContext.currentTime\` for note scheduling, judgement and song position. Browser/frame-rate independence is NOT yet dynamically verified.
- The game currently packages CSS and JavaScript inline with one HTML document; there are no external script/style link dependencies. Runtime dependencies: read API, Web Audio, browser Canvas/Pointer Events, localStorage; optional vibration.

## 4. Reproducible risks and defects (source analysis, not falsely presented as observed device failures)

| ID | Severity | Evidence / reproduction instruction | Action stage |
| --- | --- | --- | --- |
| SB-001 | HIGH | \`finish(true)\` clears timers but does not track/stop already started or future-scheduled oscillator/buffer nodes. Stop while music sustains, listen for tail; potential ghost sound. | 012 |
| SB-002 | HIGH | \`pagehide\` handler exists; no \`visibilitychange\` handler or suspend/resume policy. Background/tab switch can desync AudioContext and game progress. | 007, 012 |
| SB-003 | MEDIUM | Reduced motion CSS sets \`.judgement.animate\` opacity 0.95 while disabling animation; no timeout resets it. A hit may leave judgement visible indefinitely. | 004 |
| SB-004 | MEDIUM | Local best-score key includes school/instrument/tier but not song/chart version; chart revisions can make comparisons invalid. | 024 |
| SB-005 | MEDIUM | 24 canvas pixels shrink with CSS canvas scale; check 320 px viewport, dense five-lane play and 108 BPM 16th notes with visual captures. | 003, 017 |
| SB-006 | HIGH (validation gate) | Live RawGitHack HTML MIME / redirect / autoplay and PC/Android touch have not been confirmed. No working production or staging URL should be claimed from source alone. | 001 gate, 029 |

## 5. Seven independent role-based AI reviews

| Role | Issue → proposal | Validation done | Residual |
| --- | --- | --- | --- |
| Rhythm game | Timing/fairness not dynamic → unit tests for boundaries and every tier | Static 20/20 lane coverage | Input timing and collisions untested |
| Audio engine | Scheduled nodes survive stop → registries and explicit release; use audio clock | Source: scheduler / ctx.currentTime checked | Heard audio and cancel tests pending |
| Direction/FX | Narrow 24px scale and sticky judgement in reduced-motion → scaled screenshots and animation reset | CSS and canvas constants checked | Browser rendering pending |
| Mobile/accessibility | 3–5 pads and key names exist → real multitouch and 320px review | DOM/inline source checks | Android/iOS not tested |
| School data/security | GET proxy shares production Supabase project → only public whitelisted fields; no writes | Active function source and CORS inspected | Upstream tier math and RLS unverified |
| School song/rights | A fictitious self-made 28-note song is the only playable song → never infer rights from video | Melody data confirmed | Actual school anthem rights unavailable |
| QA/release | Dedicated source branch exists, hosting is only a redirect/cached mirror → branch-scoped smoke and rollback | Branch/main/CNAME/workflows looked up | HTTP/browser smoke not yet complete |

Conflict resolution: preserve the simplest school → instrument → play UX, and forbid relaxing sound lifecycle or rights/privacy gates to make a fast release appear successful.

## 6. Component extraction / dependency proposal (design only; no disruptive refactor at 001)

- \`src/song-data.js\`: authored music events, tiers and part charts (pure data).
- \`src/chart-core.js\`: audio-clock note geometry / judgement / difficulty (pure functions).
- \`src/audio-engine.js\`: master mix, voices, scheduled-node lifecycle.
- \`src/school-client.js\`: public school API only, defensive parsing.
- \`src/render.js\` and \`src/controls.js\`: Canvas, pads, accessibility.
- \`tests/\`: source contract → DOM flow → audio scheduling → full regression.
- During incremental migration, keep the current v0.8 HTML playable; no import should be introduced before static hosting path is validated.

## 7. Isolation rules and rollback

Only commit to \`schoolband-playtest\`. Do not change \`main\`, the production admin release controller, production CNAME, production Supabase functions, DB or live rankings. Supabase readings here are nonmutating; live public read API usage must remain read-only. Rollback anchor: \`582fc4fb3f92e93c6841209a864dfb3377b0b73f\` before 001 audit. Stage 001 baseline audit is complete after hosted Chromium verification (CI run 44974305321, SHA 20df18e7903eb204e0aa4faf5dbbafe409d9282f). External hosting remains unsuitable for a seamless first visit until SB-007 is fixed.

## 8. Stage 001 acceptance

- [x] Test/main heads, file path, CNAME, redirect source and read API source verified
- [x] Version and static contract documented; 20/20 parse/static lane coverage
- [x] Seven review perspectives and prioritized defect register
- [x] Branch isolation rationale and extraction dependency map
- [x] Hosted RawGitHack and Supabase-redirect browser DOM reproduction after explicit test-only confirmation bypass; HTTP 200 text/html, functioning game UI
- [ ] Actual Android/PC sound and timing (device verification planned at 027)


## 9. Verified browser evidence and newly reproduced host defect

- CI PASS: https://github.com/noam0127/beagu-index/actions/runs/44974305321
- Tested commit: \`20df18e7903eb204e0aa4faf5dbbafe409d9282f\`.
- Static: 28-note self-composed melody, eight bars, 24px note geometry, 20/20 instrument-tier lane coverage.
- Chromium local desktop 1280×900: PASS (HTTP text/html, school demo → each instrument and 4/4/3/5 pads → play → stop).
- Chromium local narrow mobile viewport 320×640: PASS same DOM, pointer/button flow; this is **not** a physical Android or iOS test.
- RawGitHack test URL: initial first-visit navigation returns **HTTP 200 text/html but shows "External Content Notice" instead of the game**. A browser automation test applied the documented consent cookie only within the test, reloaded, then game DOM, instrument pads and start/stop all PASS.
- Supabase \`schoolband-playtest-v02\` URL: redirects to exactly the same RawGitHack consent notice; after the same test-only cookie, playable game DOM PASS. This is a **user-facing blocker for immediate play**, not an API or core game initialization failure.
- Screenshots: https://github.com/noam0127/beagu-index/actions/runs/44974305321/artifacts/14735295332 (4 images).
- SB-007 **HIGH**: first visit to either public trial address requires RawGitHack's extra "Open the page" confirmation. Next action: replace this host with a reliable independent trial HTML host before step 029; do not silently simulate a preconsented user in release tests.
- Note: the automated smoke checked game start/stop in headless Chromium but did not make an external human listening judgement of sound. Real device/audio perception remains for step 027.
