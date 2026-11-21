# 관리자 v2.0 — 회원·챌린지 연결 감사 (2026-11-22)

## 조사한 코드
- `supabase/functions/beagu-admin-members-v1/index.ts`: Auth 회원 목록, 상세, 정지/복구; 현재 참여 순번·추천 수는 반환하지 않음
- `supabase/migrations/20261121103000_beagu_postit_member_auth.sql`: `public.beagu_postit_member_accounts`에 `auth_user_id`, `identity_visitor_id`, `author_uid`, `status`, `linked_at` 저장
- `supabase/migrations/20261121000100_referral_short_codes.sql`: 비공개 `challenge_referral_profiles`와 `challenge_identity_codes`를 `campaign,visitor_id`로 결합
- `docs/challenge-identity-code-2026.md`: 참여 순번/고유번호는 비공개 원장에 기록; 고유번호 단독 인증 금지

## 확인된 연결 경로
`auth.users.id` → `beagu_postit_member_accounts.auth_user_id` → `identity_visitor_id` → 비공개 2026 챌린지 원장 `visitor_id`.

이 연결은 검증된 Lv2 계정에 대해서만 적용 가능하다. 계정이 연결되지 않은 챌린지 참여자는 회원 레코드와 자동으로 결합하지 않는다.

## 후속 개발을 위한 보안 계약
1. 관리자 조회 API에서만 연결 정보를 조합한다. 브라우저 Data API에 비공개 테이블 직접 조회 권한을 주지 않는다.
2. 기존 관리자 MFA/AAL2/활성 세션 검사와 서버 역할 검사를 재사용한다.
3. 회원별 조회는 인증된 Auth 계정의 명시적 1:1 연결만 사용한다. 이메일, 닉네임, 참여코드의 유사성으로 추정 결합하지 않는다.
4. 추천 수는 서버에서 검증한 `valid_referrals`만 표시하고, 추천 대상의 개인정보를 기본적으로 반환하지 않는다.
5. 정지/연결 해제/추천 무효화가 반영되도록 매 조회 시 서버 상태를 확인한다.
6. 목록에는 참여코드 원문·방문자 UUID·기기 해시를 반환하지 않는다. 상세정보는 최소한의 필드만 제공하고 조회 감사 기록을 검토한다.
7. 익명 설문 응답과 추천 연결의 근거가 없는 경우 '미연결/확인 불가'로 표시한다.
8. 기존 관리자 회원 API의 4,000명 상한은 전체 회원 수로 오인하지 않도록 별도 개선한다.

## 구현 전 검증 항목
- 현재 DB의 테이블/컬럼·제약과 코드 간 일치 여부를 읽기 전용으로 확인
- Lv2 연결/미연결/정지/추천 무효/타 계정 방문자 충돌 테스트
- 비관리자/미인증/aal1 요청 거부 테스트
- 개인정보 최소화와 운영 데이터 변경 없음 검증

이 문서는 설계 감사 기록이며 API 기능 구현·배포·실데이터 검증 완료를 뜻하지 않는다.
