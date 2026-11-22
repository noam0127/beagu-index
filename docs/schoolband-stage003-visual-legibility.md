# 『난감한 스쿨밴드』 003/030 — 24px 노트·N레인 가독성 및 임팩트 검증

기준: 원본 011~015 작업을 003/030에 통합. 기록일: 2026-11-22 (KST).

## 변경 범위와 수치적 원인

- 파일: `games/nangam-schoolband-v08/index.html` (운영 `main` 파일이 아닌 별도 `schoolband-playtest` 전용).
- 게임 기본 시간축·판정 기준은 유지: 108 BPM, 각 16분음표 `60/108/4 = 0.1388889s`. 노트 위치는 단일 `AudioContext.currentTime`에서 얻는 `nowSong()`에 따라 결정한다.
- 기존 낙하 구간 240 내부 px / 1.40초 → 초당 171.43px. 16분음표 간격 **23.81px**, 24px 노트의 내부 경계가 **0.19px 겹칠 수 있었다**.
- 변경 낙하 구간 240 내부 px / 1.16초 → 초당 206.90px. 16분음표 간격 **28.74px**, 약 **4.74px 내부 여백**. 320px 모바일에서는 캔버스 CSS 축척에 따라 이 간격도 줄어들지만 노트 경계는 겹치지 않는다.
- 노트 자체는 24px 높이 유지: 캔버스 `rounded(x+4,y-12,lw-8,24,7)`. 단색 광택을 gradient + 흰색 윤곽선(1.4px) + 상단 하이라이트로 교체; 그림자 강도는 9→6으로 절제. 판정선은 그대로 유지한다.
- 5레인 키·이름 내부 라벨의 글꼴 크기/대비를 보강했다. Pad 3~5개 동작과 키바인딩은 변경하지 않는다.
- 레인 발광이 60FPS 기준 `lanePulse-=.075`이던 상태에서 `performance.now()+175ms` 만료 기준으로 변경됐다. 따라서 주사율이 달라도 동일한 발광 유지시간을 목표로 한다.
- 파편 생존시간과 화면 흔들림의 계산도 `Date.now`가 아닌 `performance.now`로 통일해 시스템 시계 변경 영향을 줄였다. 파편의 **60개 상한**은 유지.
- PERFECT/GOOD CSS 재생성 코드를 유지하여 연타 때 애니메이션 클래스가 재시작하도록 한다. 실제 다중 노트 처리 개선은 다음 004단계.
- 소리의 예약/중단 로직, 음색, 차트 데이터, 공개 학교 조회 및 점수는 수정하지 않았다.

## 테스트 절차

- `scripts/test-schoolband-stage003.cjs`: baseline Git 커밋 `582fc4fb3f92e93c6841209a864dfb3377b0b73f`의 원본 HTML과 현재 수정 HTML을 각각 가상 학교 API와 함께 같은 Chromium 환경에서 실행.
- PC 1280×850, 모바일 CSS 320×640 에뮬레이션: 5레인 EXTREME의 무겹침 버튼 범위, 가로 오버플로 없음, 실제 canvas 이미지 픽셀 대비, 24px 두께/1.16초 미리보기, 화면 캡처(before/after).
- 정확한 타격 연출: 드럼 EXTREME에서 연속 16분음표 간격의 하이햇 3개를 실제 `AudioContext.currentTime` 진행에 맞춰 `pointerdown`으로 타격. 각 타격의 점수/판정/시각 효과 재시작, 각 레인 잔여 발광시간 및 `particles <= 60` 확인.
- 전수 회귀: 기존 `scripts/test-schoolband-stage002.cjs` 4악기×5난이도 20조합, `scripts/check-schoolband-baseline.cjs` 이전 버전의 문법/DOM/호스팅.
- GitHub Actions: `.github/workflows/schoolband-stage003.yml`.
- CI artifacts: `artifacts/schoolband-stage003/results.json`, 4개 before/after 캔버스 이미지와 임팩트 이미지.
- 외부 실기 장치는 여기서 직접 시험하지 않음. Chromium 모바일 emulation은 iOS/Android 실기 인증이 아니다.

## 7개 전문가 관점 (AI 역할별 독립 리뷰)

| 관점 | 확인한 문제 | 수정 제안/반영 | 검증 증거/잔여 위험 |
| --- | --- | --- | --- |
| 리듬게임 | 108BPM 16분음표 24px 노트끼리 살짝 붙음 | 낙하 속도 조정으로 4px 이상 내부 여백 | 간격 수학/실제 차트 및 캔버스 테스트; 다른 곡 템포 추후 |
| 음향·오디오 엔진 | 연출 시간과 오디오 판정 시계 혼용 위험 | 판정·좌표는 AudioContext 유지, 시각 FX만 monotonic clock | 히트 시 실제 오디오 시계 사용; 실제 청음 미검증 |
| 연출·애니메이션 | 5레인 밀집 상황 식별력·발광 프레임 의존 | 대비·윤곽선·175ms 시간기준 레인 발광·파편 cap | 눈에 보이는 스크린샷 비교; 광과민/감소 움직임 후속 004 |
| 모바일 UI·접근성 | 320px 화면에서 내부 px가 CSS 축소됨 | 라벨 대비 높이고 버튼 안 겹침 확인 | 에뮬레이션 화면·폭/높이 계측; 실기 멀티터치 017·027 |
| 학교 데이터·보안 | 게임 화면 개선이 응답 정보에 영향을 줄 위험 | 학교 API·RLS·차트/점수 무변경 | 기존 002 mock 공개 학교 테스트 재통과 요구 |
| 교가 편곡·저작권 | 임팩트 개선 과정 실제 교가를 무단 삽입할 위험 | 기존 창작 교가 28음 유지 | 소스·메타데이터 불변; 실제 학교 허가 미취득 |
| QA·배포 | 외부 호스팅 캐시와 원본 비교가 불명확할 위험 | 고정 baseline SHA vs 현재 branch의 자체 HTML 브라우저 실행 | CI run+스크린샷+커밋 기록, 운영 `main` 무변경; SB-007 남음 |

## 실제 검증 결과

- **003 자동 검증 PASS**. GitHub Actions [run 44987172112](https://github.com/noam0127/beagu-index/actions/runs/44987172112), 검증된 코드 커밋 `3e26edb33f652b7e3174ca7ba8e235c054c39c68`.
- 아티팩트: [before/after 4장 + rapid-hit 1장 + results.json](https://github.com/noam0127/beagu-index/actions/runs/44987172112/artifacts/14740332848). 실제 Chromium에서 생성한 이미지를 열어 비교·검수했다.
- 원본 1.40초 미리보기에서 16분음표 간격 **23.81px(24px 노트와 -0.19px 중첩)**. 변경된 1.16초 미리보기에서 **28.74px(+4.74px 간격)**. 108 BPM, 실제 음악 데이터·판정 시계 불변.
- Chromium 1280×850와 320×640 브라우저 레이아웃 각각 전·후 비교 PASS: 5개 키보드 패드 모두 폭 32px 이상/높이 68px 이상, 터치 영역 겹침 0건, 수평 오버플로 0건. 320px 장치의 실제 캔버스 CSS 폭은 **282px**, 24 내부 px 노트의 환산 높이 약 **17.8 CSS px**. 작은 화면의 신체적 접근성은 실기 검증 필요.
- Canvas 현재 픽셀 검사 PASS: 5레인 note 중심점 `rgba(177,247,205,255)` (PC·모바일 동일 내부 캔버스 좌표), 테스트의 명암 기준 통과.
- EXTREME 드럼 16분음표 하이햇 3개 연속 입력 PASS: 실제 AudioContext 기준 t=0.139/0.278/0.417초, 판정 결과 **PERFECT 3회, 점수 3,030점**; 세 타격 모두 별개 CSSAnimation 객체로 새로 시작, 각 레인 발광시간이 다시 175ms로 초기화됨. 파편 개수는 11→22→31개로 60개 제한 준수.
- 초기 실행에서는 `CSSAnimation.startTime`이 headless Chrome에서 `null`로 조회되는 문제가 있었고, 이를 애니메이션 객체의 정체성·상태 검증으로 수정했다. 실제 게임 코드에서도 CSS 애니메이션을 취소한 뒤 새로 만드는 방식을 추가했다. 테스트 기준을 낮춰 통과 처리한 것이 아니라 실제 재시작 객체 생성을 검증했다.
- 기존 001/002 회귀: stage002 20조합 검증 [run 44987077478](https://github.com/noam0127/beagu-index/actions/runs/44987077478) PASS; stage001 리다이렉트 포함 스모크 [run 44986934152](https://github.com/noam0127/beagu-index/actions/runs/44986934152) PASS. 독립 시험 호스트는 첫 방문 확인 화면(SB-007)이 남아 있음.
- 제한: Android/iOS 실기 미검증, 실제 오디오 출력 지연·배터리/광과민 감수는 아직 수행하지 않음(후속 004·027·028). 중앙 PERFECT/GOOD 표시의 동시타격 구분은 004단계로 인계.
