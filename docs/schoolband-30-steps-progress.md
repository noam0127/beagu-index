# 난감한 스쿨밴드 — 30단계 실제 개발 진행 기록

## 운영 불변 조건
- 작업 브랜치: \`schoolband-playtest\`; \`main\`, baeguindex.com, 운영 Supabase DB/function, 기존 게임/랭킹은 승인 없이 변경하지 않는다.
- 실제 실행·검증한 것만 PASS, 수행하지 않은 브라우저/장치 테스트는 NOT VERIFIED.
- 최종 단계 진척은 GitHub 커밋 및 브라우저 증거가 충족된 경우에만 업데이트한다.

## 001/030 — 저장소·시험 웹·기준 버전 전수 조사 (2026-11-22)

상태: **COMPLETE — baseline audited, hosted UI reproducible after consent; first-visit notice logged as SB-007**.

- 최초 기준 commit: test=\`582fc4fb3f92e93c6841209a864dfb3377b0b73f\`; main=\`0ca283cd09cd63520d9ce8e37463bed8d2f65541\`.
- 현재 기준 HTML: \`games/nangam-schoolband-v08/index.html\` (blob \`88d5ed2089498fc67c7e951a2af8cf1b6fb01635\`).
- Supabase read only: \`schoolband-playtest-v02\` ACTIVE v6 (302→RawGitHack), \`schoolband-school-read-v1\` ACTIVE v1 (public school query/whitelist).
- Static inspection: PASS — 28-note practice melody, 24px note, all lanes of 4 instruments × 5 tiers = 20/20 populated.
- Risk IDs: SB-001–SB-006. Seven-role review and detailed sources: \`docs/schoolband-stage001-baseline-audit.md\`.
- Added staged test: \`scripts/check-schoolband-baseline.cjs\` (static contract and Chromium DOM/browser smoke, requires GitHub Actions run).
- GitHub commits: audit=\`dfb7ec5ca311fedad9962105a3a16a36fe6c0cd3\`; browser/static test=\`501e24d3cb411a4d3ba195cc749b87d6ba4d4136\`.
- Direct assistant-side HTTP was unavailable; **GitHub-hosted Chromium** confirmed HTTP 200 `text/html` and playable game DOM for both hosted URLs after test-only consent. No physical device listening test has been done.
- CI evidence: PASS run `44974305321` for code commit `20df18e7903eb204e0aa4faf5dbbafe409d9282f`: https://github.com/noam0127/beagu-index/actions/runs/44974305321
- Chromium PASS: local desktop 1280×900, local mobile viewport 320×640, RawGitHack after consent and Supabase redirect after consent. Instrument pads 4/4/3/5 and start/stop checked; 4 screenshots: https://github.com/noam0127/beagu-index/actions/runs/44974305321/artifacts/14735295332
- Defect SB-007 HIGH: RawGitHack first-visit confirmation replaces game page at both trial URLs; direct-to-game hosting must be fixed before final trial release, step 029.
- 001 passed baseline audit criteria with host defect explicitly recorded; audio listening on real devices remains unverified until 027.
- Next: 002/030 one-command tests, deliberate failure detection and quantified baselines.

## 002/030 — pending
One-command test infrastructure, deliberate failure detection, measurement baselines and continuous progress log updates.
