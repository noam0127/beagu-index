# 개인별 전용 설문 링크 · 1단계 (2026-11-20)

## 현재 운영 상태
- 공식 2026년 Google Form의 추천 토큰 문항 및 원본 응답 트리거 연동은 **아직 확인되지 않았다**.
- 이 단계는 **준비용 PR**이다. 사용자가 실제 링크를 공유하도록 권유하지 않는다.
- `beagu_private.challenge_referral_settings`: `public_enabled`, `ingest_enabled`, `login_enabled` 모두 **false** 유지.
- `BEAGU_REFERRAL_LINK_ENABLED` 함수 환경변수가 문자 `true`가 아니거나 `BEAGU_REFERRAL_HMAC_KEY` 서버 비밀키가 32자 미만이면 `REFERRAL_NOT_READY`를 반환하고 기기증명·DB 승인 기록을 변경하지 않는다.
- 기존 313개 `beagu_private.challenge_identity_codes` 기록은 변경하지 않는다.

## 관련 구현
- `supabase/functions/beagu-referral-link-v1/index.ts`: Lv.1 세션 검증 → (활성화 후) 기존 고유번호+기기증명 검증 → 결정론적 서버 HMAC 토큰 발급 → 서비스 역할로 `beagu_referral_enroll` 호출.
- `challenge.html`, `js/challenge.js`, `js/challenge-referral-v1.js`: 챌린지 개인 코드 영역 아래 신규 전용 조사 링크 UI; 캡처 이미지에서 제외.
- `survey.html`: 기존 학교별 조사 링크 지원을 보존하고 ref 파라미터를 통한 추천이 아직 인정되지 않는다는 사실을 명시.

## 출시 전 필수 작업
1. 원본 Google Form 소유자 권한으로 추천 토큰 단답형 문항 추가; 사전입력 링크의 `entry.<id>` 식별자 확보; 응답 시트에 별도 원본 컬럼 생성 확인.
2. 새 설문 응답의 추천 토큰, 제출 이벤트, 응답자 중복 단서를 검증하고 서버간 비밀키로 `beagu_referral_credit` 호출하는 ingestion API 구현. 교사 응답 내용·자유 서술은 추천 API에 전송하지 말 것.
3. 설문 제출 이벤트와 연결된 Apps Script 트리거 설치 확인. 제출 시도 실패 시 기존 정오 집계 및 학교별 24시간 공개 파이프라인이 중단되지 않도록 분리.
4. 실제 응답 1회는 테스트 환경에서 재현하고, 중복 이벤트 재처리·동일기기·다른 추천인·다른 브라우저·악성 위조 링크·Lv1/Lv2 계정상태 테스트. 운영 설문에 허위 응답 생성 금지.
5. `survey.html`을 정식 Google Form 사전 입력 링크로 안전하게 연결하고 end-to-end 응답 귀속을 입증.
6. 별도 `BEAGU_REFERRAL_HMAC_KEY` (최소 32자) 비밀키 관리·회전 정책을 구성한 뒤 순서대로 발급 게이트, `public_enabled`, `ingest_enabled` 활성화. 최종 계정 등록과 타 기기 사용 시 고유번호만으로 접근 허용하지 않도록 분리.
7. 운영 페이지와 DB에 승급이 실제 반영되는지 보고서로 검증.

## 안전 주의
- 추천 링크 URL은 개인 고유번호 자체가 아니라 불투명 토큰을 담는다.
- HMAC은 서버 전용 `BEAGU_REFERRAL_HMAC_KEY`만 사용하며 서비스 역할 키와 분리되어 있다. 서명키가 바뀌면 기존 링크 토큰이 달라지므로 회전 전 마이그레이션이 필요하다.
- 기존 `beagu-challenge-identity` 발급 API가 **클라이언트 방문자 UUID**를 단독 신뢰하는 부분은 별도 보안 부채이며 레거시 313건의 복구·소유 검증 경로를 확보한 뒤 교체해야 한다.
- 현재 단계의 기기증명은 추천 링크 발급 동작에만 적용된다. 정식 Lv2 로그인 계정은 별도의 소유자 확인이 필요하다.
- Google Forms 사전 입력 토큰은 응답자가 조작할 수 있다. 따라서 사전 입력 값만으로 승급시키면 안 된다.

## 2단계 구현 (분리형 · 미활성화)
- `supabase/functions/beagu-referral-checkin-v1/index.ts`: 공식 웹 랜딩에서 익명 브라우저 UUID+추천 링크 토큰을 받아 24시간 한정 HMAC 확인코드(Proof) 생성. `BEAGU_REFERRAL_CHECKIN_ENABLED=true` 및 전용 HMAC 키 없으면 거부.
- `supabase/functions/beagu-referral-ingest-v1/index.ts`: Apps Script 전용 비밀 토큰으로 요청 인증. Google Form 제출 응답 ID·서명 확인코드·제출시각만 받아 기간/서명 검증, 기존 `beagu_referral_credit` RPC에 이벤트·방문자·추천 토큰 해시만 전송. `BEAGU_REFERRAL_INGEST_ENABLED=true` 및 `ingest_enabled=true` 전에는 인정 불가.
- `scripts/beagu-2026-referral-integration.gs`: **사용자가 소유자 권한으로 명시적으로 호출할 때만** `prepareBeaguReferralFormField`로 선택적 문항 설치. `installBeaguReferralFormSubmitTrigger`로 **Forms 고유 제출 ID가 있는 FormTrigger** 설치. 기존 `onBeagu2026FormSubmitted` 집계 트리거는 수정하지 않음.
- `js/beagu-referral-form-config-v1.js`: `entryName:''`로 배포, 설치 전에는 추천 동의/사전입력 URL 비활성화.
- `js/beagu-referral-form-v1.js`, `survey.html`: 동의한 경우만 랜딩 → 서명된 인증코드 → Google Forms 사전 입력 링크 이동. 응답 내용은 웹에서 읽지 않음.
- `supabase/functions/beagu-referral-link-v1/index.ts`: 서버의 기존 1건 승급 상태가 조회될 때 인증 세션은 **Lv.2(임시)**만 반영, 정식 Auth 계정으로 간주하지 않음.

### 소유자 설치 순서 (아직 실행 안 됨)
1. 원본 [2026 공식 설문 응답 시트](https://docs.google.com/spreadsheets/d/1T_rEz1LqX97pC9gOv33SRmspK2IizTU3wFtxA8P1pC4/edit)와 Forms 원본을 백업.
2. 응답 시트의 확장 프로그램 → Apps Script에 `scripts/beagu-2026-referral-integration.gs`를 새 별도 파일로 추가.
3. `prepareBeaguReferralFormField()`를 소유자가 수동 실행하고 권한 승인. 로그의 `entry.<숫자>`를 `js/beagu-referral-form-config-v1.js`의 `entryName`에 반영하고, 로그의 공식 Form 공개 URL이 `formUrl`과 동일한 설문인지 확인·수정. 새 Form 문항이 일반 응답자에게는 **선택 항목**이며 기존 답변을 훼손하지 않음을 확인.
4. `BEAGU_REFERRAL_HMAC_KEY`(별도 서명키 32자 이상)을 링크·체크인·잉제스트 3개 함수에 동일하게 설정; `BEAGU_REFERRAL_INGEST_SECRET`(32자 이상 비밀키)을 Supabase 잉제스트와 Apps Script 속성에 동일하게 설정. 비밀키를 GitHub 코드, 대화, 외부 로그에 쓰지 않음.
5. 소유자가 `installBeaguReferralFormSubmitTrigger()`를 실행하여 Form 전용 제출 이벤트 연결 (기존 스프레드시트 트리거는 보존). 실행 로그에서 오류 없음 검증.
6. 안전한 별도 테스트 폼/프로젝트에서 동일 로직으로 정상 제출, 중복 제출, 자기 추천, 수정된 Proof, 재처리, 만료, 비동의 경로를 검증. 실제 본조사에 가짜 응답을 제출하지 않음.
7. 문제없으면 public gate / checkin gate / ingest gate 및 DB 설정을 단계적으로 활성화하고 실제 1건의 자발적 설문 응답을 끝까지 확인한 후 운영 확대.

### 운영 이전에 해결할 개인정보·부정 참여 정책
- **익명 브라우저 UUID는 고유한 실제 사람임을 증명하지 못한다.** 동일 기기·같은 응답 ID의 반복은 막지만 시크릿 모드·다른 기기·재설치까지 막지는 못한다. 서버의 `same_device`와 `duplicate_respondent` 결과를 실명 검증으로 표현하지 말 것.
- Google Forms에 추가된 사전 입력 응답은 사용자가 수정할 수 있다. HMAC은 임의 수정/재사용의 일부를 방지하지만 동일 인물의 새 브라우저 등록까지 막지 않는다.
- 설문 참여는 익명을 유지한다. 선택적 추천 코드는 개인이 동의한 경우만 전달하며 실제 응답 내용과 결합해 사용자에게 보여주지 않는다. 비동의 일반 설문에 불이익 없음.
- **현재 상태는 '자동 Lv2 승급 완료'가 아니다.** Form 문항 변경·트리거·운영 비밀키 설정은 사용자의 Google 권한으로 별도 수행해야 한다.
