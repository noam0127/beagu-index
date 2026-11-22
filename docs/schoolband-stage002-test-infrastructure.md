# 난감한 스쿨밴드 002/030 — 개발 테스트 인프라·계측·데이터 경계

실행일: 2026-11-22 KST. 단계 목적: 원본 006~010을 통합하여 정적 문법, 실제 DOM, 20조합 노트 차트, 실패 감지, 입력/프레임 기준을 자동 검증한다.

## 실행 계약

- 게임 코드: \`games/nangam-schoolband-v08/index.html\` (001 기준 blob \`88d5ed2089498fc67c7e951a2af8cf1b6fb01635\`).
- 테스트: \`scripts/test-schoolband-stage002.cjs\`.
- 명령: 종속성 설치 이후 \`node scripts/test-schoolband-stage002.cjs\` 한 번으로 정적 검증 + 고의 실패 감지 + Playwright Chromium DOM 테스트 + JSON 계측 수행.
- 사전 설치 (CI에서 자동 수행): \`npm install --no-save --no-package-lock playwright\`, \`npx playwright install --with-deps chromium --only-shell\`. 테스트 명령은 운영 네트워크를 호출하지 않고 자체 HTTP 서버를 임시 포트로 띄운다.
- CI: \`.github/workflows/schoolband-stage002-test.yml\` (시험 브랜치 전용, 운영 브랜치 제외).
- 산출물: \`artifacts/schoolband-stage002/metrics.json\` 및 desktop/mobile320 스크린샷 (GitHub Actions artifact 보관). JSON은 실행 결과이며 실행 전 샘플 수치로 채우지 않는다.

## 검증 항목과 판정 규칙

| 구분 | 구체적 자동 확인 | 실패 시 |
| --- | --- | --- |
| JS 문법 | HTML에서 인라인 JS 추출, Node \`vm.Script\` 컴파일 | FAIL |
| 음악/패턴 | 자작곡 28음/8마디, 24px 노트, 4악기×5난이도, 레인 범위·누락, 예상 밀도 | FAIL |
| 고의 실패 검출 | 구문 오류, 24→20px 노트 훼손, 레인 번호 100 변조 후 검사기 **반드시 오류 감지** | 미검출 시 FAIL |
| DOM 스모크 | Chromium 1280×900과 모바일 320×640, 가상 학교 조회/선택, 악기 4개, 패드 3~5개, 20조합 생성, 시작·중지 | FAIL |
| 데이터 격리 | Edge Function 대신 route.fulfill로 가상 \`school_id\` 응답. 일부러 포함시킨 \`NEVER_PRINT_PRIVATE_002\` 필드가 화면에 표시되지 않아야 함 | FAIL |
| UI 오류 | JavaScript pageerror 없어야 함 | FAIL |
| 계측 | 악기 전환 JS 처리 시간, 입력 이벤트 발생→동기 핸들러 종료, next requestAnimationFrame, 44프레임 간격을 320px/데스크톱에서 수집 | JSON 기록 |

### 개인정보 및 외부 API 경계 (읽기 전용 소스 검사)

Supabase \`schoolband-school-read-v1\` ACTIVE v1을 다시 조회했다. 이 API는 GET/OPTIONS만 허용하며, 학교 목록 응답은 \`school_id\`, \`school_name\`, \`sido_standard\`만 통과시킨다. 세부 응답은 \`school_id\`, \`school_name\`, \`region\`, \`difficulty\`, \`eligible\`, \`source_year\`로 화이트리스트를 구성하고, 값의 자료형/길이·난이도 후보를 확인한다. 함수 소스에 service_role 접근 키는 발견되지 않았다.

이것은 **코드 수준의 공개 필드 검증**이며, 실제 운영 RLS, 업스트림 익명 접근 권한, 외부 응답 캐싱, 부하, 네트워크 수집 전체에 대한 완전한 침투 검증이 아니다. 테스트는 생명력 있는 사설 응답을 조회하지 않는다.

### 성능/입력 지연 측정 원칙

- 측정 장소: GitHub Actions ubuntu-24.04 / Chromium headless. 실행마다 CPU 및 부하가 달라지므로 절대 품질 인증값으로 해석하지 않는다.
- \`instrument_switch_ms\`: \`performance.now\` 앞뒤에서 악기 클릭→동기 DOM 업데이트 완료를 측정. 20샘플/화면.
- \`input_dispatch_to_handler_ms\`: 합주 시작 후 12회 합성 PointerEvent 생성→핸들러 반환 측정.
- \`dispatch_to_next_raf_ms\`: 위 이벤트 뒤 다음 rAF까지 대기 12회.
- \`frame_interval_ms\`: 연속 45 rAF 스탬프의 44개 간격.
- 자료는 median, p95, max(ms)와 표본수 n을 기록한다. 실제 터치 하드웨어 지연이나 귀에 들리는 소리의 오디오 출력 지연을 측정하는 것은 **아니다**. 이 둘은 단계 006·027에서 별도 수행한다.
- 단계 002는 기준선 기록을 목표로 하며 성능 합격 임계치 설정/튜닝은 단계 018·028에서 진행한다.

## 7개 독립 전문 관점별 검토

| 관점 | 확인한 문제 → 수정 제안 | 실제 검증/증거 | 남은 위험 |
| --- | --- | --- | --- |
| 1. 리듬게임 | 단순 한 난이도 성공으로 다섯 난이도를 보장할 수 없음 → 20차트 전수와 빈 레인 검사 | 실행 코드의 20조합 생성 및 검사 | 실제 노트 판정 공정성은 005~007 |
| 2. 음향 | DOM 응답속도는 오디오 지연과 다름 → rAF/JS 시간과 오디오 출력 지연을 구별 | 성능 메트릭 분리 설계, AudioContext 시계 원칙 확인 | 실제 청음·지연 027 |
| 3. 연출 | 24px 노트가 회귀로 얇아질 위험 → 고의 20px 변조 테스트 | 부정검사에서 오류 감지 필수 | 화면 캡처 가독성 003 |
| 4. 모바일 UI | 3레인과 5레인은 화면 폭 영향이 다름 → 320px 에뮬레이션 포함 | 캔버스/버튼/학교 검색 자동 동작 | 실제 기기/회전 017·027 |
| 5. 데이터/보안 | 공개 값에 민감 필드 섞일 위험 → 가상 비공개 카나리·API 화이트리스트 점검 | 서버 소스 read-only 점검 + DOM 카나리 누출 테스트 | RLS/업스트림 공개 기준 별도 검증 019 |
| 6. 편곡/권리 | 음악 차트 검증과 실제 학교 교가 권리는 다름 → 28음 원곡만 테스트 | 자작곡 데이터 고정, 외부 교가 수집 없음 | 허락된 실제 교가 확보 022~023 |
| 7. QA/배포 | PASS만 만드는 형식적인 테스트 위험 → 3종 고의 실패와 CI artifacts | 실패 감지 테스트와 단일 실행 명령 | 실제 호스팅 첫 방문 안내(SB-007) |

## 실행 결과 기록 (CI 검증 후 이 절만 갱신)

- **상태:** PENDING — GitHub Actions 결과를 본 뒤 기록한다. 성공 이전에 002단계종료 선언하지 않는다.
