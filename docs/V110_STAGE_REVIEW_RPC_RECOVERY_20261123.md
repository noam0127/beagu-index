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
- 시험 `beagu-2026-review-admin` **v2 ACTIVE**: `p_session=claims.session_id`을 SQL RPC로 전달하고, DB 원자적 감사 이후 Edge에서 중복으로 감사 INSERT 하던 코드를 제거.
- [GitHub Actions #45090796259](https://github.com/noam0127/beagu-index/actions/runs/45090796259) PASS: 6개 SQL 함수·6개 비공개 테이블·권한/감사 원자성 정적 검사, 실제 시험 Edge의 `REVIEW_NOT_READY` 및 보안 차단 HTTP 검증.
- 위 GitHub Actions 검사는 실제 관리자 소유자 MFA 인증 후 심사·공개 결정의 **양성 E2E를 수행하지 않았다**. 시험 `BEAGU_STAGING_REVIEW_APPROVED` 플래그는 여전히 활성화하지 않았다.

## 승인 전 남은 의무 검증

- 독립 시험 도메인 및 실제 Supabase Auth AAL2 로그인·MFA 세션·소유자/뷰어/편집자 역할별 HTTP 양성/음성 E2E.
- 가상 2026 학교 스냅샷과 감사 기록의 **성공 경로 원자성**, 근거자료·최소표본·재식별 위험 심사, 추천 실응답 제출 확인, 세션 무효화·정책 변경·장애 복구.
- 시험 관리자 계정은 아직 0건. 보안 권한을 우회하거나 실제 운영 계정을 복제해 양성 테스트를 꾸미지 않음.
- **관리자 심사 플래그는 잠금 유지. 16/16 API 설치는 운영 출시 승인이 아니다.**
