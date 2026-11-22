# 『난감한 스쿨밴드』 007/030 — 주사율·탭 전환·판정 종합 검증

**날짜**: 2026-11-22 KST. **근거**: 사용자 첨부 `nangam-schoolband_30-step_master_prompt_v1.md` 007/030(원본 028~030): 60/90/120Hz **시뮬레이션**에서 같은 입력 판정의 일관성, 탭 전환·화면 잠금·오디오 중단·복귀 시 노트 일괄 MISS/음악-노트 드리프트 방지.

**대상**: `noam0127/beagu-index` 의 `schoolband-playtest` 시험 브랜치. 운영 `main`, `baeguindex.com`, Supabase 운영 DB·RLS·Edge Functions는 수정하지 않는다.

## 1. 실제 게임 코드 변경

1. **수동 일시정지·이어하기**: 단순한 연주 영역에 `Ⅱ 일시정지`/ `▶ 이어하기` 토글 버튼을 추가했다. 게임이 시작되어 있는 동안에만 사용할 수 있고, 종료 시 다시 비활성화한다. 좁은 화면(400px 이하)에서는 기존 3열 시작/중단/소리 UI를 2×2 격자로 배치해 터치 영역이 겹치지 않게 한다.
2. **공통 Web Audio 시간축 동결**: `pauseGame()`은 곡 스케줄러 타이머 및 requestAnimationFrame을 멈추고 `ctx.suspend()`를 요청한다. Web Audio `AudioContext.currentTime` 자체가 중단되므로 차트 시간·음악 반주·판정 시간 모두 함께 멈춘다. `resumeGame()`은 사용자가 **직접** 버튼을 누른 경우에만 `ctx.resume()`을 호출해 기존 `beginning` 및 차트 상태를 보존한 채 이어간다. 자동으로 음향을 재생하지 않는다.
3. **자동 백그라운드 감지**: `visibilitychange`에 따른 `document.hidden` 또는 bfcache `pagehide(persisted=true)`에서 즉시 일시정지한다. `pageshow(persisted=true)`에서는 복귀 메시지만 제공하고 이어하기는 사용자가 직접 누른다. 일반 `pagehide`는 페이지 종료/다른 문서 이동으로 판단해 중단한다.
4. **오디오 자체 중단 감지**: AudioContext `statechange`에서 예기치 않은 `suspended`를 감지하면 동일한 `pauseGame("audio")` 경로로 전환해 MISS 스캔을 중단한다. `hit()`은 paused 또는 Web Audio clock stopped 상태에서는 판정을 계산하지 않는다.
5. **이벤트 수신에 실패한 장기간 화면 정지 방어**: 예기치 않은 렌더링 정체 후 성능 시계 기준 1500ms 초과와 오디오 시계 650ms 초과의 **동시 점프**가 감지되면 `animate()`는 노트를 한꺼번에 MISS 처리하지 않고 연주를 **안전 중단**, 명시적으로 처음부터 다시 시작하라는 메시지를 보여준다. 곡을 어긋난 시간축으로 억지 재생하지 않는다.
6. **화면·접근성**: 일시정지 시 PAUSED 안내를 게임 캔버스 위에 표시하고 시작·중단·진동·악기 등 기존 정책은 유지한다. 브라우저의 `aria-live` 상태 메시지로 복귀 안내를 제공한다.
7. **남는 오디오 위험**: `AudioContext.suspend`는 같은 clock에서 이미 예약된 소리까지 멈춰 일시정지/이어하기를 보조하지만, 최종 종료 시 예약된 노드의 개별 stop/disconnect는 **아직 구현하지 않았다**. 이 작업은 012/030에서 반드시 해결한다.

## 2. 자동 검증 구성

- `scripts/test-schoolband-stage007.cjs`: 순수 수치 시뮬레이션으로 60/90/120Hz의 렌더링 간격에서 동일 곡 시각·입력 이벤트를 반영했을 때 PERFECT/GOOD/MISS가 같고, 같은 오디오 시각에서 좌표가 동일한지 검사한다. 고의로 모든 FPS를 60Hz로 간주하는 **틀린 프레임 기반 오디오 시계**를 주입한 경우 결과가 달라져 탐지되는지 확인한다.
- `node scripts/test-schoolband-stage007.cjs --browser`은 실제 Chromium, PC 1280px/320px 모바일 에뮬레이션에서 공통 AudioContext 수동 일시정지 및 750ms 대기, 이어하기, 다른 브라우저 탭 활성화/복귀, `AudioContext.suspend()`를 외부에서 일으킨 경우의 `statechange` 대응, bfcache/화면 잠금의 `pagehide(persisted=true)` **합성 이벤트 대리검사**, 1850ms 메인 스레드 정체 감지를 수행한다.
- **절대 시계 기준**: 멈춘 750ms 동안 `AudioContext.currentTime`의 보정된 곡 시각 이동은 35ms 미만, 노트 진행·차트 소비·MISS·점수·스케줄 커서가 변화하지 않아야 한다. 이어하기 후 처음 음악 시각이 점프하지 않고 일반 속도로 진행해야 하며 재시작 강요는 비정상적으로 긴 비가시 정체를 감지한 **예외**로 제한한다.
- 브라우저의 실제 탭 전환과 `pagehide` 합성 이벤트를 분리해 기록한다. 합성 bfcache는 **물리 스마트폰 화면 잠금과 동일하지 않다**. 실기 Android/iOS 화면 잠금 검증은 027/030에서 별도 수행해야 한다.
- CI `.github/workflows/schoolband-stage007.yml`: 순수 주사율 시뮬레이션 → PC·모바일 Chromium 라이프사이클 → 기존 005/002/006 자동 회귀. 결과 JSON·일시정지 캔버스 스크린샷은 `artifacts/schoolband-stage007/`에 보존.

## 3. 7개 전문가 관점별 독립 AI 검토

| 검토 관점 | 확인한 문제 → 수정 제안 | 실제 검증 | 남은 위험 |
|---|---|---|---|
| 1. 리듬게임 | 백그라운드 전환 중 `animate()`가 계속 돌거나 복귀 시 쌓인 노트가 MISS가 될 수 있음 → pause 플래그로 점수/노트 스캔을 먼저 차단 | paused 동안 MISS/score/remainingNotes/schedulerStep 불변, 60/90/120Hz 판단 일치 | 기기별 입력 이벤트의 실제 지연은 물리 장치로 측정 필요 |
| 2. 오디오 엔진 | 오디오만 멈추고 차트 시계가 계속 가면 음악/노트 불일치 → 같은 AudioContext의 suspend/resume 사용 | 실제 재생 AudioContext clock이 paused 동안 정지, resume 시 기존 곡 시각에서 증가 | Web Audio 예약 노드 종료·ghost sound 정리 012, 플랫폼별 state=interrupted 추가 확인 |
| 3. 연출·애니메이션 | 정지 중 노트/파편이 계속 움직이면 사용자가 재생 중인 것으로 오해 → RAF 중지, PAUSED 표시, 이펙트 정리 | 캔버스 일시정지 이미지와 효과 타이머 중단 | 실제 고주사율 장치의 체감 품질·광과민 위험은 018·028 |
| 4. 모바일 UX·접근성 | 잠금 해제 후 소리가 자동으로 다시 울리면 당황할 수 있음 → 수동 이어하기, 버튼 표시·2×2 모바일 | 320px 에뮬레이션 및 사용자의 복귀 클릭 필요 여부 확인 | Android/iOS 화면 잠금·OS 오디오 정책 실기 미검증 027 |
| 5. 학교 데이터·보안 | 오디오 복귀 코드가 학교 데이터를 재조회하거나 보정값을 서버로 보내면 안 됨 → 로컬 상태만 사용 | 가상 연습 학교/DOM만 사용하며 운영 API·DB 호출 또는 수정 없음 | 실제 API 공개 정책 RLS 감사 019 |
| 6. 교가 편곡·권리 | 재시작 때 악보/원곡 멜로디가 변하면 안 됨 → 기존 108 BPM 창작 28음/8마디 유지 | 002 전 조합 + 005 시간·밀도 회귀 검사 | 실제 학교 교가 이용 허락은 022~023 |
| 7. QA·배포 | 기존 자동 검사는 탭 전환·브라우저 프리즈를 재현하지 못함 → 독립 Playwright lifecycle regression + negative control | 실제 탭 활성화, 오디오 외부 suspend, 합성 pagehide, 메인 스레드 장시간 정체, CI 기록 | Headless Chromium은 물리 잠금 아님; SB-007 첫 방문 호스팅 이슈(029) |

> 위 검토는 **7개 역할로 분리한 AI 평가**이며, 실제 외부 전문가·인간 연주자가 참여했다는 뜻이 아니다.

## 4. 실제 실행 결과

**PASS — 정량 주사율, 수동 일시정지·재개, 가시성 대리 시나리오 및 장시간 프레임 정체를 실제 GitHub CI로 검증 완료.**

- **검증 완료 CI**: [run 44995247146](https://github.com/noam0127/beagu-index/actions/runs/44995247146), 상태 `completed/success`, 검증한 코드 SHA `963a6eeaada9badeac5c72500afb044296e735d9`. 이 커밋에서는 Safari 계열의 `AudioContext.state === "interrupted"`도 안전 일시정지로 감지하도록 확장했다. interrupted 상태의 **실제 iOS 기기 재현은 미수행**.
- [증거 아티팩트: results.json 및 PC/320px PAUSED 캔버스 2장](https://github.com/noam0127/beagu-index/actions/runs/44995247146/artifacts/14743408309). 실물 ZIP을 내려받아 JSON 및 모바일 PAUSED 스크린샷을 확인했다.
- **주사율 시뮬레이션 60·90·120Hz**: 프레임 수 `121/181/241`에서 동일 입력 5개 결과가 **PERFECT 4개 + GOOD 1개**, 미입력 1개가 MISS 1개로 **완전 일치**. 음원/화면 시간축 수치 일치 **15회 확인**. 고의로 `frameIndex/60`을 모든 화면에 적용하면 120Hz에서 유효 입력 5개가 모두 허용 범위를 벗어나고 6개 노트가 MISS 처리되는 오류를 검출, 테스트 인프라의 실패 감지 능력 확인.
- **수동 정지·이어하기**: PC 1280px 및 모바일 320px Chromium에서 각 750ms 이상 정지하고 Web Audio 곡 시계 이동 **0초**, MISS·점수·차트 완료 개수·스케줄 인덱스 증가 **0**. 음악을 이어가면 각각 약 **0.2409초**, **0.2293초** 재진행. 반복 입력으로 정지 중 점수를 취득할 수 없음. 게임 중 `Ⅱ 일시정지`와 `▶ 이어하기` 화면 작동 확인.
- **탭 전환/가시성**: 실제 Playwright 탭 `bringToFront()` 전환을 실행했으나 **헤드리스 Chromium에서 네이티브 `document.hidden` 변화는 2개 환경 모두 확인되지 않았다**(`native_visibility_event:false`). 이 차이를 숨기지 않고 `visibilitychange`를 **합성하여** 같은 백그라운드 처리 경로를 검사했고 800ms 동안 오디오 시계 이동 0초, 자동 재생 없음, 사용자 수동 복귀가 PASS. Playwright의 포커스 에뮬레이션이 원인인 것으로 판단되지만, 이를 물리 기기의 실제 화면 잠금 합격이라고 주장하지 않는다. 참고: https://github.com/microsoft/playwright/issues/41873.
- **외부 오디오 중단**: Chromium에서 실제 `AudioContext.suspend()`를 테스트 코드가 직접 실행하고, `statechange` 자동 일시정지 및 수동 이어하기가 PC·320px 모두 PASS. 곡 시계 동결 0초.
- **화면 잠금 대리**: `PageTransitionEvent("pagehide",{persisted:true})` 및 `pageshow`를 합성하여 BFCache/화면잠금에 해당하는 가시성 전환 처리 코드와 수동 재개를 검증. **실제 Android/iOS 화면 잠금은 검증하지 않았음**(027 단계).
- **1,850ms 예상치 못한 주 스레드 정체**: 별도 실브라우저에서 오디오 시계가 계속 진행하는 상황을 강제로 재현하고, `MISS=1 → 1`로 일괄 MISS 없이 안전 중단 후 처음부터 재시작 가능함을 확인. 이 경로는 곡을 자동 재개하는 것이 아니라, 오디오와 노트가 어긋날 위험이 있을 때 **명시적으로 중단**하는 보호 조치이다.
- **기존 기능 전체 회귀**: CI에서 Stage005(98개 판정·121개 좌표·28개 FPS 불변성·고의 실패), Stage002(창작 멜로디 28음·악기/난이도 20조합을 PC·모바일 각각 확인·가상 API 비공개 카나리), Stage006(214개 오프셋·레인 독립성·±120ms PC/모바일 브라우저) 모두 PASS. 해당 소스의 별도 Stage001·003·004 GitHub Actions도 **PASS**.
- **7개 전문가 역할 재판단**: 판정 결과는 프레임 카운트와 분리되었고, AudioContext가 지속 정지·재개될 때 차트가 보존된다. 다만 헤드리스 탭 가시성 대리검사의 한계, 실제 iOS `interrupted` 이벤트, 물리 오디오 출력·손가락 입력 지연, stop 시 예약 노드 해제까지 해결된 것은 아니다.
- **후속 미검증**: 실기(Android/iOS) 탭·화면 잠금·재개 027/030, 예정된 오디오 노드 최종 취소/유령 음 012/030, 고주사율 실기 렌더링·저성능 018/028/030, RawGitHack 최초 방문 경고(SB-007) 029/030. 운영 `main`/웹·Supabase는 변경하지 않았다.
