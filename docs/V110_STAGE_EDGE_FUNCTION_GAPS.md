# 배구지수 v1.1.0 — 시험 Supabase Edge Function 실배포 현황

2026년 11월 23일(한국 시간) **시험 프로젝트**
`ycwuugggqbunlbwuzvbx`를 읽기 전용으로 확인한 결과, 총 **31개**
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
시험 Supabase 실제 목록에는 이 중 **5개**만 있다.

아래 11개는 시험 프로젝트에서 **미배포(MISSING)** 상태다.

| 구분 | 시험 프로젝트에 없는 함수 | 정적 호출 파일 |
|---|---|---|
| 챌린지 신원 | `beagu-challenge-identity` | `js/challenge.js` |
| 추천 응답 | `beagu-referral-checkin-v1` | `js/beagu-referral-form-v1.js` |
| 추천 링크 | `beagu-referral-link-v1` | `js/challenge-referral-v1.js` |
| 관리자 검토 | `beagu-2026-review-admin` | `js/beagu-2026-admin-review.js` |
| 학교 정보 | `beagu-edited-api-v1` | `school-report.html` |
| 학교 문화 | `beagu-school-culture-v1` | `js/school-mbti-v1.js` |
| 관심학교 | `beagu-school-interest-v1` | `js/beagu-school-interest-v1.js` |
| 게임 순위 | `arcade-leaderboard` | `js/arcade-leaderboard-v1.js` 외 2개 |
| 방문 계측 | `beagu-telemetry-v2` | `js/visit-stats.js`, `js/beagu-presence-games-v1.js` |
| 학급일지 접근 | `class-diary-guest-access-v1` | `js/class-diary-home-entry-v1.js` |
| 학급일지 진행 | `class-diary-progress-v1` | `js/class-diary-progress-v1.js` |

**소스 준비 상태:** 누락된 11개 중 10개는 GitHub 개발 브랜치의
`supabase/functions/<함수명>/index.ts`가 존재한다. 이는 **시험 배포 가능성
검토 대상**이라는 뜻이지, SQL 의존성·권한·보안·요금 검증이 끝났다는 뜻은
아니다. 나머지 **`beagu-edited-api-v1`에는 현재 함수 소스가 없다.**
`school-report.html`에서는 Lv2 추가 편집본 정보를 불러올 때 해당 API를
선택적으로 호출하고, 실패 시 추가 항목을 생략한다. 따라서 이 기능은 단순
배포가 아니라 기존 API 대체 여부 또는 소스 복구를 검토해야 한다.

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
