# 관리자 v2.0 회원·챌린지 연결 DB 검증 — 2026-11-22

## 실행 범위
운영 Supabase에 SELECT 전용 질의 두 건만 실행했다. DDL/DML, Edge Function 배포, GitHub Pages 배포는 수행하지 않았다.

## 확인한 스키마
- `public.beagu_postit_member_accounts`: `auth_user_id`, `identity_visitor_id`, `author_uid`, `status`, `linked_at`
- `beagu_private.challenge_identity_codes`: `campaign`, `visitor_id`, `participant_no`, `identity_code`, `issued_at`
- `beagu_private.challenge_referral_profiles`: `campaign`, `visitor_id`, `access_level`, `valid_referrals`, `upgraded_at`, `disabled`, 기타 해시/코드 필드
- `beagu_private.participants`: `campaign`, `visitor_id`, `participant_no`, `joined_at`

## 정합성 조회 결과
2026-11-22 읽기 전용 집계:
- 회원-챌린지 연결 레코드: **0**
- 참여 순번 연결 누락: **0**
- 추천 프로필 연결 누락: **0**
- 활성 회원 연결 중 추천 자격 미달: **0**

**주의**: 0건은 연결 데이터가 존재하지 않아서 나타난 결과다. 실제 회원 연결이나 API 기능의 정상 작동을 증명하지 않는다.

## 서버 API 확장 조건
1. 신규 관리자 RPC는 Auth 계정 ID로 필터링된 단건 결과만 반환한다.
2. `auth_user_id → identity_visitor_id → (campaign='2026',visitor_id)` 경로로만 결합한다.
3. 미연결/정지/추천 무효화 시 계정의 추천 정보와 참여 순번을 자동 추정하지 않는다.
4. `identity_code`, 방문자 UUID, 기기 해시, 추천 토큰은 API 응답에서 제외한다.
5. 관리자 JWT 검증, AAL2, 활성 MFA 세션 및 역할 검사를 서버에서 강제한다.
6. 공개 스키마의 privileged RPC는 PUBLIC/anon/authenticated 실행 권한을 회수하고 service_role만 실행하도록 검증한다.
7. 계정 연결이 1건 이상 생성된 후 연결 성공/실패/해제 사례로 회귀 테스트한다.

이 문서는 실제 운영 DB 스키마와 집계 확인 기록이며 기능 구현·배포 완료 보고가 아니다.
