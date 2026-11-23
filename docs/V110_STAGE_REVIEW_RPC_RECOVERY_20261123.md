# 배구지수 v1.1.0 — 2026 관리자 심사 RPC 6종 시험 복구 (2026-11-23 KST)

## 운영 보호 및 범위

- **시험 프로젝트만 변경:** Supabase `ycwuugggqbunlbwuzvbx`, GitHub `fix/v110-staging-edited-api-recovery-20261123`.
- 운영 DB `snvzwrexuqavnfvzgxqj`는 테이블 구조와 함수 정의를 읽기 전용으로 참고했고, 운영 설문·교사 응답·학교별 건수·관리자 개인정보는 옮기지 않았다.
- 운영 웹 `https://baeguindex.com`, 운영 GitHub `main` 변경 없음. 전체 16개 참조 API가 시험 서버에 설치됐지만 5개의 기능 잠금과 실제 E2E 미검증으로 **NO-GO**.

## 시험 DB에서 실제 구현한 내역

- 운영 스키마 구조만 참고해 QA 비공개 테이블 6개를 **0행**으로 복원:
  `beagu_2026_auto_review_status`, `beagu_2026_quality_reviews`,
  `beagu_2026_results_approval_audit`, `beagu_2026_basis_review_events`,
  `challenge_referral_quality_reviews`, `challenge_referral_quality_audit`.
- 모든 새 테이블에 RLS를 켜고, `PUBLIC`·`anon`·`authenticated` 직접 접근을 철회. 기존 `TST[0-9]{4}` 형식의 시험 학교 ID 제약을 유지한 채 시험 `beagu_2026_results_snapshot`의 **누락된 `school_response_rows` 칼럼**만 추가(기본값 0).
- 비공개 RPC 6종 시험 복구(운영 함수 본문은 *기능 정의만* 참고):
  1. `beagu_2026_admin_review_queue` — 심사 대상/품질/기술 상태별 개인 정보 포함 내부 대기열, 읽기 전용.
  2. `beagu_2026_admin_pipeline_status` — 2026 내부 집계 파이프라인 검증 현황, 읽기 전용.
  3. `beagu_referral_quality_queue` — 추천 품질 수동심사 대기열, 읽기 전용.
  4. `beagu_referral_quality_resolve` — 소유자·활성 AAL2 MFA 확인 + 별도 **실제 설문 검증 플래그**를 통과하지 않으면 추천 승급 불가.
  5. `beagu_2026_admin_record_basis_review` — 소유자·활성 MFA 확인, `PENDING`/`REJECTED`만 기록; 비공개 검토 사유·스냅샷 일치성 검사.
  6. `beagu_2026_admin_hold_result` — 기존 함수보다 강화해 **세션 ID를 필수 인수로 받고** 소유자·MFA를 DB 안에서 확인. 보류 변경과 **비공개 승인 감사 + 공개 관리자 감사 기록을 한 SQL 트랜잭션에서 원자적으로 기록**.
- SQL 6종의 `SECURITY DEFINER`에 대해 `PUBLIC`/익명/회원 직접 `EXECUTE`를 철회하고 `service_role`만 허용. 독립 스테이징 SQL의 운영 스프레드시트 식별자는 `STAGING_QA_SOURCE_2026`으로 교체.
- [시험 테이블 복원 소스](https://github.com/noam0127/beagu-index/blob/fix/v110-staging-edited-api-recovery-20261123/scripts/staging/schema-review-admin-private-qa-only.sql) / [RPC SQL 소스](https://github.com/noam0127/beagu-index/blob/fix/v110-staging-edited-api-recovery-20261123/scripts/staging/schema-review-admin-six-rpcs-qa-only.sql).

## 실제 확인 결과

- 시험 DB SQL 조회: 심사 대기열 `items=[]`, 총 0건. 내부 파이프라인 `year=2026`과 모든 공개 승인/품질 수치 0, 추천 품질 `items=[]`, 총 0건. 세 읽기 함수 **정상 응답**.
- [실행한 트랜잭션형 SQL 테스트](https://github.com/noam0127/beagu-index/blob/fix/v110-staging-edited-api-recovery-20261123/tests/sql/staging-review-admin-six-rpc-rollback-20261123.sql): 관리자 계정·활성 MFA 없는 가상 사용자에서 `HOLD`/`PENDING` 근거검토/`APPROVE` 추천 승급 **모두 거부**. 거부된 요청 전후 2026 스냅샷·비공개 결정 감사·추천 품질 감사·기존 공개 관리자 감사 기록 모두 **건수 불변**. 끝에 `ROLLBACK`.
- 시험 `beagu-2026-review-admin` **v3 ACTIVE**: `p_session=claims.session_id`을 SQL RPC로 전달하고, DB 원자적 감사 이후 Edge에서 중복으로 감사 INSERT 하던 코드를 제거.
- [GitHub Actions #45090796259](https://github.com/noam0127/beagu-index/actions/runs/45090796259) PASS: 6개 SQL 함수·6개 비공개 테이블·권한/감사 원자성 정적 검사, 실제 시험 Edge의 `REVIEW_NOT_READY` 및 보안 차단 HTTP 검증.
- 위 GitHub Actions 검사는 실제 관리자 소유자 MFA 인증 후 심사·공개 결정의 **양성 E2E를 수행하지 않았다**. 시험 `BEAGU_STAGING_REVIEW_APPROVED` 플래그는 여전히 활성화하지 않았다.

## 승인 전 남은 의무 검증

- 독립 시험 도메인 및 실제 Supabase Auth AAL2 로그인·MFA 세션·소유자/뷰어/편집자 역할별 HTTP 양성/음성 E2E.
- 근거자료·최소표본·재식별 위험 심사, 추천 실응답 제출 확인, 실제 JWT의 세션 무효화·정책 변경·장애 복구. 가상 2026 학교 스냅샷에서의 **DB 내부 성공 경로·감사 원자성은 검증 완료**했으나 실제 인증 E2E는 아직 미검증.
- 시험 관리자 계정은 아직 0건. 보안 권한을 우회하거나 실제 운영 계정을 복제해 양성 테스트를 꾸미지 않음.
- **관리자 심사 플래그는 잠금 유지. 16/16 API 설치는 운영 출시 승인이 아니다.**

## 2026-11-23 후속: 가상 AAL2 상태로 DB 성공 경로와 감사 실패 롤백 검증

**실제 MFA 성공이라고 주장하지 않는다.** 시험 Supabase에는 검사 전후 `auth.users=0`, `auth.sessions=0`, MFA 요소 0건, 활성 관리자 0건이므로, 아래 테스트에서는 **DB 트랜잭션 안에서만** `auth.users`·`auth.sessions.aal='aal2'`·`beagu_admin_accounts.owner`·`TST0999` 학교와 가상 2026 집계 행을 만든 후 검증한다. 실제 MFA 등록, OTP 입력, Auth 토큰/JWT 발급, 브라우저 로그인은 발생하지 않음.

- [가상 소유자·권한·감사 원자성 실제 시험 SQL](https://github.com/noam0127/beagu-index/blob/fix/v110-staging-edited-api-recovery-20261123/tests/sql/staging-review-owner-aal2-atomic-positive-rollback-20261123.sql): `viewer` 권한 거부, `aal1` 거부, 세션 만료 거부. QA용 소유자+AAL2 행에서는 `PENDING` 근거 심사 성공 및 기존 승인 `WITHHELD` 회수 확인. 별도 보류 실행에서는 스냅샷 보류 + 비공개 결정 감사 + 공개 관리자 감사가 **함께 성공**. 마지막 공개 감사 INSERT에 강제 SQL 오류를 일으켰더니 앞선 스냅샷 수정/비공개 감사까지 모두 **롤백**됨.
- [가상 추천 품질 심사/원자성 실제 시험 SQL](https://github.com/noam0127/beagu-index/blob/fix/v110-staging-edited-api-recovery-20261123/tests/sql/staging-review-referral-quality-atomic-rollback-20261123.sql): `form_quality_attested=false`에서 APPROVE 거부, `form_quality_attested=true`로 바꿔도 `public_enabled=false`이므로 APPROVE 거부 및 Lv2 프로필 0건. 동일 가상 소유자의 `REJECT`는 이벤트 변경 + 품질 검토 변경 + 감사 기록이 함께 성공. 마지막 감사 INSERT 강제 실패에서 앞선 변경 모두 롤백.
- 양쪽 테스트는 **BEGIN / ROLLBACK**으로 종료. 최종 SQL 조회에서 가상 Auth 사용자·세션·관리자·QA 학교·2026 스냅샷·가상 감사·추천 이벤트·강제 실패 트리거 **전부 0건**. 기존 관리자 감사 16건은 유지.
- [GitHub Actions 회귀 검사 #45091470112](https://github.com/noam0127/beagu-index/actions/runs/45091470112) **성공**: 양성/부정 SQL 테스트의 필수 범위와 안전장치, 2026 관리자 API 실제 `REVIEW_NOT_READY` 잠금 응답 검증.
- [진짜 관리자 MFA 준비 확인용 읽기 전용 SQL](https://github.com/noam0127/beagu-index/blob/fix/v110-staging-edited-api-recovery-20261123/scripts/staging/read-only-real-reviewer-mfa-prereqs-20261123.sql): Auth 사용자 0, 활성 owner 계정 0, 검증된 MFA factor가 있는 owner 0, 활성 owner AAL2 세션 0. 판정 **`BLOCKED_REAL_MFA_OWNER_ACCOUNT_NOT_CONFIGURED`**.

다음 단계의 필수 외부 인증 절차: 시험 프로젝트에 실제 소유자 QA 계정을 만들고 TOTP MFA를 등록·검증한 후, **실제 발급된 JWT**의 `sub`·`aal='aal2'`·`session_id`와 `auth.sessions`의 활성 상태가 일치하는지 서버·브라우저에서 검증해야 한다. <https://supabase.com/docs/guides/auth/auth-mfa> 및 <https://supabase.com/docs/guides/auth/sessions> 참고. 계정이 준비되기 전까지 `BEAGU_STAGING_REVIEW_APPROVED`는 설정하지 않고 기존 5개 롤아웃 잠금을 유지한다.

## 2026-11-23: 실제 JWT·AAL2 MFA 진단 전용 경로 추가 (본 기능은 잠금)

- `beagu-2026-review-admin` **시험 v3 ACTIVE**. 별도 POST `?preflight=mfa` 경로만 관리자 심사 잠금 이전에 호출 가능. 이는 **읽기 전용 인증 자기점검**이며 학교 데이터 조회·공개 심사·기록 변경은 불가능. 일반 심사 POST는 종전처럼 HTTP 503 `REVIEW_NOT_READY`.
- 시험 로컬 Origin 또는 별도 승인한 Render 도메인만 CORS 허용. 유효한 실제 **Supabase Auth 서명 JWT** `getUser(jwt)`을 확인한 후에만 `sub`와 `session_id`를 조회. JWT `aal`이 AAL2여도 DB의 실제 `auth.sessions` AAL2/만료 검증에 실패하면 `inactive_or_expired_mfa_session`. 본인 권한은 `beagu_admin_accounts`에서 확인하며 사용자 ID·이메일·토큰은 결과에 노출하지 않음.
- [실제 무기록 HTTP 검증 #45091845564](https://github.com/noam0127/beagu-index/actions/runs/45091845564) **PASS**: 무인증 JWT 401, 운영 출처 403, Origin 없는 요청 403, 너무 긴 JWT 401, 위조 AAL2 JWT 401, 일반 관리자 심사 503 잠금 유지.
- [후속 테스트 #45091965156](https://github.com/noam0127/beagu-index/actions/runs/45091965156) **PASS**: 위 실제 HTTP 회귀와 함께 로컬 확인 도구의 보안·무기록 계약 검사.
- [로컬 실제 AAL2 확인기](https://github.com/noam0127/beagu-index/blob/fix/v110-staging-edited-api-recovery-20261123/scripts/staging/check-owner-aal2-interactive.py) 추가. 실제 시험 Auth 사용자와 TOTP 등록 후, 신뢰하는 PC의 터미널에서만 access_token을 **숨김 입력**으로 받아 본인 소유자 권한/활성 AAL2 여부를 진단. 토큰은 채팅·GitHub·CI에 공유하거나 저장하지 않음. 사용자가 직접 실행하기 전까지 실제 양성 E2E가 수행됐다고 주장하지 않음.
- [실제 MFA 준비용 읽기 전용 SQL](https://github.com/noam0127/beagu-index/blob/fix/v110-staging-edited-api-recovery-20261123/scripts/staging/read-only-real-reviewer-mfa-prereqs-20261123.sql)에서 2026-11-23 기준 시험 Auth 사용자·소유자·MFA 인증기·활성 세션은 모두 **0건**. 실제 관리자 MFA 설정은 사용자 계정의 명시적인 등록·인증 절차가 필요하고 이 채팅에서 우회하거나 계정을 만들지 않음.
- 릴리스 조건 **변경 없음**: 관리자 MFA 실제 브라우저 양성 E2E, 추천 실응답 검증, 학급일지 PIN 검수 및 5개 잠금 해제 승인이 없으면 전체 v1.1.0은 NO-GO.
