# 난감한 스쿨밴드 — 30단계 실제 개발 진행 기록

## 운영 불변 조건
- 작업 브랜치: \`schoolband-playtest\`; \`main\`, baeguindex.com, 운영 Supabase DB/function, 기존 게임/랭킹은 승인 없이 변경하지 않는다.
- 실제 실행·검증한 것만 PASS, 수행하지 않은 브라우저/장치 테스트는 NOT VERIFIED.
- 최종 단계 진척은 GitHub 커밋 및 브라우저 증거가 충족된 경우에만 업데이트한다.

## 001/030 — 저장소·시험 웹·기준 버전 전수 조사 (2026-11-22)

상태: **IN PROGRESS — external browser/HTTP test not yet verified**.

- 최초 기준 commit: test=\`582fc4fb3f92e93c6841209a864dfb3377b0b73f\`; main=\`0ca283cd09cd63520d9ce8e37463bed8d2f65541\`.
- 현재 기준 HTML: \`games/nangam-schoolband-v08/index.html\` (blob \`88d5ed2089498fc67c7e951a2af8cf1b6fb01635\`).
- Supabase read only: \`schoolband-playtest-v02\` ACTIVE v6 (302→RawGitHack), \`schoolband-school-read-v1\` ACTIVE v1 (public school query/whitelist).
- Static inspection: PASS — 28-note practice melody, 24px note, all lanes of 4 instruments × 5 tiers = 20/20 populated.
- Risk IDs: SB-001–SB-006. Seven-role review and detailed sources: \`docs/schoolband-stage001-baseline-audit.md\`.
- Added staged test: \`scripts/check-schoolband-baseline.cjs\` (static contract and Chromium DOM/browser smoke, requires GitHub Actions run).
- GitHub commits: audit=\`dfb7ec5ca311fedad9962105a3a16a36fe6c0cd3\`; browser/static test=\`501e24d3cb411a4d3ba195cc749b87d6ba4d4136\`.
- External tool limitations: direct web-open and local HTTP requests cannot retrieve RawGitHack, redirect or baeguindex.com in this environment. Do not claim hosted HTML, music playback or device success without fresh evidence.
- Next: execute GitHub Actions Chromium check including hosted URLs. If passing, record verified run ID, URL, screenshots and completion commit. If failing, repair **within 001** before moving on to 002.

## 002/030 — pending
One-command test infrastructure, deliberate failure detection, measurement baselines and continuous progress log updates.
