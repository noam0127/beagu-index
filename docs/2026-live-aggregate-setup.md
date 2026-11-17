# 2026 배구지수 실시간 전국 응답 건수 연동 (운영자 설정)

## 구현 상태
- PostgreSQL `public.beagu_2026_public_progress` 테이블: 공개 조회 전용 RLS; 한 행의 전국 **접수 건수**만 저장
- Supabase Edge Function `beagu-2026-public-count-ingest`: 서버에서만 호출하며 비밀 토큰 검증
- Google Apps Script `scripts/beagu-2026-noon-sync.gs`: 비공개 재집계 성공 후 **전국 공식 응답 건수만** 푸시
- 홈페이지 `js/2026-form-count.js`: 공개 테이블에서 건수·동기화 시각만 읽음, 최초·복귀 시와 60초마다 갱신
- 기존 챌린지 순번/XP 및 유효 **교사 수**와는 서로 다른 지표

**주의:** 소스 파일 커밋과 Edge Function 배포만으로 Google Apps Script가 설치되는 것은 아닙니다. 이 문서의 설정을 해야 자동 갱신이 시작됩니다.

## 1. 비밀 토큰 설정 (관리자 수동 작업)
1. 암호관리자 또는 안전한 난수 생성기를 이용해 **최소 32자 이상**의 예측 불가능한 비밀 토큰을 하나 생성합니다. 토큰을 GitHub, 로그, 브라우저 JS, 공개 시트, 채팅, 문서에 붙여넣지 마세요.
2. Supabase Dashboard → 프로젝트 `snvzwrexuqavnfvzgxqj` → Edge Functions → Secrets에서 **`BEAGU_2026_INGEST_TOKEN`** 이름으로 생성한 값을 등록합니다. 서비스 역할 키를 여기에 복사하지 않습니다.
3. **원본 응답 Sheet** `1T_rEz1LqX97pC9gOv33SRmspK2IizTU3wFtxA8P1pC4` → 확장 프로그램 → Apps Script → 프로젝트 설정 → 스크립트 속성에 똑같은 **`BEAGU_2026_INGEST_TOKEN`** 을 등록합니다.
4. 기존 `SUPABASE_PUBLISHABLE_KEY` 가 설치되어 있는지 확인합니다. 없으면 웹사이트 `js/supabase-config.js` 의 **공개용** publishable 키만 등록합니다. `service_role` 키는 Apps Script에 등록하지 않습니다.

## 2. Google Apps Script 실제 설치
1. 먼저 기존 설치 스크립트·트리거 목록을 백업·확인해 중복 실행을 피합니다.
2. 기존 코드와 충돌하지 않게 GitHub의 `scripts/beagu-2026-noon-sync.gs` 최신 내용을 반영합니다. 다른 파일에 같은 이름의 함수를 중복 선언하지 않습니다.
3. `refreshBeagu2026Stats()` 를 수동 실행하고 Google Sheets·외부 요청 권한을 승인합니다. 이 함수는 2026-11-01 이전 테스트 응답을 제외합니다.
4. `setupBeagu2026FormSubmitTrigger()` 를 **한 번** 실행하여 원본 응답 Sheet 제출 트리거를 등록합니다.
5. `setupDailyNoonTrigger()` 는 선택적으로 매일 재동기화 보호용으로 사용합니다.
6. Apps Script 실행 로그 및 비공개 MASTER `정오_실행로그`에서 `SUCCESS`와 `전국 응답건수 PUBLISHED` 확인. `SKIPPED_NOT_CONFIGURED`면 토큰이 미설치, `PUBLIC_ERROR`면 Edge Function/연결 확인.

## 3. 검증
- 원본 Sheet 공식 시작일: **2026-11-01**. 시범 응답(이전 날짜) 제외.
- 응답 **행수**를 집계하며 동일 Google Forms 응답 이벤트가 두 번 전달되어도 원본 전체를 다시 세기 때문에 같은 행이 중복 추가되지 않음. 단, **동일 교사가 서로 다른 응답 행을 중복 제출**한 것은 별도 신원 검증 없이는 구분 불가합니다.
- Supabase SQL:
  `select official_submission_rows, refreshed_at from public.beagu_2026_public_progress where id=1;`
- 공개 페이지 `https://baeguindex.com/`에서 **2026 본조사 응답 현황**이 실제 숫자와 최신 반영 시각을 표시하는지 확인합니다.
- 운영 사이트의 실제 배포 및 제출 후 실행 성공 여부는 별도로 확인하세요.
- 새로운 가상 응답을 운영 설문에 넣어 시험하지 마세요. 실제 신규 응답이 생기지 않으면 수동 집계로 기존 원본만 재계산해 검증합니다.

## 4. 공개 범위와 제한
- 공개: *전국 공식 설문 제출 행수*와 반영 시각만. **1건부터 공개 허용**.
- 비공개: 학교명/학교 ID, 답변·선택지, 개별 문항 수치, 특이 학교 기록, 자유서술 및 응답 원문.
- 원본 설문과 비공개 집계 MASTER는 공개 공유하지 않습니다.
- 학교별 문항 공개는 별도 자료 신뢰성·재식별 검토 및 승인 정책을 거쳐야 합니다.
- 공개 테이블에는 개인정보도, 특정 학교별 결과도 삽입하지 마세요.
- 비밀 토큰이 누출되면 **두 곳 모두 교체**하고 이전 토큰을 폐기합니다.

## 5. 왜 아직 전국 실시간 통계가 표시되지 않을 수 있는가
비밀 토큰 미설정, Google Apps Script 소스 미반영, 제출 트리거 미설치, 기존 샘플 데이터만 존재, 비공개 집계가 오류로 중단 등입니다. 이 경우 홈페이지는 0건으로 잘못 표시하지 않고 `집계 연동 대기` 또는 `집계 확인 불가`로 표시합니다.
