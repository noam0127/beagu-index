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
