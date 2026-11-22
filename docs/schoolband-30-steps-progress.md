# 난감한 스쿨밴드 — 30단계 실제 개발 진행 기록

## 운영 불변 조건
- 작업 브랜치: `schoolband-playtest`; `main`, baeguindex.com, 운영 Supabase DB/function, 기존 게임/랭킹은 승인 없이 변경하지 않는다.
- 실제 실행·검증한 것만 PASS, 수행하지 않은 브라우저/장치 테스트는 NOT VERIFIED.
- 최종 단계 진척은 GitHub 커밋 및 브라우저 증거가 충족된 경우에만 업데이트한다.

## 001/030 — 저장소·시험 웹·기준 버전 전수 조사 (2026-11-22)

상태: **COMPLETE — baseline audited, hosted UI reproducible after consent; first-visit notice logged as SB-007**.

- 최초 기준 commit: test=`582fc4fb3f92e93c6841209a864dfb3377b0b73f`; main=`0ca283cd09cd63520d9ce8e37463bed8d2f65541`.
- 현재 기준 HTML: `games/nangam-schoolband-v08/index.html` (blob `88d5ed2089498fc67c7e951a2af8cf1b6fb01635`).
- Supabase read only: `schoolband-playtest-v02` ACTIVE v6 (302→RawGitHack), `schoolband-school-read-v1` ACTIVE v1 (public school query/whitelist).
- Static inspection: PASS — 28-note practice melody, 24px note, all lanes of 4 instruments × 5 tiers = 20/20 populated.
- Risk IDs: SB-001–SB-006. Seven-role review and detailed sources: `docs/schoolband-stage001-baseline-audit.md`.
- Added staged test: `scripts/check-schoolband-baseline.cjs` (static contract and Chromium DOM/browser smoke, requires GitHub Actions run).
- GitHub commits: audit=`dfb7ec5ca311fedad9962105a3a16a36fe6c0cd3`; browser/static test=`501e24d3cb411a4d3ba195cc749b87d6ba4d4136`.
- Direct assistant-side HTTP was unavailable; **GitHub-hosted Chromium** confirmed HTTP 200 `text/html` and playable game DOM for both hosted URLs after test-only consent. No physical device listening test has been done.
- CI evidence: PASS run `44974305321` for code commit `20df18e7903eb204e0aa4faf5dbbafe409d9282f`: https://github.com/noam0127/beagu-index/actions/runs/44974305321
- Chromium PASS: local desktop 1280×900, local mobile viewport 320×640, RawGitHack after consent and Supabase redirect after consent. Instrument pads 4/4/3/5 and start/stop checked; 4 screenshots: https://github.com/noam0127/beagu-index/actions/runs/44974305321/artifacts/14735295332
- Defect SB-007 HIGH: RawGitHack first-visit confirmation replaces game page at both trial URLs; direct-to-game hosting must be fixed before final trial release, step 029.
- 001 passed baseline audit criteria with host defect explicitly recorded; audio listening on real devices remains unverified until 027.
- Next: 002/030 one-command tests, deliberate failure detection and quantified baselines.

## 002/030 — 개발 테스트 인프라와 진행 기록 (2026-11-22)

상태: **COMPLETE — CI PASS, 3개 고의 실패 검출, 2화면 20/20 브라우저 조합, 입력/프레임 기준선 기록**.

- 시작 기준 test HEAD: `499c8fa281ee18e397da3bfd7ddd397686d12045`. 테스트 게임 HTML은 변경하지 않고 `schoolband-playtest`에서만 검사 도구를 추가.
- 테스트 실행: 사전 Playwright/Chromium 설치 후 `node scripts/test-schoolband-stage002.cjs` **한 명령**.
- 실제 추가 파일: `scripts/test-schoolband-stage002.cjs`, `.github/workflows/schoolband-stage002-test.yml`, `docs/schoolband-stage002-test-infrastructure.md`, 이 진행 로그.
- CI PASS run: https://github.com/noam0127/beagu-index/actions/runs/44983129465 ; 코드 커밋 `cacd5bc757f23f5cffdeff50e36064cd0faed13a`.
- 자동 테스트: JS 문법/28음/20조합 정적 PASS, 일부러 문법·노트 크기·레인 번호를 망가뜨린 부정검사 3/3 검출.
- Chromium 실제 DOM 테스트: desktop(1280×900) 20/20 PASS, mobile320(320×640 터치 에뮬레이션) 20/20 PASS. 각각 가상 API 검색/상세 10회, 예상외 운영 API 호출 0회, 페이지 JS 오류 0건. 모바일 레인 터치 동작 확인.
- 개인정보: 가상 응답에 포함한 민감 필드 카나리 문자열이 화면에 노출되지 않음. Supabase `schoolband-school-read-v1` v1 소스 GET/OPTIONS 전용, 학교명/ID/공개 난이도/연도만 통과시키는 화이트리스트 재확인.
- 계측 baseline: 두 화면 모두 44개 프레임 간격 median 16.7ms, p95 16.8ms. 악기 전환 JS 동기 시간 p95 desktop 1.0ms / mobile320 1.1ms. 가상 입력→다음 rAF p95 16.7ms / 16.9ms. **실제 하드웨어 입력/오디오 지연 측정 아님.**
- 원본 CI artifact: https://github.com/noam0127/beagu-index/actions/runs/44983129465/artifacts/14738313962 (`metrics.json`, screenshot 2장). 측정법/표/전문가 7관점: `docs/schoolband-stage002-test-infrastructure.md`.
- 도중 수정: 학교 상세 API가 비동기 갱신되기 전에 난이도를 읽어 첫 CI 실패. 업데이트 완료 표시를 기다리도록 테스트 수정 후 재실행 PASS. 원게임 코드 변경 불필요.
- 남은 위험/미검증: 실제 PC/Android/iOS 장치 청음·입력 지연, 업스트림 RLS, RawGitHack 최초 방문 확인 페이지(SB-007). 임의로 완료 선언하지 않음.
- 다음 단계: **003/030** 24px 노트 시인성/레인 가독성/판정 연출 최적화.

## 003/030 — 24px 노트·레인 가독성 최적화 (2026-11-22)

상태: **COMPLETE — Chromium 시각 비교 4회·실제 연속 PERFECT 3회·001/002 회귀 PASS**.

- 시작 HEAD: `bcc75e3a91a0cd971d5ebe4306bb23d9be1a4386`. 변경은 `schoolband-playtest` 전용, 운영 `main`/DB/Edge Function은 수정하지 않음.
- 실제 수정 파일: `games/nangam-schoolband-v08/index.html`, `scripts/test-schoolband-stage003.cjs`, `.github/workflows/schoolband-stage003.yml`, `docs/schoolband-stage003-visual-legibility.md`, 이 진행 로그.
- 108 BPM 16분음표(138.89ms)에서 24px 노트 중심 간격 **23.81→28.74 내부 px**, 연속 노트 여백 **-0.19→+4.74px**. 캔버스 원본 크기와 노트 높이 유지, 낙하 preview 1.40→1.16초.
- 5레인 텍스트 대비·크기 및 노트 gradient·상단 하이라이트·윤곽선 개선. 레인 발광 175ms 프레임 독립, FX 모노토닉 시간 사용. 파편 cap 60 유지, 빠른 연타 애니메이션 명시적 cancel→재시작.
- 7개 관점 원인·해결·검증·잔여 위험: `docs/schoolband-stage003-visual-legibility.md`.
- 검증된 SHA `3e26edb33f652b7e3174ca7ba8e235c054c39c68`; CI **PASS** https://github.com/noam0127/beagu-index/actions/runs/44987172112.
- 시각 비교: PC 1280×850 / 모바일320×640 각각 수정 전·후 캔버스 이미지 PASS. 모바일 캔버스 CSS폭 282px, 패드 5개가 겹치지 않고 수평 오버플로 없음. 실제 Canvas 노트 픽셀 대비 검사 PASS.
- 드럼 EXTREME 16분음표 연속 하이햇 3회 실제 브라우저 판정 모두 PERFECT, 3,030점; 매번 새 CSSAnimation 객체 및 레인 발광 검증, 파편 11/22/31개(상한60).
- 아티팩트: https://github.com/noam0127/beagu-index/actions/runs/44987172112/artifacts/14740332848 (before/after 4장, 임팩트 1장, results.json). 화면 이미지를 직접 열어 노트 겹침 개선 확인.
- 기존 001/002 회귀 CI PASS: https://github.com/noam0127/beagu-index/actions/runs/44986934152 및 https://github.com/noam0127/beagu-index/actions/runs/44987077478.
- 미검증/후속: 실제 Android/iOS 디바이스, 출력 오디오 지연, 극단적 동시타격 피드백 구분/광과민성, RawGitHack 첫 방문 확인 화면(SB-007).
- 다음 단계: **004/030** 콤보·MISS·동시타격·접근성 연출.

## 004/030 — 콤보·미스·동시타격·접근성 연출 완성 (2026-11-22)

상태: **COMPLETE — 독립 Stage 004 CI PASS, 기존 20/20 조합 회귀 PASS, 7개 전문 관점 기록**.

- 시작 test HEAD `90b6557cbc873ed682054eb0b98e142b34c8a70f`; `schoolband-playtest` 외 운영 `main`/DB/Edge Functions 변경 없음.
- 실제 추가·수정: `games/nangam-schoolband-v08/index.html`, `scripts/test-schoolband-stage004.cjs`, `.github/workflows/schoolband-stage004.yml`, 003단계 테스트의 패드 선택자 충돌 수정, `docs/schoolband-stage004-combo-miss-accessibility.md`, 이 기록.
- 독립 레인 판정 오버레이 PERFECT/GOOD/MISS/NO NOTE(터치 비간섭), 콤보 3·5 및 5의 배수에만 배지, 빈 입력과 노트 MISS를 다른 집계로 표시. 오타·연타가 다른 레인의 노트를 지우거나 빈 입력이 MISS로 집계되지 않도록 분리. 화면 흔들림과 밝기 제한, 연달아 발생하는 MISS의 `aria-live` 중복 안내 억제.
- 효과 줄이기(시스템 `prefers-reduced-motion` 우선)와 진동 사용(기본 OFF·명시적 opt-in) 체크박스 구현. 로컬 저장소에는 FX 불리언만 저장. 감소 모드 파편·화면 흔들림·진동·링 없음, 260ms 뒤 판정 표시 제거(기존 정적 고착 버그 SB-003 해결).
- CI 검사 대상 SHA `ed5722991232fea3578f8f71afa7beaffb1a582d`; [GitHub Actions run 44991368437](https://github.com/noam0127/beagu-index/actions/runs/44991368437) **PASS**.
- 실제 브라우저 시나리오: 3연타 콤보 3 → 같은 시각 2레인 적중으로 콤보 5, 독립 배지 2개가 서로 겹치지 않음; 빈 입력 `NO NOTE` 1회(콤보·MISS 불변); 실제 `MISS` 2개; GOOD/ PERFECT 시각 구별; 320px OS reduced-motion에서 파편·진동 0, 310ms 뒤 중앙 판정 사라짐; 사용자 효과 감소 설정 reload 복원, 사용자가 활성화한 진동 API 1회 호출. 기존 002단계 20개 조합 양쪽 화면 모두 PASS.
- [증거 ZIP (결과 JSON·실제 화면 3장)](https://github.com/noam0127/beagu-index/actions/runs/44991368437/artifacts/14741702428).
- 각 관점의 검토·근거·잔여 위험: `docs/schoolband-stage004-combo-miss-accessibility.md`.
- 남은 위험: 실제 iOS/Android 물리 진동·청음·스크린리더는 별도 검증이 필요. 호스팅 첫 방문 안내(SB-007), 320px에서 긴 연주 시작 버튼 줄 바꿈, 오디오 시간축/경계·동시 노트 초정밀 판정은 후속 단계.
- 다음 단계: **005/030** 공통 AudioContext 시간축·PERFECT/GOOD/MISS 판정 경계·노트 좌표 독립 검사.

## 005/030 — 공통 오디오 시간축과 판정 경계 확정 (2026-11-22)

상태: **COMPLETE — 순수 시간 모델 98+121+28개 수치 검증, PC·320px 모바일 실제 Web Audio 검증, CI 회귀 PASS**.

- 시작 test HEAD: `7b7f522e86398dfda3ec78768e443ad0bd6088ec`. 수정 범위는 `schoolband-playtest` 시험 브랜치뿐; 운영 `main`, DB, Edge Functions 변경 없음.
- 게임 수정: `games/nangam-schoolband-v08/index.html` 내 `SCHOOLBAND_TIMING_MODEL_V1` 순수 시간 모델 분리. `noteTimeSeconds`, `noteDeltaSeconds`, `noteSpawnTimeSeconds`, `noteIsInDrawingWindow`, `noteYAtAudioTime`, `judgementForOffset`, `isNoteMissed` 등. 오디오 스케줄러·차트·좌표·입력·미스의 시간식 일원화.
- 실제 판정 임계치는 원본 보존: PERFECT `.09/.075/.06/.05/.036s`, GOOD 최대 `.20/.17/.14/.11/.075s`. ±입력 경계 정확히 포함하고, 늦은 경계 초과 시에만 MISS.
- 실제 신규 테스트: `scripts/test-schoolband-stage005.cjs`, `.github/workflows/schoolband-stage005.yml`; 상세 설명과 역할별 독립 7관점 리뷰 `docs/schoolband-stage005-audio-clock-timing.md`.
- **CI SUCCESS** [run 44993812039](https://github.com/noam0127/beagu-index/actions/runs/44993812039), 코드 커밋 SHA `5f85cbcb01913ded396754e8fd393a5079e9c200`.
- 실제 수치: 98개 EXACT 경계·유효성 조건, 121개 8마디·노트 스폰·좌표, 30/60/90/120Hz 동일 시각 함수 좌표 28개 모두 PASS. EASY GOOD 임계치 `.200→.195` 고의 훼손 검출.
- 실브라우저 PC 1280×900 및 mobile320 320×640 Chromium에서 각 5난이도 경계와 좌표 PASS. 240ms 대기 시 AudioContext 곡 시간 +`0.240907s`씩 진행; 정상 NORMAL 56개 차트 확인.
- 002단계 20조합·고의 실패·개인정보 카나리 회귀 CI PASS. 원곡 28음, 악기/학교/점수 정책 불변.
- [증거 JSON 아티팩트](https://github.com/noam0127/beagu-index/actions/runs/44993812039/artifacts/14742124362) 실물 확인.
- 테스트 코드 오류 2건 수정: 순수 모델 주석 구간 추출 및 `0.84`와 실제 `2-1.16`의 부동소수점 차이. 실제 게임 판정 임계값은 완화하지 않음.
- 미검증: 물리 오디오/터치 지연, 기기 오프셋·동시 노트 미세 판정(006), 실제 주사율/앱 전환(007), 오디오 노드 중지(012), 실기 청음(027), 호스팅 처음 방문 interstitial(029).
- 다음 단계: **006/030 — 오입력·동시노트·기기별 오프셋 보정**.

## 006/030 — pending
다른 레인의 노트를 잘못 소실하지 않는 판정과 동시노트 독립 처리, 오디오/입력 지연 보정 UI 및 수치 검증.
