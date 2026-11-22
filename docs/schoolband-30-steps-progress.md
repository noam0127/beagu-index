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

## 006/030 — 오입력·동시노트·기기별 판정 오프셋 보정 (2026-11-22)

상태: **COMPLETE — 정확한 레인 격리, +120/−120ms 실재생 브라우저 실증, 214개 단위 검사, 기존 002/004/005 회귀 CI PASS**.

- 시작 시험 브랜치 SHA: `2c4ef79b56b77864afc6044ed9119e273a3ec7b3`. 운영 `main`·baeguindex.com·운영 Supabase DB/Edge Functions는 변경하지 않았다.
- 변경: `games/nangam-schoolband-v08/index.html` 판정 모델 내 `correctedInputTime`, `clampOffsetMs`, `selectPendingNoteIndex`를 추가하고 `hit` 및 MISS 마감에 동일한 보정 오디오 시간을 적용. 0ms는 이전과 동일하며 노트 위치·반주/사운드/멜로디/차트는 변경하지 않음.
- UI: 학교→악기→연주의 핵심 흐름을 가리지 않는 접이식 `판정 보정` 패널, ±150ms(5ms 단위) 조절, 값 표시·로컬 저장·초기화, 연주 중 편집 잠금. `+120ms`는 입력이 늦게 들어왔을 때 판정 시간을 120ms 앞당김; 화면/음원의 출력 시각은 바뀌지 않음.
- 동시노트: 해당 레인에서 허용 시간창에 들어오는 가장 가까운 미처리 노트만 선택, 오입력·같은 레인 중복 타격이 다른 레인의 노트를 지우지 않음. 보정값을 적용한 MISS 시간창과 입력 시간창이 서로 일치하도록 개선.
- 신규 테스트: `scripts/test-schoolband-stage006.cjs`, `.github/workflows/schoolband-stage006.yml`. GitHub CI [run 44994419251](https://github.com/noam0127/beagu-index/actions/runs/44994419251) **SUCCESS**. 검증된 소스 SHA: `dbeb02a487e3de8c0b39c7913de895a37b4a6512`.
- 수치/정적 테스트 **214건 PASS**, 보정 부호를 반대로 뒤집은 고의 실패 탐지 PASS. PC와 320px 모바일 Chromium 실재생에서 `+120ms` 상태 동시노트 2개 PERFECT, 잘못된 레인 NO NOTE 및 기존 노트 보존, 중복 타격 거부. 0ms로 되돌리면 약 120ms 늦은 입력 거부, `−120ms`에서 120ms 이른 입력 PERFECT.
- 사용자의 보정값 저장·새로고침 복원·초기화, 연주 중 잠금, 모바일 수평 오버플로 없음 모두 PASS. 시험 학교명/난이도는 합성값으로만 제공. 실제 사용자 음향 장치 지연 측정이 아닌 Chromium 시계·입력 이벤트 검사임.
- [실제 결과 JSON·PC/320px 스크린샷 아티팩트](https://github.com/noam0127/beagu-index/actions/runs/44994419251/artifacts/14743740848)를 내려받아 내용/모바일 화면 검토. 기존 Stage 005 수치·Stage 002 전 조합·Stage 004 콤보/모션 접근성 전체 회귀 PASS.
- 7개 독립 AI 전문 관점의 문제→해결→검증→잔여 위험: `docs/schoolband-stage006-input-latency.md`. 외부 실제 전문가 감수와 실기 Android/iOS 테스트는 수행하지 않았음.
- 첫 CI에서 Chromium 모바일 새로고침 후 설정 패널의 `details` 열림 상태가 복원되어 초기화 버튼이 가려진 테스트 문제가 있었고, 패널을 명시적으로 연 뒤 실제로 초기화 버튼을 누르는 방식으로 수정해 두 번째 CI PASS.
- 남은 위험: 물리 출력/입력 지연 및 멀티터치(017/027), 60/90/120Hz 앱 전환과 시계 정지(007), 예약 Web Audio 중단(012), 최고점 기록 공정성(024), 최초 시험 웹 안내 화면(SB-007, 029).
- 다음 단계 **007/030 — 주사율·탭 전환·오디오 일시정지·복귀 종합 검증**.

## 007/030 — 주사율·앱 전환·오디오 일시정지·복귀 종합 검증 (2026-11-22)

상태: **COMPLETE — 60·90·120Hz 수치 시뮬레이션과 PC·모바일 Chromium 일시정지/재개·외부 오디오 중단·중장시간 화면 정체 회귀검사 PASS.** 실제 스마트폰 화면 잠금 실기는 미검증.

- 시작 시험 브랜치 SHA: `6b95fdb8d63773442df0943c6d8384d43797b61c`. 운영 `main`, `baeguindex.com`, 운영 Supabase는 미변경.
- 게임 코드 `games/nangam-schoolband-v08/index.html`에 `Ⅱ 일시정지`/ `▶ 이어하기` 버튼, 320px 2×2 액션 그리드, `AudioContext.suspend()/resume()` 사용한 공통 곡 시계 일시정지, `document.visibilitychange`/bfcache `pagehide/pageshow`, 오디오의 `suspended` 및 `interrupted` 자동 정지 감지, 사용자가 직접 이어하기 누르기 전 자동 재생 금지, 1,500ms+오디오 650ms 이상 비예고 시간 점프 시 일괄 MISS 대신 안전 중단을 추가.
- 새 검사: `scripts/test-schoolband-stage007.cjs`, `.github/workflows/schoolband-stage007.yml`, 상세 7개 전문 AI 관점 검토 `docs/schoolband-stage007-fps-lifecycle.md`. 검증 대상 코드 SHA `963a6eeaada9badeac5c72500afb044296e735d9`.
- GitHub Actions [run 44995247146](https://github.com/noam0127/beagu-index/actions/runs/44995247146) **SUCCESS**. 프레임 수가 121/181/241로 달라도 5개 입력 판정이 `PERFECT×4 + GOOD×1`, 미입력 `MISS×1`로 완전 일치. 프레임 번호를 음악 시계로 잘못 사용하는 고의 훼손 테스트에서 정상 판정과 달라지는 것을 검출. 같은 곡 시각 좌표 15개 검증.
- PC 1280px 및 모바일320 Chromium: 750ms 정지 시 오디오 시계 0초 변화, 점수/MISS/완료 노트/스케줄 커서 모두 불변, 이어하기 후 약 0.241초/0.229초 정상 진행. 멈춘 상태의 입력으로 점수 조작 불가.
- 실제 AudioContext를 외부에서 suspend한 테스트에서 자동 일시정지, 수동 이어하기 PASS. `pagehide(persisted=true)`/복귀를 합성한 생명주기 대리테스트도 PASS.
- 탭 활성화를 실제로 변경했으나 Playwright headless의 포커스 에뮬레이션 탓에 `document.hidden` 네이티브 변화가 관찰되지 않아 해당 부분은 **합성 visibilitychange**를 사용해 검사. 실제 스마트폰 잠금 화면/실제 브라우저의 자연 탭 숨김 검증으로 주장하지 않는다(실기 027).
- 1,850ms 비예고 주 스레드 정체에서는 MISS가 `1→1`로 일괄 발생하지 않고 안전 중단 후 처음부터 재시작하도록 처리. final stop 시 예약 오디오 노드 완전 해제는 012 단계 잔여 위험.
- 기존 Stage001·002·003·004·005·006 회귀 GitHub Actions **PASS** (같은 최신 게임 코드 기준 별도 실행 포함). 주요 기능·학교 공개 조회·음색·노트 계약 변경 없음.
- [실제 JSON/PC·320px 일시정지 화면 ZIP](https://github.com/noam0127/beagu-index/actions/runs/44995247146/artifacts/14743408309) 실물 확인.
- 후속 미검증: 실제 Android/iOS 잠금·오디오 인터럽트·물리 출력 지연(027), WebAudio 예약 노드 취소(012), 하드웨어 120Hz(018/028), 시험 호스트 첫 방문 확인(SB-007, 029). 다음은 **008/030 — 기타·드럼·베이스·키보드 입력 계약 고정**.

## 008/030 — 기타·드럼·베이스·키보드 입력 계약 고정 (2026-11-22)

상태: **COMPLETE — PC·320px Chromium 각 20조합, 총 40개의 연주 및 종료, PC 키 160회·터치 160회·Enter 40회 전수 PASS.**

- 시작 시험 브랜치 HEAD: `37cecc237d4cf296eec4f77e8cd9038905f6fb3f`. 수정한 GitHub 브랜치는 `schoolband-playtest`뿐. 운영 `main`, `baeguindex.com`, 운영 Supabase DB/Edge Functions/기존 게임 미변경.
- 원본 008/030(원본 031~035) 명세에 맞춰 **일렉기타 4레인(D/F/J/K), 드럼 4레인(D/F/J/K), 베이스 3레인(F/Space/J), 키보드 5레인(A/S/D/J/K)**를 재대조. 기타 표시명 '파워'→'파워코드', '고음'→'고음 리프'로 수정, Canvas 접근성 aria-label에 현재 레인 전체 이름/키 동기화, 키보드로 패드에 포커스해 Enter/Space 활성화 시 detail=0 click 처리. 실제 포인터 click(detail>0) 중복 채점 방지.
- 수정·추가 파일: `games/nangam-schoolband-v08/index.html`, `scripts/test-schoolband-stage008.cjs`, `.github/workflows/schoolband-stage008.yml`, `docs/schoolband-stage008-lane-contract.md`, 이 진행 기록.
- 정적 실제 차트 **4악기×5난이도 20/20조합**, 80개 레인-난이도 짝에 최소 1개 유효 노트 확인. 8마디 차트의 노트 수 EASY→EXTREME: 기타 40→144, 드럼 32→168, 베이스 32→128, 키보드 40→144. 고의 오류 3종(쉬움 특정 레인 누락·키 중복·범위 밖 노트) 감지.
- **GitHub Actions SUCCESS**: [run 44995835685](https://github.com/noam0127/beagu-index/actions/runs/44995835685), 테스트 대상 소스 SHA `620d2d8a3da306b00a27fafd9fd1f28446a552a3`.
- **브라우저 40회 완주/입력 실증**: PC 및 320px 모바일 각각 20조합에서 각 레인 첫 마디 키 입력·둘째 마디 touch pointerdown·셋째 마디 Enter로 적중; **키 이벤트 160·터치 이벤트 160·Enter 40개** 독립 정타 및 chart.done·점수·완주·100% 진행률·재시작 가능. 악기별 그리드 수·버튼·키 안내·실제 Canvas 텍스트·aria-label 매핑·터치 영역 32×68 CSS px 이상·가로 오버플로 없음 모두 PASS.
- **검증 제약**: 테스트 전용 Web Audio 시계를 가속·음소거하여 *입력 연결과 완주 흐름*을 검증. 40회의 물리 악기 청음/실시간 인간 연주가 아니므로 오디오 출력·실기 입력지연은 010~012·017·027에서 별도 확인. 실제 교가 저작물 미사용·가상 학교 API fixture만 사용.
- **회귀**: 동 CI에서 005단계의 판정 경계 및 노트 위치 수치, 007단계의 60/90/120Hz 시뮬레이션, 002단계의 PC·모바일 20조합·비공개 데이터 경계 전부 PASS. 신규 HTML 수정 후 003/004 회귀도 별도 CI PASS.
- **첫 검사 오류 처리**: 가속 시계에서 지나간 다른 노트가 MISS를 표시하는 순간 배지 경쟁이 발생하였으나 실제 타격/노트 consumed는 정확했다. 단계008의 입력 계약 검사를 순간 FX 문구 대신 hit 증가 + 실제 chart.done로 검증하도록 조정. 실시간 FX 자체는 앞선 004회귀에 계속 남겨 검증한다.
- **실제 [results.json + PC/모바일 8개 Canvas 이미지](https://github.com/noam0127/beagu-index/actions/runs/44995835685/artifacts/14743803098)**를 내려받아 총 9개 파일과 PC/모바일 40회·각 80키/80터치/20Enter, JavaScript 오류 0을 확인. [7개 독립 AI 관점 기록](./schoolband-stage008-lane-contract.md).
- 다음 단계 **009/030 — 악기별 리듬 패턴·차트 데이터 검증**.

## 009/030 — 악기별 리듬 패턴·차트 데이터 유효성 완성 (2026-11-22)

상태: **COMPLETE — 20조합·80개 레인 품질 게이트, JSON Schema Draft 2020-12, 잘못된 차트 E2E 차단, 악기별 Web Audio 이벤트, 008·005·007 회귀 PASS**.

- 시작 브랜치 HEAD `b498c8dcda3c4b967b56dcbee6ae8be5c9674348`. 수정은 `schoolband-playtest`에만 한정. 운영 `main`·`baeguindex.com`·운영 Supabase 변경 없음.
- 차트 스키마·버전 추가: `games/nangam-schoolband-v08/charts/creative-school-anthem.chart.v1.json`, `charts/schoolband-chart.schema.json`. 창작 「빛나는 우리 학교」 108BPM·8마디·16분 분할·4악기 3~5레인·5난이도와 원본 내장 `PARTS` 완전 일치 확인. 차트 버전 `creative-anthem-rhythm-v1.0.0`, 스키마 1, 지원 타입 `tap`만.
- 새 순수 검증기 `validateChartCatalog`를 `games/nangam-schoolband-v08/index.html`에 구현. 시작 전 버전/노트 구조/중복/미유효 레인/밀도 증가/악기별 동시노트/베이스 단일 저음선/드럼 하이햇/극한 16분음을 확인. 손상 차트는 연주 시작 전 오류 안내와 함께 차단.
- 난이도별 한 마디당 노트 수 EASY→EXTREME: 기타 `5/7/9/11/18`, 드럼 `4/6/9/14/21`, 베이스 `4/6/8/10/16`, 키보드 `5/7/8/10/18`. 전 악기에서 엄격하게 증가하며 각 레인의 노트가 존재. 기타 HARD·드럼 VERY HARD·키보드 VERY HARD부터 2레인 동시타격을 활용하며 **베이스 동시노트와 롱노트는 v1 차트 미지원**(추후 별도 타입·키 홀드/릴리즈 판정 필요).
- 테스트/CI: `scripts/test-schoolband-stage009.cjs`, `.github/workflows/schoolband-stage009.yml`. JSON Schema 고의 오류 **12종**, 리듬 차트 고의 오류 **10종** 각각 거절 PASS. 손상 버전/중복 노트를 삽입한 브라우저 실제 시작 **PC·모바일 총 4건 재생 차단** PASS.
- **CI [run 45002366388](https://github.com/noam0127/beagu-index/actions/runs/45002366388) SUCCESS**, 검증된 코드 SHA `973f42516f574942f56c4cde9a4a143b322c94a9`. PC 1280×850·320px Chromium에서 4악기 레인별 Canvas·차트 통계·AudioContext 오실레이터 생성 기록(기타 sawtooth/드럼 sine/베이스 triangle/키보드 sine×2) PASS. 실제 인간 청음은 아님.
- 이전 Stage008의 **40/40 자동 연주 완주, 160회 키·160회 터치·40회 Enter**, Stage005의 98+121+28개 타이밍 수치, Stage007의 60/90/120Hz 가상 시계 검사 동일 CI에서 전부 PASS.
- [실제 증거 JSON·4악기 PNG 아티팩트](https://github.com/noam0127/beagu-index/actions/runs/45002366388/artifacts/14746801136) ZIP 5개 파일 확인. 초기 첫 CI에서 게임 전용 아이콘/안내 텍스트와 외부 차트의 공통 필드를 혼동한 테스트 비교 범위를 바로잡은 후 전체 검사 PASS.
- 7개 전문 AI 관점 독립 검토, 악기별 음악성 및 룰 결정, 저작권·아티팩트 한계: `docs/schoolband-stage009-chart-contract.md`. 운영 버전 반영·실제 학교 교가 편곡/권리 승인 미실행. 입력 품질 개선은 010~012/017/027; 차트 버전별 기록 키 분리는 024단계.
- 다음 단계 **010/030 — 실시간 합주·악기 음색 개선 I**.

## 010/030 — 악기별 실시간 합주·음색 개선 I (2026-11-22)

상태: **COMPLETE — PC·320px Chromium, 4악기 합계 16개 레인 ×2 = 실제 Web Audio 32번 적중 및 자동반주/원곡 멜로디/무음 MISS/음소거 이벤트 기록, 전체 CI PASS.**

- 시작 시험 브랜치 HEAD: `55d60377655f63fa77881dd704e0b69d7f10191d`. `main`·실제 운영 웹·운영 Supabase/학교 자료 무변경.
- 게임 소스 `games/nangam-schoolband-v08/index.html`: `autoPartsAtStep`가 선택한 악기 파트를 자동 반주에서 제외하고 창작곡 28개 선율과 나머지 3개 악기의 반주를 유지. `voice()` 호출에 `source=auto/hit` 구분 추가. `hit()` 성공 시 사용자 파트 발음, `animate()` MISS 시에는 사용자 파트 발음 없이 무음 MISS 로그만 남김.
- 음색: 기타 리프 짧은 sawtooth 1음, 파워코드 sawtooth 2개 + triangle 옥타브 1개, 업스트럼 sawtooth 3음 0/17/34ms 순차 발음, 고음 리프 sawtooth+triangle; 드럼 킥 sine pitch sweep, 스네어 triangle+filtered noise, 하이햇 고역 noise, 탐 triangle pitch 235→96Hz. 기존 베이스 triangle·키보드 sine와 창작 교가의 박자·28개 선율 유지.
- 디버그 이벤트 `logAudioEvent`/`getAudioEvents`는 `source: auto|hit|miss`, part, lane, when, detail, audible 정보를 **브라우저 메모리에 최대 384건**만 보존. 학교명/사용자/성적을 저장·전송하지 않음. 별도 `getAudioPlan`로 악기별 자동 반주 목록 검증.
- 추가 코드: `scripts/test-schoolband-stage010.cjs`, `.github/workflows/schoolband-stage010.yml`, 7개 전문가 역할 검토 `docs/schoolband-stage010-live-ensemble.md`. **GitHub Actions [run 45003955597](https://github.com/noam0127/beagu-index/actions/runs/45003955597) SUCCESS**, 실제 검증 대상 게임+테스트 SHA `64b29736c696d61ed08b300087f7d2a4ccab058b`.
- **실제 브라우저 32개 레인 hit**: PC 및 mobile320에서 기타 4/드럼 4/베이스 3/키보드 5 각각 실제 곡 시간에 타격해 해당 Web Audio oscillator/noise `start`와 노트 적중 1:1 확인. 기타 4·드럼 4 각 레인 노드 파형 개수 비교 PASS; 실제 업스트럼 노드 시작 간격 17/34ms 검사 PASS. 멜로디와 선택하지 않은 3악기 자동 반주 이벤트 정상, 선택 악기 자동 반주 이벤트 0, 각 악기에서 놓친 노트의 사용자 파트 소리는 생성하지 않음.
- **음소거 두 환경**: 점수는 정상 오르되 신규 오디오 노드 생성은 0, 이벤트 `audible:false`. 384건 로그 상한 PASS. 고의적인 선택 파트 자동 연주를 소리 이벤트로 잘못 기록하지 않도록 확인.
- **전체 회귀**: 009단계 차트 JSON Schema·invalid chart 실제 브라우저 차단, 008단계의 20조합 정적 계약, 004단계 콤보/GOOD/MISS/접근성 실브라우저, 005단계 98+121+28 타이밍 수치 전부 동 CI PASS.
- **증거 [결과 JSON+4개 악기 스크린샷(기타/드럼 PC/모바일)](https://github.com/noam0127/beagu-index/actions/runs/45003955597/artifacts/14746838912)** ZIP 5개 파일 실제 다운로드·검증. 외부 실제 청음 참여가 아닌 Web Audio 이벤트·노드 예약 자동검사이며, 기기별 출력·화성·헤드룸/클리핑(011), 예약 노드 중단(012), 모바일 물리 청음/터치(027)는 미검증.
- 단위 테스트 첫 위치 추출 문제, 키보드 화음 1번 레인의 선행 노트 시각 정렬 문제, 2개 뷰포트 hit 총계 변수의 범위 문제를 각각 수정. 성공 전 종료 선언하지 않았음.
- 다음 단계 **011/030 — 합주 음향 개선 II: 화성·헤드룸**.

## 011/030 — 합주 음향 개선 II: 화성·헤드룸 (2026-11-22)

상태: **COMPLETE — 8마디 화성/코드·28음 멜로디 전수 검증, PC·모바일 Web Audio 4개 음량 버스 확인, 48개 OfflineAudioContext PCM 계측에서 최대 피크 −8.11dBFS·클리핑 0 및 010/009/008/005 회귀 PASS.**

- 시작 시험 브랜치 `0ea97b8c7e611bb8e867518cb2ea1ce828025013`. 운영 `main`, `baeguindex.com`, Supabase 운영 DB·Edge Functions·기존 게임 미변경.
- 변경 파일: `games/nangam-schoolband-v08/index.html`, `scripts/test-schoolband-stage011.cjs`, `.github/workflows/schoolband-stage011.yml`, `docs/schoolband-stage011-harmony-headroom.md`; 010단계 회귀검사 `scripts/test-schoolband-stage010.cjs`의 파워코드 설명 주석 검사도 현재 음정 구조에 맞게 갱신.
- 창작 교가의 8마디 진행은 **C–C–G–G–Am–Am–F–C**. 기타 파워코드 토닉+완전5도+옥타브, 업스트럼 토닉·조성에 맞는 3도·5도, 키보드 화음 3도 등에서 **Am의 C자연음**을 사용하여 A 장3도 C# 충돌 제거. 원본 28음 멜로디를 유지하며 코드 구성음 19음·의도된 비화성음 9음으로 검증·문서화. 베이스 루트·5도·옥타브 유지.
- **오디오 버스 4개:** master=0.80 / melody=0.96 / ensemble=0.46 / hit=0.80. 3개 파트 버스→마스터→DynamicsCompressor(−19dB, knee14dB, ratio7:1, attack4ms, release200ms). 소스 `oscillator`, `playNoise`, `drum`, `melodyVoice`, `voice`가 실제 악기/멜로디별 출력 버스를 사용. 음소거 게인 상수도 일원화.
- **GitHub Actions [run 45004834448](https://github.com/noam0127/beagu-index/actions/runs/45004834448) 전체 SUCCESS**, 검증 대상 코드 커밋 `a0905b2e5e39973ae7ad5dae31bf3a9b1e923660`. 원곡 소스 함수 자체를 추출해 `OfflineAudioContext`에서 합주 32개(4악기×8마디, 최대 2노트 동시타격), 멜로디/반주 stem 16개(8마디×2), **총 48개 PCM 파형** 생성.
- **측정:** 32개 합주 최고 피크 **0.39312652 (−8.10935 dBFS)**, 클리핑 샘플 **0**, NaN/Inf 샘플 **0**, 모든 조합 충분한 RMS. 8마디의 멜로디/자동반주 RMS 비 **2.06~2.71**. 이는 디지털 PCM 수치일 뿐 실제 스마트폰 출력·사람의 체감 음량까지 측정한 것은 아니다.
- 실제 Chromium PC 1280px 및 320px 모바일에서 마스터/멜로디/자동반주/타격 버스 `AudioParam` 게인 4개를 직접 검증. 브라우저의 Float32 반올림 차이는 `1e-5` 이하 오차로 확인. 56개 일반 차트 노트와 정상 레이아웃·오류 0건.
- 기존 010단계 PC/모바일 32개 실제 Web Audio hit·무음 MISS·음소거·업스트럼 17/34ms, 009단계 정식 JSON Schema·손상 차트 차단, 008단계 20조합 레인 계약, 005단계 판정 시간축 모두 **같은 CI에서 PASS**.
- [실제 결과 JSON 및 PC/모바일 캡처 2장](https://github.com/noam0127/beagu-index/actions/runs/45004834448/artifacts/14747316170) ZIP을 내려받아 `32 full + 8 stems 비교(16개 출력)`와 최고 피크·클리핑 수치, 2개 게임 화면을 확인.
- 오디오/편곡/리듬/모바일/보안/저작권/QA의 **7개 AI 관점별 비판적 검토 및 수치 판단**: `docs/schoolband-stage011-harmony-headroom.md`. 외부 인간 음악가의 청음, 물리 기기의 스피커 출력, 오디오 노드 완전 해제는 검증하지 않았음.
- 남은 핵심 위험: 예약 Web Audio 노드 정지·중단·재시작 유령 소리·메모리 해제(012), 실제 사람과 Android/iOS 하드웨어 청음·입력 지연(027), 권리 확인된 실제 교가 확보/편곡(022~023), 시험 웹 최초 방문 문제 SB-007(029).
- 다음 단계 **012/030 — 오디오 정지·메모리·재생 안정성**.

## 012/030 — 오디오 중단·음소거·모바일 권한 처리 (2026-11-22)

상태: **COMPLETE — PC/320px Chromium에서 4악기 총 8회 미래 예약 음원 중단·Context 종료·0개 유령 소스, PAUSED 중단·자연 종료·볼륨·음소거·권한 실패 복구 PASS. 단, 실제 기기 귀로 듣는 청음은 미완료(027).**

- 사용자 첨부 원본 30단계 지침의 012/030(원본 048~050)에 따라 작업. 시작 `schoolband-playtest` 브랜치 SHA: `ea57b37d44b67b3c8dffd679531bea193dc2832d`. 운영 `main`, `baeguindex.com`, 운영 Supabase·다른 게임 미변경.
- 게임 소스 `games/nangam-schoolband-v08/index.html`에 **4종 AudioScheduledSourceNode 전수 추적**(`trackAudioSource`)과 `stopTrackedAudio`, `releaseAudioEngine` 도입. 자연 `ended`에는 `disconnect`와 추적 집합 삭제, 수동/정상 종료 때는 master gain을 즉시 0으로 만들고 미래 예약 소스까지 `stop(0)`·이벤트 리스너 제거·노드 disconnect 후 `AudioContext.close()`, 버스·노이즈 버퍼 참조 정리. 중단 후 다른 Context를 새로 생성해 재연주.
- 오디오 권한 보호: `startPending`으로 연속 클릭 중복 시작 방지, 사용자 직접 버튼 이벤트에서 AudioContext.resume. 권한 거절 시 기존 오디오 객체 전체 정리하고 사용자에게 재시도 안내·시작 버튼 복원. 페이지 이동 중 대기 중인 Context도 정리. 오디오 미지원 환경에서는 오류를 표시하고 시작하지 않음.
- 게임 음량 0~100%(5% 단위) 슬라이더·값 표시·브라우저 저장, 전체 음소거와 독립 제어. 마스터 게인 목표값 `MIX_LEVELS.master×volume/100`; 음소거가 최우선으로 0, 해제 후 이전 음량 복원. 학교/학생 개인 정보 저장·전송 없음.
- 신규 테스트 `scripts/test-schoolband-stage012.cjs`, CI `.github/workflows/schoolband-stage012.yml`, 7개 전문가 역할 독립 AI 검토 `docs/schoolband-stage012-audio-lifecycle.md`.
- **GitHub Actions [run 45006452738](https://github.com/noam0127/beagu-index/actions/runs/45006452738) SUCCESS**, 실제 검증 대상 코드 커밋 `1bb53469e0504f7e484f96c6e87c9a8a27966b6e`. PC/320px Chromium 각각 기타·드럼·베이스·키보드 연주 후 예약된 미래 소스 6개씩을 먼저 확인한 뒤 ■ 중단. **8회×6개=48개의 미래 소스를 전부 stop/disconnect**하고 각 Context.state=closed, 관찰 350ms 후 추가 예약 0개·활성 추적 음원 0개 PASS.
- 두 브라우저 모두 자연 음원 재생 종료 `onended` 정리, PAUSED 상태에서 STOP으로 모든 노드 해제, 음량 35%·85% 로컬 저장 및 복원, 0% 완전 무음, mute 중 볼륨을 변경해도 master 0, mute 해제 후 0.48(60%×0.8) 복귀 PASS. 첫 resume의 `NotAllowedError` 모의 → 실패 정리 후 다음 클릭 재시도 PASS. Web Audio API 자체 미지원 오류 처리 PASS.
- 같은 CI에서 011단계 **OfflineAudioContext 48회 파형 생성의 최대 피크 −8.11dBFS·클리핑 0**, 010단계 4악기 합주 음색의 순수 계약, 007단계 60/90/120Hz 일시정지 시간축, 009단계 20조합 차트 스키마 및 오염 거부, 005단계 판정 시계 수치 모두 PASS.
- [증거 JSON 아티팩트](https://github.com/noam0127/beagu-index/actions/runs/45006452738/artifacts/14747273323): `results.json` 1개(2,944바이트) 직접 다운로드·확인. 8개 stopCycles 모두 `scheduled=6, cancelled=6, contextClosed=closed, ghostSources=0`, 권한 재시도·음소거·자연 해제 상태 확인. 이 아티팩트에는 이미지가 없으며 오디오/화면 캡처는 기존 010/011단계 증거에서 참조.
- **한계 명시:** 브라우저 오디오 노드와 디지털 파일 수준의 자동 검증이다. 실제 iOS/Android 기기의 소리 권한 팝업과 헤드폰·스피커·블루투스 청음의 '유령 음 없음'은 물리 장치로 검증하지 않았다. 원본 완료 기준 중 '**4악기 실기 청음**' 항목은 027/030에서 수행해야 하며 본 단계에서 수행했다고 주장하지 않는다.
- 다음 단계 **013/030 — 창작 교가 및 표준 음악 이벤트 규격**.

## 013/030 — 창작 교가 및 표준 음악 이벤트 규격 (2026-11-22)

상태: **COMPLETE — 직접 창작한 28음 시범 교가의 표준 음악 이벤트 JSON 156건 생성, MIDI/MusicXML 독립 변환·피치·시간 336건, 위험/무허가 사례 21종 거절, PC·320px Chromium 실제 음원 예약 검증, GitHub CI PASS.** 실제 학교의 허가·권리검증은 아직 022~023단계 BLOCKED.

- 원본 30단계 지침 013/030(원본 051~053) 기반. 시작 브랜치 `schoolband-playtest` SHA `11bbfc169a59b96750500511751003d7017799e6`. 운영 `main`·실제 운영 웹·운영 Supabase 미변경.
- 신규 파일: `games/nangam-schoolband-v08/charts/original-anthem.music-events.v1.json`(표준 108BPM, 4/4, PPQ 480, 8마디, 15,360tick, 곡 길이 17.77777778초, C-C-G-G-Am-Am-F-C 코드, 멜로디 28/드럼 64/베이스 32/기타 16/키보드 16 합계 **156개**의 시각·음높이·길이·파트 이벤트). 공개는 금지한 내부 창작곡 권리 메타데이터에 `demo_original` 표시.
- `scripts/schoolband-music-events-v1.cjs`: MIDI SMF 형식 0·1 트랙 및 노트 온/오프·PPQ·템포/박자 읽기, MusicXML score-partwise 단일 선율 노트·조표·음높이·길이 읽기, 변환 권한 확인 게이트 및 CLI 출력. 4/4/고정 BPM/8마디·16분 그리드만 수용, 다른 박자·템포 변화·복수 성부·홀드 등은 014부터 별도 추가. 실제 교가 무단 다운로드/추출 금지.
- 테스트 `scripts/test-schoolband-stage013.cjs`는 게임 기존 `MELODY`의 원곡 28음과 JSON 원본을 완전히 대조. 생성한 직접 창작곡 MIDI 293바이트, MusicXML 3,698바이트에서 동일 28음 입력 재구성 및 CLI 출력 JSON 두 개를 실제 생성. **312개 이벤트 초/틱 비교**와 **336개 MIDI/MusicXML 피치·시각·길이 검사** PASS, 최대 MIDI 템포 반올림 오차 **0.01333ms**, 허용 0.02ms 이내.
- **권리·오염 21종 거절**: 허가 증빙·범위·만료·원본 ID 실패, MIDI 손상·SMPTE·음표 종료 오류·3/4박자, MusicXML 외부 ENTITY·음높이·박자·템포 변화·복수 성부·불완전 마디 등이 실제 거절됨.
- **CI:** [run 45007172102](https://github.com/noam0127/beagu-index/actions/runs/45007172102) **SUCCESS**, 검증한 코드 SHA `2dcbb132f5159ea4400f467cb200866130b7d371`. PC 1280px·320px Chromium에서 기존 멜로디 28음과 데이터 파일이 같고 최초 8음의 실제 Web Audio 예약 시각이 동일함 확인. 012 오디오 노드 중단·010 음색·005 판정 시간 회귀 PASS.
- **증거:** [생성 MIDI/MusicXML·권리 JSON·변환 결과 2개·통합 결과 JSON 총 6개 파일](https://github.com/noam0127/beagu-index/actions/runs/45007172102/artifacts/14748485389). 실제 ZIP 다운로드하여 `unit.passed=true`, PC/mobile `passed=true`, `failure` 없음 확인.
- 7개 전문 **AI 역할 검토**, 원본 시각·피치 보존·권리 확인 및 음향/저작권 한계는 `docs/schoolband-stage013-music-events-midi-musicxml.md`에 기록. 실제 인간 전문 청음·iOS 실기·제3자 교가 사용 권한 검증 미수행.
- 다음 단계 **014/030 — 다양한 교가를 위한 록 편곡 규칙**: 복수 박자·템포·당김음 일반화 및 창작 예제의 편곡 재현성·화성 충돌 탐지. 실제 학교 교가 편곡 공개는 허가된 실자료가 있어야 가능(022~023).

## 014/030 — 다양한 교가를 위한 록 편곡 규칙 (2026-11-22)

상태: **COMPLETE — 4/4·3/4·6/8·5/4 혼합 박자, 곡 중간 BPM 변환, 원본 멜로디 보존, 4악기 자동 록 반주·화성 오류 감지, seed 재현성·24개 위험/오류 주입, 2곡의 실제 OfflineAudioContext 디지털 합주 PCM/클리핑 0, 기존 013·012·010·005 회귀 전체 PASS.**

- 사용자 원본 014/030(054~056) 기준. 시작 `schoolband-playtest` HEAD `a54001b921f7b2e4210adf60ba1223a3b770d67d`. 운영 `main`, `baeguindex.com`, 운영 Supabase 및 실제 학교 교가에는 손대지 않았다.
- 신규 엔진 `scripts/schoolband-rock-arranger-v1.cjs` (`schoolband-rock-arranger-v1.0.0`): MIDI 480PPQ, 16분 120tick 단위, 다양한 박자표로 누적 마디 길이 계산, 템포 변경 위치별 적분으로 tick→초 변환. 원곡 멜로디의 음높이·tick·길이·velocity 불변. 기타/드럼/베이스/키보드 4종 자동 반주, 코드 장·단3도·5도 일치 검사, 6/8의 점4분음표 묶음강세/당김음, 반주만 ±4ms seed 기반 결정적 humanization, 역할별 미리보기 음량 프리셋 생성.
- 2개 자체 창작 입력 중 신규 `games/nangam-schoolband-v08/charts/original-variable-meter-exercise.input.v1.json`(4/4→3/4→6/8→5/4→4/4, 106→126→92→114BPM, 8마디·28음)을 추가. 예전 원곡 `original-anthem.music-events.v1.json`(4/4, 108BPM, 8마디·28음)도 새 엔진으로 편곡. 두 작품 모두 저작권 상태 `demo_original`과 `publicRelease:false` 유지, 실제 학교 교가 무허가 자료는 사용하지 않음.
- 원곡 자동 편곡 출력 **200개 이벤트(멜로디 28·드럼 88·베이스 36·기타 24·키보드 24), 15,360tick·17.77777778초**. 복합 예제는 **185개 이벤트(멜로디 28·드럼 78·베이스 31·기타 24·키보드 24), 13,920tick·16.48863751초**. 복합곡 미터 변경 4번·템포 변경 3번, 멜로디 당김음 11개 및 기타 당김음 8개 검증. 템포 변경을 가로지르는 원곡 음 7,080~7,440tick의 누적 길이 **0.44513458초** 직접 검산.
- `scripts/test-schoolband-stage014.cjs`는 동일 입력+seed의 완전 같은 JSON·SHA-256, 다른 seed의 반주 발음 시차 변화·원곡 선율 불변, CLI 편곡 출력 2개, 외부/무허가·거짓 권리·변형 박자·겹침·그리드·음정·화성 충돌 등의 **24개 오염 사례 거부** PASS.
- **CI [run 45007939153](https://github.com/noam0127/beagu-index/actions/runs/45007939153) 전체 SUCCESS**, 시험한 코드 커밋 `7630732e7535371e4a08e39c9716ac7ef762e4f9`. 독립 실행 Chromium OfflineAudioContext 렌더: 원곡 **200개 소리 소스, 최대 −13.1132dBFS**; 복합곡 **185개 소리 소스, 최대 −13.6689dBFS**, 양쪽 **PCM clipped=0·NaN/Inf=0**. 이것은 전용 시범 미리듣기 합성의 피크이지 실제 운영 게임·기기 스피커 청음 수치가 아니다.
- 같은 CI에서 Stage013 원본 28음 MIDI/MusicXML 변환·권리, Stage012 오디오 중단, Stage010 기존 기타·드럼 음색, Stage005 정확한 타이밍 판정의 순수 회귀 **전부 PASS**.
- [실제 결과 ZIP](https://github.com/noam0127/beagu-index/actions/runs/45007939153/artifacts/14748775791)은 직접 다운로드해 편곡 JSON 2개, 동일 결과 CLI JSON 2개, 통합 결과 JSON 1개 **총 5개 파일**과 수치 대조. 7개 전문 역할의 독립 **AI 검토**·화성/강세/권리/데이터 제약은 `docs/schoolband-stage014-variable-meter-rock-arrangement.md` 기록.
- 초기 2회 검사 실패는 **6/8 강세 분류 오류**와 **부정 테스트 악보 자체의 잘못된 tick 양자화**를 발견한 것으로 수정 후 전부 PASS. 다른 절차를 건너뛰거나 원본 악보·실제 교가를 변경하지 않음.
- **한계:** 기존 013단계의 MIDI/MusicXML importer는 여전히 고정 4/4·고정 BPM만 직접 수입한다. 014의 복합 박자·템포·당김음 지원은 정규화된 JSON 원본에서 동작하는 록 편곡 엔진에 구현됨. 새 편곡 이벤트를 실제 4악기×5난이도 게임 노트로 매핑·공개하는 것은 **015** 단계, 제3자 학교 교가의 실제 이용 허락은 **022~023**, 인간·실물 모바일 청음 검증은 **027**단계에 남아 있다.
- 다음은 **015/030 — 자동 악기별 차트 생성·곡 등록 품질 게이트**.

## 015/030 — 자동 악기별 차트 생성·곡 등록 품질 게이트 (2026-11-22)

상태: **COMPLETE — 2개 직접 창작곡의 4악기×5난이도 총 40개 차트 생성, 986개 음악-노트 근거 검증, PC·모바일 40회 실제 Chromium 게임 완주/160회 키 정타, 20개 오류·공개 차단 시나리오 및 기존 014/008/005 회귀 PASS.**

- 사용자 제공 원본 30단계 지침의 **015/030(원본 057~060)** 기반. 시작 브랜치 `schoolband-playtest` SHA `4a84caf85ff93e861313e470903ad2ce1584b14e`; `main`·실제 운영 웹·운영 Supabase 변경 없음.
- **실제 구현:** `scripts/schoolband-chart-generator-v1.cjs`가 014단계의 자체 창작 편곡 5개 파트 이벤트를 4·4·3·5레인에 결정적으로 매핑. `easy/normal/hard/very_hard/extreme` 5단계에서 모든 레인 유효노트 1개 이상·엄격 증가·하위 차트 계승·2개 동시타격 이하를 강제. 드럼 탐·기타 고음 리프 2가지 파생 음색은 원본 이벤트의 `source` 및 `transform` 필드에 근거·변환을 표기하여 출처를 숨기지 않음.
- **음악-노트 QA:** 원본 곡 20개 차트와 014 복합박자 자체 창작곡 20개 차트의 전체 **986개 차트 노트**를 실제 `startTick/startSeconds/pitch/role/part` 음악 이벤트와 대조. 원곡 소스 편곡 200이벤트, 복합곡 185이벤트. 그 가운데 54개 재음색/옥타브 변환은 명시적인 변환 라벨과 독립 source 메타데이터를 보존. 원곡 기본 리듬·음정과 반주 휴머니제이션 ±4ms의 차이를 분리 기록.
- **난이도별 노트 수:** 원곡 기타 7/11/15/19/24, 드럼 26/40/54/69/88, 베이스 11/16/22/28/36, 키보드 6/7/10/12/16. 가변 박자 원곡은 기타 7/11/15/19/24, 드럼 23/35/48/61/78, 베이스 9/14/19/24/31, 키보드 6/7/10/12/16. 각 5단계에서 노트 수가 엄격히 증가하며 모든 레인에 유효 노트 존재.
- **시험 게임 통합:** `games/nangam-schoolband-v08/index.html`에 `loadGeneratedTrial`·`clearGeneratedTrial` 내부 QA API 추가. 이 경로는 기존 창작 108 BPM 4/4·8마디 곡, private QA 등록/권리 비공개 검수 조건에서만 허용. 생성 차트의 실제 시각·레인·피치를 기존 `hit`, `animate`, `AudioContext` 오디오 스케줄러에 연결. 편곡의 실제 멜로디·자동 3파트를 재생하고 선택 악기는 사용자가 정확히 쳤을 때만 소리가 남. 일반 사용자·학교 기존 내장 차트와 운영 웹은 변경 없음.
- **실제 Chromium 40회:** PC 1280px와 모바일 에뮬레이션 320px에서 창작 연습 원곡 4악기×5단계 **각각 20게임**, 총 **40게임** 전부 정상 종료. 생성 차트의 모든 노트 `t/lane/pitch`를 데이터 JSON과 1:1 대조, 매 게임 선택 악기 전체 레인에서 키보드 실제 입력 정타 확인(**각 화면 80회, 총 160회**), hit 오디오 이벤트·멜로디 자동 반주·선택 악기 자동 연주 0건·진행률 100% PASS.
- **안전한 비공개 등록:** 차트 `registration.status=qa_passed_private`, `publicApproved=false`, `publicRelease=false` 및 **generated→reviewed→private_trial_approved** 감사 3단계 이력. 실제 웹 공개는 `requestPublication`에서 무조건 차단. 잘못된 차트 버전·음원/차트 해시·권리·피치·시각·난이도·검토·등록 시도 등 고의 오류 **20종 거부** PASS. 저작권자의 실제 확인/철회 등 022~023 단계는 미실행·BLOCKED.
- **GitHub Actions:** [run 45008771103](https://github.com/noam0127/beagu-index/actions/runs/45008771103) **completed/success**, 실제 CI 검증 소스 SHA `b1adcf285ced8b00e0f8bb26768373ac0c71f136`. 기존 014 편곡의 24개 오염·악보 시간 테스트, 008 20조합 N레인 데이터, 005 판정 98·좌표 121·FPS 28개 회귀 모두 PASS.
- [실제 아티팩트 결과 ZIP](https://github.com/noam0127/beagu-index/actions/runs/45008771103/artifacts/14749121106) 다운로드 확인: `results.json`, 자체 창작곡 편곡 JSON 2개, Private QA 카탈로그 2개, CLI 재생성 카탈로그 2개, **총 7개 파일**. `unit.passed:true,charts:40,chartNotesChecked:986,convertedRevoicings:54,publicReleaseBlocked:true`; Chromium `browser.length:40`, JS 오류 및 `failure` 없음.
- **7개 독립 AI 전문 역할 관점/위험 및 데이터·저작권 확인:** `docs/schoolband-stage015-chart-registration-gate.md`. 두 자체 창작곡 중 가변 BPM/복합박자 노트는 전수 생성·데이터 타이밍 QA까지만 수행했고, 이를 기존 고정 108 BPM 실시간 게임에 잘못 탑재하지 않도록 제한했다. 실제 모바일 실기 청음·Human 유저 난이도 검증은 027단계, 실제 교가 공개 권한은 022~023단계.
- 다음 단계 **016/030 — 핵심 3화면과 악기별 레인 즉시 전환**.

## 016/030 — pending
‘학교 선택 → 악기 선택 → 연주’만 전면에 남기고 장황한 설명과 개발자용 정보는 접는다. 학교 검색, 악기 선택 후 4/4/3/5레인 즉시 전환, PC 및 320px 모바일 UI 화면 캡처·스모크 검증을 진행한다.
