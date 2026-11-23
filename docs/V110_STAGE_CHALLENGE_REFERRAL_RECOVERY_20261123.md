# 배구지수 v1.1.0 — 챌린지 코드·추천 API 시험 복구 (2026-11-23 KST)

> **운영 승격 NO-GO.** 개발 브랜치 `fix/v110-staging-edited-api-recovery-20261123`와 시험 Supabase `ycwuugggqbunlbwuzvbx`에서만 작업. 운영 GitHub `main` SHA `b2460e47aa53c9e06ffc3899fad21aa63cae94bb` 및 운영 DB·웹은 변경하지 않음.

## 완료한 실제 작업

1. 비공개 기존 스키마 `beagu_private.participants`, `challenge_identity_codes`, `challenge_device_claims`를 확인. 운영 설문이나 참여자 데이터는 복사하지 않음.
2. 시험용 원자적 발급 RPC `public.beagu_stage_issue_challenge_bound` 생성: Lv1+ 웹 세션 SHA-256 일치·만료·방문자 UUID·기기 SHA-256·한 세션 한 방문자 바인딩 검사. 동시 발급은 DB 잠금으로 직렬화, 10자리 무작위 코드 재발급 멱등성 유지, 기기 불일치/타인 방문자/무효 세션 거부. `SECURITY DEFINER`이며 `anon`·`authenticated` 직접 EXECUTE 철회.
3. GitHub `js/challenge.js` 수정: 기존 `js/challenge-referral-v1.js`의 `beagu-referral-device-secret-v1` 저장 키를 함께 사용해 최초 발급부터 32바이트 난수 기반 기기 비밀을 전송. 비밀값을 URL·GitHub 로그·프로덕션에 저장하지 않음.
4. 시험용 Edge `beagu-challenge-identity` v1 ACTIVE 배포: 운영 프로젝트·운영 Origin 거부, 정확한 로컬 또는 개별 Render 도메인만 허용. Lv1 세션을 먼저 확인하고 소유권 RPC를 호출.
5. [GitHub Actions #45089094875](https://github.com/noam0127/beagu-index/actions/runs/45089094875) **성공**: 클라이언트 JS syntax, 소스 보안 게이트, 실제 OPTIONS/CORS·무인증·무효세션 HTTP. 시험 DB [SQL 트랜잭션 검증](https://github.com/noam0127/beagu-index/blob/fix/v110-staging-edited-api-recovery-20261123/tests/sql/staging-challenge-bound-rollback-20261123.sql)으로 동일 번호 재사용, 교차 방문자/기기·무효 세션 거부를 직접 확인 후 ROLLBACK.
6. 추천 관련 비공개 RPC `beagu_issue_challenge_identity_bound`, `beagu_referral_enroll`, `beagu_referral_short_issue`, `beagu_referral_short_resolve`의 시험용 소스와 기본 비활성 설정 테이블 복원. 모든 `SECURITY DEFINER`의 브라우저 EXECUTE 제한.
7. 시험용 Edge `beagu-referral-link-v1`, `beagu-referral-checkin-v1` v1 ACTIVE 배포. **그러나** `BEAGU_STAGING_REFERRAL_VERIFIED` 미설정 및 `public_enabled=false` 때문에 본 기능 `REFERRAL_NOT_READY`. 별도 HMAC 비밀값/설문 검증 완료 전까지 활성화하지 않음.
8. [GitHub Actions #45089400570](https://github.com/noam0127/beagu-index/actions/runs/45089400570) **성공**: 두 추천 API에서 운영 출처·Origin 없는 요청·GET 거부, 미승인 시 503 `REFERRAL_NOT_READY`를 실제 시험 HTTP로 증명. 이는 **추천 성립·Lv2 실승급 테스트 통과를 의미하지 않음.**

## 정식 배포 차단 상태

- 독립 시험 웹 참조 API **16개 중 13개 배포**, 남은 미배포 **0개**(배포돼도 잠금 5개):
  `beagu-2026-review-admin`, `class-diary-guest-access-v1`, `class-diary-progress-v1`.
- **배포됐으나 잠긴 2개**: `beagu-referral-link-v1`, `beagu-referral-checkin-v1`. Google Forms 단순 방문/체크인이 아니라 *실제 유효 응답 제출*을 검증해야 Lv2를 인정함.
- `scripts/staging/audit-frontend-edge-functions.py`에 `feature_gates` 지원을 추가해 **MISSING 3 + LOCKED 2**를 각각 출력하고 모두 E2E readiness NO-GO로 판단.
- [GitHub Actions #45089523784](https://github.com/noam0127/beagu-index/actions/runs/45089523784) **성공**: 독립 시험 웹 24쪽 소스 검증, 39개 Edge 함수 목록, 미배포 3/잠금 2 검출, 미완료 기능을 출시 불가로 차단.
- 최종 시험 DB 기록 조회: 참가자 0, 고유번호 0, 기기 클레임 0, 추천 프로필/이벤트/퍼널 0, Lv1 세션 0. 기본 추천 기능 설정은 false.
- 2026-11-23 시험 보안 어드바이저 WARN은 **기존 별도** `public.beagu_perf_record_v1`의 익명·회원 `SECURITY DEFINER` 실행 가능성 2종; 이번에 복구한 발급·추천 RPC의 직접 실행 권한은 차단 확인. [관련 Supabase 보안 린트](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable).

## 아직 검증·승인되지 않은 사항

- 실제 Lv1 이메일 인증·기기별 브라우저 고유번호 양성 E2E, 기존(레거시) 고유번호 소유자의 기기 전환·복구 흐름.
- Google Forms의 실제 유효 제출을 프라이버시 보존 방식으로 검증하는 서버 프로세스 및 전용 HMAC/환경변수 설정. 이 검증 전 추천 플래그·설정은 임의로 true로 바꾸지 않음.
- 회원 Lv3, 관리자 MFA, 전국 학교 데이터 노출 검토, 독립 호스팅 Render 호스트 E2E, PC/모바일/장애 복구/보안 회귀.
- 운영 웹·운영 Supabase 및 GitHub `main`은 실증 검증과 명시적 출시 게이트를 통과하기 전까지 **수정 금지**.
