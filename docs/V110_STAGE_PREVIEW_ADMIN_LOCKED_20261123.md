# 배구지수 v1.1.0 — 미배포 API 3종 시험 환경 복구 (2026-11-23 KST)

**범위:** 시험 Supabase `ycwuugggqbunlbwuzvbx`, GitHub 브랜치 `fix/v110-staging-edited-api-recovery-20261123`에서만 실제 구현. 운영 웹 `https://baeguindex.com`·운영 DB·GitHub `main` 변경 금지 및 준수.

## 완료: 학급일지 체험판 비공개 스키마·RPC

- 운영 환경에 있던 2개 비공개 테이블 `beagu_private.class_diary_preview_attempts`, `beagu_private.class_diary_preview_progress`의 **빈 구조만** 시험 DB에 복원.
- `beagu_consume_class_diary_preview_budget()`, `beagu_class_diary_preview_progress_read()`, `beagu_class_diary_preview_progress_write(bigint,jsonb)` 3개 RPC 복원. RLS 활성·anonymous/authenticated 직접 EXECUTE 취소, `service_role`만 호출.
- [실제 SQL QA](https://github.com/noam0127/beagu-index/blob/fix/v110-staging-edited-api-recovery-20261123/tests/sql/staging-class-diary-preview-rollback-20261123.sql): 최초 revision=1 저장, revision=2 업데이트, 이전 revision 충돌/부적절한 JSON 거부, 시간당 80회 제한 후 81번째 거부 확인. 모든 인위적 진행기록·시도는 ROLLBACK. 이후 두 테이블 0건 확인.
- 시험 Edge `class-diary-guest-access-v1`, `class-diary-progress-v1` v1 배포. `BEAGU_STAGING_CLASS_DIARY_APPROVED` 미설정 및 별도 PIN 미설정 시 정확하게 `PREVIEW_NOT_READY` 반환. 실 PIN, 실 로그인·저장·브라우저 E2E는 수행/검증하지 않음.
- **주의:** 기존 픽션 체험판은 하나의 미리보기 소유자 상태를 저장하는 구조다. 여러 사람에게 공용 PIN을 배포할 경우 진행 상태가 섞일 수 있으므로, 실제 다중 사용자 서비스 전에 사용자별 데이터 분리/보안 검토가 필요함.

## 완료: 관리자 2026 심사 경로의 시험 보안 차단

- `beagu-2026-review-admin` 시험 Edge v1 배포. 실제 관리자 JWT AAL2·MFA 활성 세션 등 검증 코드 유지.
- 시험 DB에 2026 심사 대기열·품질 검토·판단 기록 등 **6개 중요한 심사 RPC 의존성이 누락**되었고, 운영 리포트 데이터를 복사하지 않기로 했으므로 `BEAGU_STAGING_REVIEW_APPROVED` 미설정 단계에서 `REVIEW_NOT_READY` 503으로 **모든 민감 관리자 요청 차단**.
- 관리자 심사·보류·개인정보 검토·운영 공개 승인 등 실작업은 시도하지 않음. 관리자 MFA/권한 양성 E2E, 함수별 SQL 원장·감사 로그 원자성·비식별화 검토는 **미완료**.

## 검증 및 실제 완료 증거

- [실제 HTTP/보안/계약 검사 #45090059588](https://github.com/noam0127/beagu-index/actions/runs/45090059588) PASS. 세 API의 로컬 origin OPTIONS, 운영 origin/Origin 없음 차단, GET 거부, POST 기능 잠금. 검사는 DB 기록을 만들지 않음.
- [최신 시험 독립 API 목록 준비 차단 검사 #45090173263](https://github.com/noam0127/beagu-index/actions/runs/45090173263) PASS. 사이트에서 참조하는 **16개 API 이름 모두 시험 Supabase에 설치**, 미배포 0. 단 **아래 5개 기능 잠금**, 실제 사용자 전체 E2E·운영 승격 NO-GO.
- `beagu-referral-link-v1`: 실제 Google Forms 응답 검증 미완료.
- `beagu-referral-checkin-v1`: 실제 Google Forms 응답 검증 미완료.
- `beagu-2026-review-admin`: AAL2 관리자 MFA·심사 RPC·감사 미검증.
- `class-diary-guest-access-v1`: 개인용 PIN·소유자 체험판 승인 미설정.
- `class-diary-progress-v1`: 개인용 PIN·소유자 체험판 승인 미설정.
- 자동 감사 `scripts/staging/audit-frontend-edge-functions.py`는 누락된 API뿐 아니라 `feature_gates`에 잠긴 API도 **NO-GO**로 판정. 따라서 16/16은 **운영 배포 가능한 수치가 아니다**.

## 다음 과제

1. 2026 관리자 심사 RPC 6종의 운영 SQL 정의·시험 데이터 구조·감사 원자성·MFA 역할 검증을 **시험 환경에서만** 재현.
2. 학급일지 공개 범위를 결정하기 전까지 PIN·승인 플래그를 잠금 유지. 개인별/공용 상태 저장의 필요성과 개인정보 최소화 재검토.
3. 실제 Google Forms 응답 인정 경로 독립 검증, Lv1/Lv2/Lv3 인증, 관리자 MFA, PC·모바일·브라우저·Render 호스팅 E2E, 보안 린트(기존 성능 계측 SECURITY DEFINER 경고) 및 교차 인증 테스트.
4. 전체 양성/부정 E2E·개인정보 승인 후 명시적 릴리스 절차를 거치기 전까지 운영 웹·DB·main 변경 금지.
