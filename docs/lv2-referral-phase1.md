# 배구지수 Lv.2 추천 자동 승급 — 1차 개발·운영 보류

2026-11-19. **이 브랜치는 개발·검증용이며 main 병합·실서비스 Edge 배포 금지.**
구글폼 연결 검증 전이고, 기존 고유번호 발급 API에 UUID 소유자 증명 부재가 발견되었기 때문이다.

## 사용 규칙

- 챌린지에서 개인 고유번호 + 별도 초대 링크를 발급한다.
- 동료가 `survey.html?ref=...`를 열면 기존 공식 Google Form의 추천 확인값과 브라우저 UUID를 *사전 입력*한다.
- 응답 시트의 기존 설치형 제출 트리거가 기존 집계를 수행하면서 별도 추천 검증을 요청한다.
- 유효한 추천 1명으로 Lv.2를 부여한다. 여러 명에게 같은 초대 링크를 보내도 권한은 1회만 승급한다.
- 개인 고유번호는 서버에서 SHA-256으로 대조한다. 권한은 코드 문자열 자체가 아닌 비공개 profile의 access_level을 사용한다.
- 기존 공통 Lv.1 코드와 학교별 집계, 원본 설문, URLs는 보존한다.

## 1차에 실제 완료한 것

- Supabase 비공개 테이블 `challenge_referral_settings`, `challenge_referral_profiles`, `challenge_referral_events`, `challenge_device_claims` 설치.
- 기존 `beagu_level_sessions`에 nullable 소유자 연결 컬럼 2개를 *추가만* 함.
- `beagu_referral_enroll`, `beagu_referral_credit`, `beagu_referral_auth`, `beagu_issue_challenge_identity_bound` service-role 전용 함수 설치.
- 3개 플래그 **public_enabled / ingest_enabled / login_enabled = false**. 미완성 기능은 비활성화.
- 신규 `beagu-referral-v1` Edge Function 소스만 개발 브랜치에 준비. **배포하지 않음**.
- 기존 `beagu-challenge-identity`의 UUID-only 조회를 막을 **교체 소스** 준비. **운영 Edge에는 미적용**.
- 웹 초대 UI·사전 입력 URL·레벨2 별도 검색 화면은 개발 브랜치에만 존재.
- 기존 2026 집계 스크립트에는 추천 연결을 비차단형으로 연결한 수정본 준비, 운영 Google Apps Script에는 아직 적용하지 않음.
- 기존 코드 3종(긴 BG26 5묶음, BG26 6+6, 10자리 문자/숫자)을 모두 수용하는 신규 코드를 작성.
- 트랜잭션을 모두 되돌리는 DB 단위 테스트에서 등록/타기기 차단/1회 승급/중복 무효/레벨 조회 확인. GitHub Actions 브랜치 전용 테스트 준비.

## 핵심 파일

| 목적 | 파일 |
| --- | --- |
| 전체 DB 추가 설치 | `supabase/migrations/20261119_lv2_referral_phase1.sql` |
| 등록 플래그 잠금 | `supabase/migrations/20261119_lv2_referral_guard.sql` |
| 기존 코드 안전 발급 준비 | `supabase/migrations/20261119_lv2_device_proof_preparation.sql` |
| 추천 접수와 고유번호 인증 | `supabase/functions/beagu-referral-v1/index.ts` |
| 발급 API 교체 예정 소스 | `supabase/functions/beagu-challenge-identity/index.ts` |
| 기존 전체 Apps Script 수정본 | `scripts/beagu-2026-noon-sync.gs` |
| 추가 Apps Script 파일 (Referral.gs) | `scripts/beagu-2026-referral-addon.gs` |
| 사전 입력 폼 entry ID 설정 | `js/referral-form-config.js` |
| 문항 링크 만들기 | `js/survey-referral-v1.js` |
| 1차 검사 | `tests/lv2-referral-phase1.mjs` |

## 사용자 Google Forms 작업 (1차)

기존 설문을 편집하고 **단답형, 필수 응답 꺼짐**으로 아래 두 문항을 새로 추가한다.
제목은 띄어쓰기까지 완전히 일치해야 하며 **기존 문항의 제목·순서·선택지·설문 URL은 변경하지 않는다.**

1. `BG26 추천 확인값 (자동 입력)`
2. `BG26 기기 확인값 (자동 입력)`

두 항목을 **단답형, 필수 아님**으로 설정하면 기존 설문 일반 참여는 영향을 받지 않는다. Google Forms에는 *진정한 숨김 필드가 없다*. 사전 입력값이 응답자에게 보이고 변경 가능하므로, 추천 UUID의 일치/불일치만으로 같은 실제 사람 여부를 완벽히 검증할 수 없다. 기존 설문 응답 시트에는 이 두 열과 다른 설문 답이 같은 행에 저장된다. Supabase 추천 원장에는 설문 답·학교·이름·메일을 저장하지 않는다.

### 사전 입력 링크에서 entry ID 찾기

Google Forms 편집 화면 우상단 `⋮`에서 **사전 입력 링크 가져오기(Get pre-filled link)**를 선택한다. 추천 확인값 칸에 `AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`(43자), 기기 확인값 칸에 `12345678-1234-4123-8123-123456789012`을 입력하고 링크를 생성·복사한다. **예시값으로 설문을 제출하지 않는다.**

URL의 `entry.123456789=<A가 43자>`에 붙은 숫자 `123456789`가 추천 확인값의 **tokenEntryId**이고, `entry.987654321=<UUID>`의 `987654321`가 **deviceEntryId**다. 숫자는 예시이므로 추측하지 말 것. 두 ID 또는 사전 입력 링크를 개발자에게 전달한다. 그러면 `js/referral-form-config.js`에 반영한다. 현재 둘 다 빈 값이라 추천 경로는 연결되지 않는다.

## 사용자 Apps Script 작업 (1차)

1. 기존 설문 응답 시트 `1T_rEz1LqX97pC9gOv33SRmspK2IizTU3wFtxA8P1pC4`의 **확장 프로그램 → Apps Script**를 연다.
2. 기존에 `BEAGU26`와 `onBeagu2026FormSubmitted`가 정의되어 있는 파일만 **브랜치의 `scripts/beagu-2026-noon-sync.gs` 전체 수정본**으로 교체한다. 나머지 기존 파일(특히 MBTI 집계용)은 수정·삭제하지 않는다.
3. Apps Script에 새 스크립트 파일 `Referral.gs`를 만들어 `scripts/beagu-2026-referral-addon.gs` 파일 **전체 코드**를 붙여 넣는다. GitHub의 `.gs` 파일 내용은 Apps Script 편집기에 일반 텍스트로 붙여 넣을 수 있다.
4. 저장하고 실행 함수 선택에서 `installBeagu2026ReferralBridge`를 골라 **한 번 실행**한다. 필요한 Google 계정 권한을 승인한다. 성공 시 실행 로그에 `추천 문항 및 기존 제출 트리거 확인 완료`가 나온다.
5. 기존 `BEAGU_2026_INGEST_TOKEN`, `SUPABASE_PUBLISHABLE_KEY` 속성은 수정하거나 공유하지 않는다. `onBeagu2026FormSubmitted`을 수동 실행하지 않고, 예시값으로 가짜 응답을 제출하지 않는다.

이 설치 함수는 기존 제출 트리거가 존재하면 **그대로 재사용**하며 추가 트리거를 만들지 않는다. 현재 추천 Edge 미배포이고 ingest 플래그도 꺼져 있어 이 단계에서 실적 집계·승급이 발생하지 않는다. 추천 함수에서 오류가 나도 별도의 예외 처리로 기존 Q01~Q17 집계는 계속된다.

## 2차 필수 안전 검토·배포 순서

- 신규 발급 API의 UUID-only 기존 코드 유출을 막기 전까지 **login_enabled=false 유지**. `beagu-challenge-identity` 운영 Edge 교체, 기존 코드 복구 UX, 방문자 UUID 기반 미발급 코드 선점 가능성도 점검한다.
- 기존 코드 평문은 기존 비공개 원장에 남으며, 신규 프로필에는 코드 해시만 저장한다. 기능 공개 전에는 기존 UUID-only API로 이미 유출되었을 가능성이 있는 코드를 검토해야 한다.
- Google Forms 사전 입력 ID 확인 후 `js/referral-form-config.js` 값 연결, URL/실제 응답 시트 열 이름 확인.
- 신규 `beagu-referral-v1` Edge 함수를 **verify_jwt=false + 내부 명시 인증 헤더 검증**으로 배포. Google Apps Script 기존 서버 비밀키는 그대로 사용.
- 브라우저 코드발급/등록/신규 폼 제출/중복 제출/타 기기/기존 코드 3종/레벨1 공통코드/레벨2 6시간 세션 만료와 로그아웃을 통합 검증한다.
- 관리자 승인 후 **ingest → public → login** 순서로 플래그를 단계적으로 켠다. 본인 코드 직접 로그인 공개 전에는 기존 발급 보안이 안전해야 한다. 권한 회수는 `challenge_referral_profiles.disabled`와 관련 레벨 세션 삭제가 필요하고, 향후 **재발급** 기능은 새 코드 해시 등록·옛 코드 무효화·해당 사용자의 세션 철회·브라우저 코드 교체를 원자적으로 처리하는 관리자 전용 함수와 절차를 구현해야 한다. 이 재발급 UI/API는 1차 미완료.
- 추천받은 Google Forms 익명 제출로는 실제 서로 다른 교사임을 증명할 수 없다. 동일 UUID 및 이벤트 재사용만 방어 가능하고, 브라우저 데이터 삭제·여러 기기·값 수동 변경은 막을 수 없다. **완벽한 본인 확인이라고 안내하지 않는다**.
- 유효 추천 진행률은 원장상 0 또는 1이며, 자동 갱신은 다음 로그인·챌린지 진입 시 다시 조회하도록 설계했다. 별도의 실시간 푸시 기능은 없다.
