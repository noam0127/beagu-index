# 배구지수 v1.1.0 — 시험 Supabase Edge Function 실배포 현황

2026년 11월 23일(한국 시간) **시험 프로젝트**
`ycwuugggqbunlbwuzvbx`를 읽기 전용으로 확인한 결과, 총 **35개**
Edge Function이 등록되어 있다. 정확한 함수 이름과 현재 버전의 스냅샷은
`scripts/staging/stage-edge-functions-inventory.json`에 있다.

## 실제로 확인된 차이

- 핵심 호출 함수인 `beagu-level-api`, `beagu-postit-api-v1`,
  `beagu-admin-access`, `beagu-admin-dashboard-v1`,
  `beagu-admin-members-v1` 등은 시험 프로젝트에 존재한다.
- **`beagu-telemetry-v2`는 시험 프로젝트에 존재하지 않는다.**
  방문·활동 계측 화면에서 호출한다면 실제 시험 웹에서는 API를 찾을 수 없다.
- 배포된 시험 함수들은 개발 브랜치 원본과 다르게
  운영 도메인을 거부하도록 로컬 QA용 CORS 코드를 수정한 상태다.
  GitHub 원본을 무조건 덮어써서는 안 된다.
- 사전 준비한 `staging-origin.ts` 공통 정책은 GitHub에만 있으며,
  실제 시험 Supabase에 아직 배포되지 않았다.

## 시험 웹 정적 호출과 배포 함수 대조 결과

2026-11-23 기준 시험 웹 빌드 산출물(HTML 24개 및 JS·CSS 포함)에서
정적 URL 또는 SDK 호출로 참조하는 Edge Function은 **16개**이고,
시험 Supabase 실제 목록에는 이 중 **9개**가 배포되어 있다.

아래 7개는 시험 프로젝트에서 **미배포(MISSING)** 상태다.

| 구분 | 시험 프로젝트에 없는 함수 | 정적 호출 파일 |
|---|---|---|
| 챌린지 신원 | `beagu-challenge-identity` | `js/challenge.js` |
| 추천 응답 | `beagu-referral-checkin-v1` | `js/beagu-referral-form-v1.js` |
| 추천 링크 | `beagu-referral-link-v1` | `js/challenge-referral-v1.js` |
| 관리자 검토 | `beagu-2026-review-admin` | `js/beagu-2026-admin-review.js` |
| 방문 계측 | `beagu-telemetry-v2` | `js/visit-stats.js`, `js/beagu-presence-games-v1.js` |
| 학급일지 접근 | `class-diary-guest-access-v1` | `js/class-diary-home-entry-v1.js` |
| 학급일지 진행 | `class-diary-progress-v1` | `js/class-diary-progress-v1.js` |

**소스 준비 상태:** 누락된 7개는 모두 GitHub 개발 브랜치의
`supabase/functions/<함수명>/index.ts`가 존재한다. 이는 **시험 배포 가능성
검토 대상**이라는 뜻이지, SQL 의존성·권한·보안·요금 검증이 끝났다는 뜻은
아니다. **`beagu-edited-api-v1`은 운영 배포본에서 소스를 읽기 전용으로 확보한 뒤 시험 전용으로 복구하여 시험 Supabase v1로 배포하였다.**
`school-report.html`에서는 Lv2 추가 편집본 정보를 불러올 때 해당 API를
선택적으로 호출하고, 실패 시 추가 항목을 생략한다. 복구본은 운영 프로젝트를 거부하고, 승인된 시험 Origin만 허용한다. 시험 DB의 누락된 공식 분류 테이블을 **빈 구조**로 생성하고 RLS·익명 접근 차단을 확인하였다. 브라우저·Lv2 실세션 E2E는 아직 완료되지 않았다.

이것은 정적 코드에서 발견한 함수 참조 현황이다. 모든 해당 코드가
모든 화면에서 실제 실행되는 것은 아니며, 동적으로 계산한 함수명은
정적 분석에서 누락될 수 있다. **API가 없다는 사실만 확인했으며**
실행 시의 오류 수나 실제 사용자 영향 범위는 아직 E2E 미검증이다.

실제 시험 함수 배포를 시작할 때는 각 함수의 소스·인증 정책·의존 SQL
및 제3자 API/비용을 독립 검증하고, 시험 프로젝트에만 순차 배포한다.
운영 DB에서 데이터를 복사하거나 함수 원본을 무조건 덮어쓰지 않는다.

## 자동 검사

```sh
python3 scripts/build-standalone-staging.py
python3 tests/staging-edge-inventory.test.py
python3 scripts/staging/audit-frontend-edge-functions.py
# 아래 명령은 실제 E2E 전 엄격 모드에서 미배포 함수가 있으면 종료 코드 2를 반환한다.
python3 scripts/staging/audit-frontend-edge-functions.py --require-ready
```

검사기는 생성된 시험 웹의 HTML, JS, CSS, JSON에서
`/functions/v1/<함수명>`과 JavaScript SDK의
`supabase.functions.invoke("<함수명>")` 호출을 찾는다.
현재 시험 프로젝트 스냅샷에 없는 항목과 이를 호출하는 파일을
함께 보고한다. 보고용 모드는 CI에서 계속 실행하지만 누락 상태에서
**실제 인증·최종 배포 준비 완료라고 출력하지 않는다.**

**주의:** 목록은 읽기 전용 시점 스냅샷이며 최신 실배포 상태를
자동으로 보증하지 않는다. 실제 호스팅에 게시하거나 E2E를 실행하기
전 Supabase에서 목록을 갱신하고 엄격 모드까지 통과해야 한다.
정적 분석은 문자열로 생성된 모든 동적 API 이름을 발견하지 못할 수 있다.

## 다음 실제 작업

1. 시험 Render 호스팅 주소를 발급받는다.
2. 정확한 도메인만 시험 프로젝트에서 허용하도록
   기존 배포본의 CORS 예외 설정을 안전하게 반영한다.
3. 필요한 누락 함수가 있다면 **시험 프로젝트에만** 소스·권한·데이터
   의존성을 검증하고 개별 배포한다.
4. 실제 이메일 가입, Lv1·Lv2·Lv3, 관리자 MFA, PC·모바일 E2E를 진행한다.

운영 웹, 운영 Supabase, 운영 설문 및 GitHub `main`은 변경하지 않는다.

## 2026-11-23 시험 추가 복구

- `beagu-school-culture-v1` v1: 운영 도메인 CORS 및 운영 프로젝트를 차단하는 시험 전용 소스 배포. 시험 `beagu_release_metrics_v2`의 `n_valid`, `teacher_count` 두 정수 칼럼만 추가하고, 기존 행은 0건. 5인 기준, 모든 개인정보 검토 플래그, 승인 후 24시간을 서버에서 검증. 실제 성공적인 인증·분류 결과 반환은 미검증.
- `arcade-leaderboard` v1: 운영 프로젝트 거부, 명시적 시험 Origin만 허용, 실제 설문으로 이동하는 URL 제거. 시험의 `arcade_game_sessions`, `arcade_game_scores` 테이블 구조가 운영과 동일함을 읽기 전용으로 확인. 최단시간 기록용 누락 테이블 및 점수 정리 트리거를 뒤이어 복구하여 실제 GET/부정 요청은 통과했지만 점수 등록·게임 전체 E2E 성공은 별도 검증 전까지 선언하지 않음.
- 시험에 원자료·개인정보·운영 게임 점수를 이관하지 않음. 운영 DB·웹·GitHub `main` 변경 없음.

## 2026-11-23 추가 복구: 학교 관심도

- `beagu-school-interest-v1` 시험 Edge v1 ACTIVE. `beagu_school_interest_daily` 빈 테이블 및 `beagu_school_interest_rankings()` SQL RPC 복구.
- SQL 직접 실행 결과 `{"rising":[],"window_hours":72}`; 이벤트 0건, RLS true. `anon`/`authenticated`의 테이블 SELECT·RPC EXECUTE 모두 불가. 서버 `service_role`만 SELECT/EXECUTE 허용.
- 최소 방문자 5명과 이전 72시간 대비 증가 3명 조건을 준수하며 개인별 방문 이벤트는 반환하지 않음.
- [GitHub Actions #45086973139](https://github.com/noam0127/beagu-index/actions/runs/45086973139): 실제 HTTP/가짜 토큰/출처 거부 검증 성공. 다만 정상 Lv1 사용자 경로는 미검증.
- **게임 API 503 원인 해결**: `arcade_fastest25_records` 누락이 원인이었으며, 해당 테이블과 `arcade_enforce_game_record_limits` 트리거 복구 후 실제 HTTP GET/부정 검사 성공 ([Actions #45087829964](https://github.com/noam0127/beagu-index/actions/runs/45087829964)). 102건 가상 점수 SQL 검증 후 롤백, 기록 0건·RLS 유지 확인.
- 해당 원인 분석 실험 후 `anon` 임시 GRANT 철회, 임시 정책과 빈 진단 테이블 제거. 이 실험으로 정상 게임 조회가 증명된 것은 아님.
