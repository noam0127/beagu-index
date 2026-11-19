# 배구지수 Lv.2 추천 자동 승급 — 1차 개발·운영 보류

> **2026-11-19 인증 정책 변경:** 이 문서에 포함된 1차 고유번호 직접 로그인 설계는 **폐기**되었습니다. 이제 Lv.2는 **추천 1건으로 자동 승급**하고, **원래 인증 기기에서는 회원가입 없이 이용**, **다른 기기는 Lv.2 이후 선택적으로 만든 아이디·비밀번호(Supabase Auth)로 접속**합니다. 고유번호는 그대로 발급·보존하지만 **로그인 자격증명으로 사용할 수 없습니다**. 기존 1차 Google Forms·Apps Script 설치 절차는 그대로 유지합니다. 개발·운영 적용 지침은 [Lv.2 인증 정책 v2 및 2차 구현 계획](lv2-auth-v2-design-and-phase2-plan.md)을 우선합니다.

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

## 2차 구현 안내 — 신규 인증 정책 v2 우선

**구 정책 중 폐기:** `beagu-referral-v1`의 `action=login(identityCode)` 및 `beagu_referral_auth(p_identity_hash)` 직접 고유번호 로그인을 앞으로 구현하거나 켜지 않는다. 1차 개발 브랜치에 남은 직접 로그인 코드/테스트는 **2차 개발에서 제거·교체해야 하며 지금 배포해서는 안 된다**. 기존 `login_enabled`은 영구 false로 유지한다.

**유지:** 추천 1건 집계 및 프로필의 Lv.2 권한, 기존 발급 고유번호 3종, 레벨1 인증, 설문 링크, Apps Script/Forms 설치 절차, 원본 조사 데이터와 공개 기록.

**새로운 계정 정책:** Lv.2로 승급한 기기는 서버의 소유자·기기 증명으로 바로 이용. Supabase Auth 정식 계정은 사용자가 원할 때에만 **기존 인증 기기에서** 만들 수 있다. 다른 기기는 아이디·비밀번호로 로그인한다. 고유번호만 보유한 사람에게 계정을 자동 연결하지 않는다.

**보안:** 운영중 UUID-only 조회 취약점은 기존 기기/기존 번호를 보존하는 방식으로 차단해야 하며, 이전 고유번호에는 충분한 소유권 증거가 없을 수 있음을 전제로 기존 사용자 확인 절차를 설계한다. 고유번호 직접 로그인 API가 삭제되고 새 계정/기기 체계가 통합 테스트되기 전에는 서비스 플래그를 켜지 않는다.

모든 파일별 변경 대상, 기기 인증/본인확인 설계, 이메일 확인·재설정, DB 변경, 단계별 테스트/배포 게이트는 **[Lv.2 인증 정책 v2 및 2차 개발 실행 설계](lv2-auth-v2-design-and-phase2-plan.md)** 참조.

