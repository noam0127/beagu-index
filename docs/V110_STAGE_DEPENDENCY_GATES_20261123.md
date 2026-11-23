# 배구지수 v1.1.0 — 시험 API 배포·의존성 점검 (2026-11-23)

> **전체 E2E 및 운영 승격 NO-GO.** 운영 GitHub `main`, 운영 웹, 운영 DB, 운영 응답 데이터는 수정하지 않았다.

## 실제 시험 환경과 사실

- Supabase 시험 프로젝트 `ycwuugggqbunlbwuzvbx` ACTIVE.
- 시험 Edge Function **39개** 확인. 정적 시험 웹이 직접 참조하는 **16개 중 13개 배포 이름 존재, 3개 미배포**.
- **이름이 존재한다는 것과 정상 HTTP 동작한다는 것은 다르다.** 13개 전체의 E2E 완료를 선언하지 않는다.
- `beagu-school-culture-v1` 시험 v1 ACTIVE. 2026 승인후 24시간·동일 승인 버전·유효 응답/교사 각각 5인 이상·개인정보/소집단/차분 검토를 서버가 확인. 누락 `n_valid`·`teacher_count`를 시험 DB에 추가, 기존 집계 0건 확인. [실제 무인증·CORS HTTP 5개 흐름 PASS](https://github.com/noam0127/beagu-index/actions/runs/45085852982). 정상 Lv1 토큰으로 성공 응답을 받는 시험은 아직 실시하지 않았다.
- `arcade-leaderboard` 시험 v2 ACTIVE. **503/PGRST205 원인 해결:** 게임에서 일반 점수와 함께 조회하는 `arcade_fastest25_records`가 시험 DB에 미존재. 운영의 스키마·RLS·service_role 전용 권한·`arcade_enforce_game_record_limits` 트리거를 **시험 전용 빈 상태로 복원**하고, [GitHub Actions #45086190661 5차 재실행](https://github.com/noam0127/beagu-index/actions/runs/45086190661)에서 실제 GET·부정 요청 HTTP 검증 PASS. [회귀 검증 #45087829964](https://github.com/noam0127/beagu-index/actions/runs/45087829964)도 PASS. **이 결과는 게임 플레이→점수 등록 브라우저 E2E를 증명하지 않음.**
- 이전 단계에서 복구한 `beagu-edited-api-v1` 시험 v1의 무인증/출처 거부 HTTP는 [PASS](https://github.com/noam0127/beagu-index/actions/runs/45085533181). 정상 Lv2 자료 조회 및 브라우저 E2E는 미실시.
- 분리된 `scripts/staging/recovered-*/index.ts`는 운영 자동배포 디렉터리 밖에 둔다. 서비스 역할 비밀을 GitHub에 입력하지 않았으며 사용자 데이터 복사는 없었다.

## 미배포 3개와 실제 소스에서 발견한 의존성

| API | 시험 DB/구성의 확인된 차단 사항 | 분류 |
|---|---|---|
| `beagu-2026-review-admin` | `beagu_admin_active_mfa_session`은 존재하나 검토 대기열·심사 기록·보류·추천 품질 등 6종 RPC 부재 | 개인정보·관리 |
| `class-diary-guest-access-v1` | `beagu_consume_login_budget` 존재, `beagu_consume_class_diary_preview_budget` 부재. 별도 미리보기 PIN 설정 필요 | 다른 게임·인증 |
| `class-diary-progress-v1` | `beagu_class_diary_preview_progress_read`, `beagu_class_diary_preview_progress_write` RPC 부재 | 다른 게임·저장 |

*이 목록은 직접 참조되는 RPC에 대한 소스 스캔과 시험 DB `pg_proc` 조회 결과이다. 동적 의존성·필수 DB 데이터·배포 비밀 구성까지 자동으로 보증하지 않는다.*

## 학교 관심도 집계 실제 복구

- 원본 운영 함수 정의와 DB 스키마만 확인하여 시험 DB에 방문 요약 테이블 및 `beagu_school_interest_rankings()` 복구. 운영 이벤트/원자료는 이관하지 않음.
- 5인 이상 방문, 전기 대비 순증가 3 이상 조건. 서비스 전용 실행 권한과 deny-by-default RLS 확인.
- 시험 `beagu-school-interest-v1` v1 ACTIVE 및 HTTP 허용·거부 검증 PASS: [Actions #45086973139](https://github.com/noam0127/beagu-index/actions/runs/45086973139). 실제 정상 이용자의 Lv1 조회는 미검증.

## 게임 순위 API 원인 및 복구 검증

- `arcade_fastest25_records`가 실제로 누락된 테이블임을 운영/시험 스키마 비교로 확인. 사전의 `PGRST205`는 `fastest25()` 함수의 별도 조회에서 발생했으며, 게임 점수 테이블 접근 권한 문제가 아니었음.
- 운영 데이터/기록/비밀 키는 복사하지 않음. 최단시간 기록 테이블 및 상위 점수 100건/최단시간 10건 유지용 트리거를 시험 환경에 복원, RLS와 anon SELECT 차단 유지.
- 102개 가상 세션/점수를 **단일 시험 트랜잭션에서 삽입·검증 후 ROLLBACK**. 결과: 점수 100건, 최단시간 10건, 정렬 및 중복 조건 확인. 이후 시험 세션/점수/최단시간 기록 각각 0건 확인. [SQL 회귀 시나리오](https://github.com/noam0127/beagu-index/blob/fix/v110-staging-edited-api-recovery-20261123/tests/sql/staging-arcade-trigger-rollback-20261123.sql).
- API 테이블 의존성 누락 방지 정적 검사와 실제 HTTP GET/부정 요청 검사 [Actions #45087829964](https://github.com/noam0127/beagu-index/actions/runs/45087829964) 통과.
- 기존 진단 임시 익명 GRANT/테이블/정책은 원복·삭제됨. 원인 분석을 위해 RLS를 약화하지 않음.

## 방문·계측 RPC/HTTP 실제 복구

- 시험 전용 RPC `beagu_record_visit` / `beagu_telemetry_totals_v2` 복원. 기존 `beagu_telemetry_guard_v2`, `beagu_presence_ping_v1`는 그대로 유지. 익명/회원의 RPC 직접 실행 권한 없음.
- `beagu-telemetry-v2` 시험 v1 배포. 운영 Origin·프로젝트 차단, IP 헤더 미신뢰 및 시험용 전역 소스 제한을 둠. [CI #45088247300](https://github.com/noam0127/beagu-index/actions/runs/45088247300)에서 실제 ping/visit/중복 이벤트와 부정 호출 통과.
- 가상 계측 흔적 모두 삭제해 방문·접속·소스 카운터 0건 복원. 브라우저 PC/모바일·관리자 양성 제외·실제 IP 경계는 아직 미검증.

## 다음 진행의 통과 조건

1. 완료: 최단시간 기록 테이블 누락 복구·HTTP GET/부정 검증 및 롤백형 트리거 테스트 통과. 남은 과제는 실제 게임 플레이·점수 제출·중복 방지·브라우저 PC/모바일 E2E.
2. 추천·신원 발급·관리 권한 함수를 임의 구현하지 않는다. 서버 권한·RPC 서명·테스트 테이블·실제 CORS 허용 도메인을 원 코드/스키마와 대조한 뒤 개별 시험 배포.
3. 실제 사용자 메일 링크, Lv1/Lv2/Lv3 가입, 관리자 MFA, PC/모바일 전체 사용자 E2E 및 개인정보 독립 승인 전까지 **운영 승격 불가**.

운영 웹 `https://baeguindex.com`에 적용하지 않는다.

## 챌린지 발급·추천 보안 게이트

- `beagu-challenge-identity`: 기존 생산용 무기기증명 RPC를 시험 환경에서 그대로 노출하지 않고 `beagu_stage_issue_challenge_bound`를 통한 Lv1 세션/기기/UUID 원자적 바인딩으로 교체. GitHub 브라우저 소스에도 동일 기기 비밀을 전송하도록 수정. [HTTP 부정검사 PASS](https://github.com/noam0127/beagu-index/actions/runs/45089094875), SQL 양성/부정 롤백 검증 PASS. 실제 로그인 양성 HTTP는 아직 미실시.
- `beagu-referral-link-v1` 및 `beagu-referral-checkin-v1`는 시험 프로젝트에 v1 설치했으나 `public_enabled=false`, `BEAGU_STAGING_REFERRAL_VERIFIED` 미설정으로 `REFERRAL_NOT_READY`를 반환하도록 고정. [실제 HTTP 차단검사 PASS](https://github.com/noam0127/beagu-index/actions/runs/45089400570).
- 외부 설문 직접 제출 여부·추천 인정 심사를 전혀 증명하지 못한 상태이므로 두 함수는 **PRESENT but LOCKED**. 향후 누락 API가 0개라도 잠금 중인 함수가 있으면 전체 E2E readiness=NO-GO.
