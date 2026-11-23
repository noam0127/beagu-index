# 배구지수 v1.1.0 — 시험 API 배포·의존성 점검 (2026-11-23)

> **전체 E2E 및 운영 승격 NO-GO.** 운영 GitHub `main`, 운영 웹, 운영 DB, 운영 응답 데이터는 수정하지 않았다.

## 실제 시험 환경과 사실

- Supabase 시험 프로젝트 `ycwuugggqbunlbwuzvbx` ACTIVE.
- 시험 Edge Function **34개** 확인. 정적 시험 웹이 직접 참조하는 **16개 중 8개 배포 이름 존재, 8개 미배포**.
- **이름이 존재한다는 것과 정상 HTTP 동작한다는 것은 다르다.** 8개 전체의 E2E 완료를 선언하지 않는다.
- `beagu-school-culture-v1` 시험 v1 ACTIVE. 2026 승인후 24시간·동일 승인 버전·유효 응답/교사 각각 5인 이상·개인정보/소집단/차분 검토를 서버가 확인. 누락 `n_valid`·`teacher_count`를 시험 DB에 추가, 기존 집계 0건 확인. [실제 무인증·CORS HTTP 5개 흐름 PASS](https://github.com/noam0127/beagu-index/actions/runs/45085852982). 정상 Lv1 토큰으로 성공 응답을 받는 시험은 아직 실시하지 않았다.
- `arcade-leaderboard` 시험 v2 ACTIVE. 운영 출처 거부·시험 DB만 접근하고 실제 운영 설문 링크를 제거했다. 시험 게임 기록/점수 DB 테이블은 운영 스키마와 컬럼 구조가 일치하지만 **GET은 503 실패**. [실제 HTTP GitHub CI #45086190661](https://github.com/noam0127/beagu-index/actions/runs/45086190661) 실패. 시험 함수 로그에 `arcade_db GET 404 PGRST205`가 출력되어 PostgREST Data API가 테이블을 스키마 캐시에서 찾지 못한다. `NOTIFY pgrst, 'reload schema'` 이후에도 재현. RLS를 끄거나 익명 접근을 풀어서 임시 해결하지 않는다. **게임 순위 정상 동작 완료라고 말하지 않는다.**
- 이전 단계에서 복구한 `beagu-edited-api-v1` 시험 v1의 무인증/출처 거부 HTTP는 [PASS](https://github.com/noam0127/beagu-index/actions/runs/45085533181). 정상 Lv2 자료 조회 및 브라우저 E2E는 미실시.
- 분리된 `scripts/staging/recovered-*/index.ts`는 운영 자동배포 디렉터리 밖에 둔다. 서비스 역할 비밀을 GitHub에 입력하지 않았으며 사용자 데이터 복사는 없었다.

## 미배포 8개와 실제 소스에서 발견한 의존성

| API | 시험 DB/구성의 확인된 차단 사항 | 분류 |
|---|---|---|
| `beagu-challenge-identity` | `beagu_issue_challenge_identity` RPC 부재; 권한 발급 기능 | 신원·권한 민감 |
| `beagu-referral-checkin-v1` | `beagu_referral_short_resolve` RPC 부재, HMAC 비밀·활성 플래그 필요. `beagu_referral_funnel_record_v1`만 확인됨 | 추천/계측 |
| `beagu-referral-link-v1` | `beagu_issue_challenge_identity_bound`, `beagu_referral_enroll`, `beagu_referral_short_issue` RPC 부재; HMAC·활성 플래그 필요 | 권한·추천 |
| `beagu-2026-review-admin` | `beagu_admin_active_mfa_session`은 존재하나 검토 대기열·심사 기록·보류·추천 품질 등 6종 RPC 부재 | 개인정보·관리 |
| `beagu-school-interest-v1` | `beagu_school_interest_rankings` RPC 부재 | 읽기 전용 집계 |
| `beagu-telemetry-v2` | `beagu_telemetry_guard_v2`, `beagu_presence_ping_v1` 존재. `beagu_telemetry_totals_v2`, `beagu_record_visit` 부재 | 계측·쓰기 |
| `class-diary-guest-access-v1` | `beagu_consume_login_budget` 존재, `beagu_consume_class_diary_preview_budget` 부재. 별도 미리보기 PIN 설정 필요 | 다른 게임·인증 |
| `class-diary-progress-v1` | `beagu_class_diary_preview_progress_read`, `beagu_class_diary_preview_progress_write` RPC 부재 | 다른 게임·저장 |

*이 목록은 직접 참조되는 RPC에 대한 소스 스캔과 시험 DB `pg_proc` 조회 결과이다. 동적 의존성·필수 DB 데이터·배포 비밀 구성까지 자동으로 보증하지 않는다.*

## 다음 진행의 통과 조건

1. 시험 Supabase의 Data API에서 `arcade_game_scores`가 왜 `PGRST205`인지 설정과 스키마 노출을 확인하고, **RLS·비공개 테이블 접근 제약은 그대로 유지**한 채 GET 200 및 부정 HTTP 통과.
2. 추천·신원 발급·관리 권한 함수를 임의 구현하지 않는다. 서버 권한·RPC 서명·테스트 테이블·실제 CORS 허용 도메인을 원 코드/스키마와 대조한 뒤 개별 시험 배포.
3. 실제 사용자 메일 링크, Lv1/Lv2/Lv3 가입, 관리자 MFA, PC/모바일 전체 사용자 E2E 및 개인정보 독립 승인 전까지 **운영 승격 불가**.

운영 웹 `https://baeguindex.com`에 적용하지 않는다.
