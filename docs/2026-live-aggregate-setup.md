# 2026 배구지수 누적 참여횟수·참여학교 자동 집계 (2026-11-18)

## 집계 정의

- 2023–2025년 홈 화면 기준값: 누적 참여횟수 18,797회, 참여학교 4,177개교.
- 2026년 공식 설문: 2026-11-01 이후의 Google Forms 응답 행수. 사전 조사 및 시각 불명 응답은 제외. 같은 응답 이벤트가 두 번 실행돼도 원본에서 전체 재집계하므로 중복 가산하지 않음.
- **누적 참여횟수 = 18,797 + 2026년 공식 응답 행수**. 고유 교사 인원이 아님.
- **누적 참여학교 = 4,177 + 2026년에 처음 조사된 학교의 수**. 학교 ID 기준 2023–2025년 중 한 번이라도 조사된 학교면 새 학교로 계산하지 않음.
- 과거 원자료 `beagu_edited_school_rows`의 10건은 학교 ID가 비어 있음. 이 경우 지역+학교명 정규화로 보수적으로 대조하여 신규 학교 수가 부풀려지는 것을 방지.
- 2026 학교 매칭에 실패한 응답은 누적 참여횟수에는 포함되나 참여학교 추가에서는 **보류**. 학교 ID가 확인될 때 전체 재집계로 자동 보완.

## 코드와 보안

- Google Apps Script 소스: `scripts/beagu-2026-noon-sync.gs`
- 2026 공개 누적 숫자 전송: `supabase/functions/beagu-2026-public-count-ingest/index.ts` (JWT 검증 대신 32자 이상 비밀 토큰을 상수 시간 비교).
- 같은 Edge Function에 인증된 GET을 추가해 원본 스크립트로 **2023–2025년 과거 참여학교 ID 목록만** 전달함. 2026 개별 학교명, 학교 ID, 교사 응답, 자유서술은 서버에 전송하지 않음.
- 인증된 POST는 **전국 공식 응답 행수 + 새로 참여한 학교 수**만 서버로 전송하고 스냅샷을 갱신함. 기존 스크립트의 응답 행수만 담은 POST도 이전 버전 호환.
- 내부 테이블: `beagu_2026_public_progress` (일반 사용자 접근 불가). 공개 수치 전용: `beagu_home_cumulative_stats` (두 누적 숫자만 SELECT 가능, 익명 INSERT/UPDATE 불가).
- 홈페이지: `index.html`, `js/home-cumulative-stats.js`; 표시 중인 홈 화면은 30초 간격으로 숫자를 새로 읽음.
- 홈 방문자 수, 참여 인증 순번/XP, 고유 교사 수, 학교별 설문 상세 공개 여부와는 서로 다른 집계임.

## 운영 초기 상태

2026-11-18에 확인된 원본 공식 응답은 **1건**, 해당 학교는 2023–2025년 참여 이력이 있으므로 2026 신규 참여학교는 **0개교**. 따라서 최초 표시 값은 18,798회 / 4,177개교. 이것은 당시 원본 스냅샷이며, 향후에는 자동 집계 결과를 사용함.

## 운영자가 최초 1회 확인/설치할 사항

> GitHub 코드와 Supabase Edge Function은 반영되었으나, GitHub 커밋만으로 Google Apps Script의 라이브 코드 및 트리거가 설치되지 않습니다. 2026-11-18 확인 시 비공개 집계 MASTER의 `정오_실행로그`에는 헤더만 있고 자동 동기화 성공 기록이 없습니다.

1. 원본 [2026 배구지수 설문 응답 Sheet](https://docs.google.com/spreadsheets/d/1T_rEz1LqX97pC9gOv33SRmspK2IizTU3wFtxA8P1pC4/edit) → **확장 프로그램 → Apps Script**.
2. 기존 설치 스크립트/트리거를 먼저 백업. GitHub의 `scripts/beagu-2026-noon-sync.gs` 최신 코드를 실제 Apps Script 프로젝트에 반영. 동일한 이름의 함수를 중복 선언하지 말 것.
3. Apps Script → 프로젝트 설정 → 스크립트 속성: `SUPABASE_PUBLISHABLE_KEY`(공개용)와 `BEAGU_2026_INGEST_TOKEN`(32자 이상 비밀 토큰)을 확인. 같은 토큰이 Supabase Edge Function secrets에도 있어야 함. **토큰을 대화·GitHub·로그에 붙여넣지 말 것.**
4. 함수 `installBeagu2026Sync`를 **한 번** 실행해 Google 권한 승인, 원본 시트의 `onBeagu2026FormSubmitted` 제출 트리거와 `refreshBeagu2026Stats` 정오 백업 트리거 설치.
5. 비공개 MASTER `정오_실행로그`에 `SUCCESS` 및 `PUBLISHED` 상태, Apps Script 실행 기록에 오류가 없는지 확인. `PUBLIC_ERROR`는 HTTP 응답과 비밀 토큰을 점검.
6. Supabase에서 `select * from public.beagu_home_cumulative_stats where id=1;`로 누적 합계를 확인. 웹에서 값이 보이는지 확인. 테스트용 가짜 응답을 실제 설문에 넣지 말 것.

## 제한

- 실시간 갱신 속도는 Google Forms → Apps Script 실행 지연 + 브라우저 새로 읽기 30초를 합친 값임. 제출 즉시 반영을 보장하지 않음.
- 동일 교사의 **서로 다른 실제 응답 행**은 별도 검증이 없다면 각각 참여횟수 1회로 계산됨.
- 전체 신규 학교 수는 학교 매칭 품질과 과거 10건의 미확인 ID에 의해 보수적으로 집계됨. 매칭 오류를 임의로 신규 참여학교로 간주하지 않음.
- 기존 공개 자료 승인·학교별 결과 검수 정책은 변경하지 않음.
