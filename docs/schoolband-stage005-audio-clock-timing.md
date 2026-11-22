# 『난감한 스쿨밴드』 — 005/030 공통 오디오 시간축·판정 경계 검증

**날짜:** 2026-11-22 KST. **대상:** `schoolband-playtest`의 `games/nangam-schoolband-v08/index.html`; 운영 `main`, baeguindex.com 및 운영 Supabase 리소스는 변경하지 않는다.

## 원본 요구 및 실제 변경

원본 30단계 마스터 프롬프트 005/030(원본 021~023)은 `AudioContext.currentTime` 공통 기준, 노트 스폰·낙하 좌표 순수 함수, PERFECT·GOOD·MISS 경계 바로 앞뒤의 수치 검증, FPS와 무관한 시간축을 요구한다.

- `// BEGIN SCHOOLBAND_TIMING_MODEL_V1`와 `// END SCHOOLBAND_TIMING_MODEL_V1` 구간을 독립 JS 순수 모델로 분리했다. 내부에 DOM, `window`, `AudioContext`, `Date.now`, `performance.now`, `requestAnimationFrame`, 타이머는 존재하지 않는다.
- `noteTimeSeconds(bar,sixteenth)`: `(bar*4 + sixteenth/4)*BEAT`; 원본 108BPM 8마디와 16분음표를 초 단위로 계산. 차트 노트와 오디오 스케줄러가 **동일 함수**를 사용한다.
- `noteDeltaSeconds(noteTime,songTime)`: 기준 초 차이. `nowSong()`은 기존과 동일하게 `ctx.currentTime-beginning`을 반환한다.
- `noteYForDelta` 및 `noteYAtAudioTime`: 화면 프레임 간격이 아닌 노트 시간과 현재 AudioContext 곡 시간을 입력받아 좌표를 계산한다. 1.16초 프리뷰·240 canvas px 이동·24px 노트 두께의 기존 003단계 개선 값 유지.
- `judgementForOffset(offset,tierIndex)`: 절댓값 `<= PERFECT`면 `perfect`, PERFECT 초과하면서 `<= WIDTHS`면 `good`, WIDTHS 초과면 `outside`. 노트를 누르는 `hit` 함수는 이 모델의 결과만 사용한다.
- `isNoteMissed(noteTime,songTime,tierIndex)`: `songTime-noteTime > WIDTHS`인 경우만 MISS. 즉 GOOD 최후 경계에서 정확히 누르면 여전히 GOOD 가능하며 1µs라도 지나면 MISS 영역으로 분류.
- 매번 같은 AudioContext 곡 시각에서 테스트할 수 있도록 `getTimingRules`, `getTimingModel` 읽기 전용 테스트 인터페이스를 추가했다. 점수/밀도/난이도/음색/공개 데이터 정책은 변경하지 않는다.

## 판정 임계치 (원본 값 유지)

| 난이도 | PERFECT: ±초 포함 | GOOD 최대: ±초 포함 | 이후 MISS |
| --- | ---: | ---: | --- |
| EASY | 0.090 | 0.200 | 실제 노트 시각 + 0.200초 초과 |
| NORMAL | 0.075 | 0.170 | + 0.170초 초과 |
| HARD | 0.060 | 0.140 | + 0.140초 초과 |
| VERY HARD | 0.050 | 0.110 | + 0.110초 초과 |
| EXTREME | 0.036 | 0.075 | + 0.075초 초과 |

**경계 가정:** 일찍 누르는 경우와 늦게 누르는 경우를 같은 절댓값 규칙으로 판단한다. 단, 일찍 누르고 실패한 뒤 MISS 판정은 되지 않으며 노트의 **늦은 허용 경계**를 실제 재생 시간이 지난 후 발생한다. 정확한 `<=` 판정은 자바스크립트 부동소수점 범위에서 테스트하며 경계 ±0.000001초(1µs) 입력을 사용해 바로 앞/뒤를 확인한다. 여타 클라이언트 실제 입력의 1µs 물리 정밀도를 뜻하지 않는다.

## 자동 검증 및 증거 규격

- 단일 명령: `node scripts/test-schoolband-stage005.cjs` — 게임 HTML 인라인 JavaScript 구문 컴파일, 순수 모델 추출·부작용 금지, 전체 난이도의 PERFECT/GOOD/MISS 임계값 + 1µs 앞뒤, 비정상 값·음수·양수 입력, 8마디 차트 시각·노트 좌표·108BPM, 30/60/90/120Hz에서 같은 음악 시각의 일관성 검사.
- 고의 실패 검출: `EASY GOOD` 0.200초를 0.195초로 바꾼 **메모리상의 테스트 사본**이 반드시 실패해야 한다. 게임 파일 자체는 손상시키지 않는다.
- Chromium 실브라우저 추가: `node scripts/test-schoolband-stage005.cjs --browser` — PC 1280×900 및 모바일 320×640, 게임에 배포된 실제 순수 함수의 5난이도 판정 경계, Canvas 좌표, 실제 `AudioContext.currentTime` 기반 재생 진행 240ms 안팎, JavaScript 오류 0건.
- CI 워크플로 `.github/workflows/schoolband-stage005.yml`: 순수 단위→Chromium→기존 20조합 회귀 순서. 이전 003·004 워크플로도 게임 파일 변경 트리거로 자동 재실행.
- 결과: `artifacts/schoolband-stage005/timing-boundary-results.json`에 수치/브라우저 로그·한계 기록. 이 JSON은 GitHub Actions artifact로 보존한다.

## 7개 전문가 관점별 독립 점검 (AI 역할 검토이며 외부 인간 감수 아님)

| 관점 | 확인한 문제 → 수정 제안 | 실제 검증 방법 | 남은 위험 |
| --- | --- | --- | --- |
| 리듬게임 | 노트 탐색과 MISS 판정이 각각 별도 숫자 계산 → 공통 함수로 합쳐 시간 경계 모순 방지 | 각 난이도 양·음 오프셋, PERFECT 및 GOOD 경계 ±1µs, MISS 정확한 경계 테스트 | 같은 레인에서 서로 가까운 노트의 선택 정책과 보정 UI는 006 |
| 오디오 엔진 | 스케줄러와 차트 계산이 서로 다른 산식을 쓰면 미세 드리프트 위험 → 하나의 `noteTimeSeconds` 사용 | 시간축 8마디·128분할과 실시간 `AudioContext` 진행 비교 | 기기별 물리 출력 지연과 예약 노드 취소는 006·012 |
| 연출 | FPS 기반 좌표 갱신은 주사율 차이에 따른 시각 어긋남 가능 → 순수 `noteYAtAudioTime` 사용 | 30/60/90/120 가상 타이밍에서 동일 AudioContext 표본에 동일 좌표 | 고부하에서 실제 프레임 드랍의 시각적 지각은 007·028 |
| 모바일 UI·접근성 | 폰 터치의 이벤트 도착 시점은 Web Audio 기준과 다를 수 있음 → 일단 단일 엔진 시간으로 고정 | 320px Playwright 모바일 에뮬레이션에서 판정 경계와 오디오 시작 | Android/iOS 실기 지연·보정은 006·027 |
| 학교 데이터·보안 | 공통 시간 유틸이 학교 데이터 API 호출을 추가하면 안 됨 → 순수 모델만 추출, 공개 API 그대로 | 게임의 네트워크·학교 조회 변경 없음, Stage 002 20조합 mock 회귀 | 실데이터 RLS 감사 019 |
| 교가 편곡·저작권 | 곡 박자/템포 바꾸며 편곡 권리 문제가 생길 수 있음 → 창작 교가 108BPM 28음 보존 | 8마디, 28음 및 기존 `PARTS` 데이터 불변 검사 | 다른 템포·박자 지원 013·014, 실제 교가 허락 미확보 |
| QA·배포 | 단순 브라우저 플레이 성공만으로 정확 경계 보장 불가 → 순수 함수와 강제 오염 검사, CI | 5난이도 수치표·고의 실패 감지·GitHub run + 002/003/004 회귀 | Headless Chromium을 물리 기기 검증으로 과장하지 않음; SB-007 남음 |

## 검증 결과

**PENDING** — 실제 CI 로그·코드 SHA·아티팩트를 확인한 뒤 이 절을 업데이트한다. 실패 시 005/030 종료하지 않는다.
