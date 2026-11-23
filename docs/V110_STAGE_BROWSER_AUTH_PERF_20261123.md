# 배구지수 v1.1.0 — 독립 시험 브라우저 인증·성능 계측 통합검사 (2026-11-23 KST)

## 보호 범위

- GitHub 개발 브랜치: `fix/v110-staging-edited-api-recovery-20261123`.
- 시험 Supabase: `ycwuugggqbunlbwuzvbx`. 운영 `snvzwrexuqavnfvzgxqj`는 이번 작업에서 **변경하지 않음**.
- 운영 웹 `baeguindex.com`과 운영 GitHub `main`은 변경하지 않음.
- 가입 이메일·MFA OTP·실제 세션/추천 데이터 없이, 독립 정적 웹의 PC/모바일 브라우저 동작과 실제 시험 서버의 **무인증 접근 거부**를 별도 검증.
- 모든 테스트는 배포 금지 및 **기능 잠금 5개**를 유지하는 fail-closed 절차.

## 실제 Chromium 테스트: 로컬 독립 웹 + 모의 인증/계측

- [테스트 코드](https://github.com/noam0127/beagu-index/blob/fix/v110-staging-edited-api-recovery-20261123/scripts/test-v110-staging-auth-perf-browser.cjs)에서 Python 정적 서버 `127.0.0.1:8132`, Playwright Chromium **desktop 1365×900 / mobile 390×844** 환경으로 웹을 실제 렌더링.
- 먼저 동일 Git SHA에서 `scripts/build-standalone-staging.py`를 실행하여 `_standalone_staging`을 생성하고, `tests/test-standalone-staging.py`로 운영 Supabase/Google Form 링크, 운영 배포 스크립트, 운영 CNAME 유출을 차단.
- `beagu-level-api`의 로그인·세션 확인·로그아웃 결과는 **명시적으로 모의 처리**. Lv0 잘못된 코드 거부, Lv1 인증, 통계 화면에서 인증 유지, 세션 해제, Lv2 로그인, 다른 화면으로 이동 후 유지, 챌린지의 정식 계정 로그인/회원가입 진입 UI를 PC·모바일에서 검증.
- `beagu-perf-ingest-v1`도 **Playwright에서만 모의 응답**. 브라우저 `BeaguPerf.record`가 성능 카테고리·시간·UUID만 전송하는지, `Authorization` 헤더·이메일·민감정보를 전송하지 않는지 확인. 다른 외부 네트워크 요청은 중단.
- Lv2 코드 인증만으로 정식 계정 `link_member`가 열리지 않음을 확인하고, 실제 Auth 회원가입 요청이나 Lv3 승급은 시도하지 않음. 프로덕션 호스트 요청도 브라우저 네트워크 기록에서 거부.
- [최초 브라우저 통합 PASS #45093179758](https://github.com/noam0127/beagu-index/actions/runs/45093179758), [정식 계정 연결 차단 포함 재검증 PASS #45093353165](https://github.com/noam0127/beagu-index/actions/runs/45093353165). 자동화된 **가상 Lv1/Lv2 성공**과 **실제 Lv3 E2E**는 명확히 구분한다.

## 실제 시험 Supabase: 무인증/위조 세션 거부

- [실제 HTTP 요청 테스트 코드](https://github.com/noam0127/beagu-index/blob/fix/v110-staging-edited-api-recovery-20261123/tests/staging-browser-auth-real-denials.test.py):
  `beagu-level-api`의 `verify`, `school`, `percentiles`, `offices`, `ranked_schools`, `survey_comparisons`을 무세션으로 요청하고 모두 `AUTH_REQUIRED` 401이어야 한다. 64자리 가짜 세션도 거부.
- `beagu-postit-api-v1` 작성자/학교정보 조회를 무세션·가짜 세션으로 요청하고 `LEVEL_REQUIRED` 403을 확인. 실가입·실참여코드 로그인·DB 쓰기가 발생하지 않는 **부정 검증**이다.
- [최종 통합 검사 #45093475443](https://github.com/noam0127/beagu-index/actions/runs/45093475443) **전체 PASS**: 실제 시험 Supabase의 무인증·위조 세션 접근 차단 + PC/모바일 실제 Chromium(모의 Lv1/Lv2·계측) + 새 Render 브랜치 설정을 적용한 독립 시험 웹 빌드 모두 통과.

## Render 시험 웹 배포 설정의 브랜치 오정렬 수정

- `render.yaml`의 독립 정적 서비스 `baegu-index-v110-sandbox`가 **옛 시험 브랜치** `fix/v1.1.0-preview-isolation-gate-20261123`를 참조하던 부분을 **현재 개발 브랜치** `fix/v110-staging-edited-api-recovery-20261123`로 정정.
- 함께 `tests/test-standalone-staging.py`의 브랜치 불변 조건도 갱신. `autoDeployTrigger: off`, `runtime: static`, `staticPublishPath: ./_standalone_staging` 및 운영 도메인/DB 차단 정책 유지.
- **주의:** GitHub의 Render Blueprint 소스 수정만으로 이미 개설된 Render 서비스 설정/호스트가 갱신되거나 배포되지는 않는다. 정확한 실 Render 배정 도메인·현재 배포 SHA·수동 Blueprint 적용 및 `BEAGU_STAGING_ALLOWED_ORIGIN` 설정은 아직 **검증하지 않음**. Render 사이트 PC·모바일 실배포 E2E 완료라고 주장하지 않는다.
- Render에 실제 배포하게 되면 기존 [읽기 전용 SHA·CSP·호스트 검사](https://github.com/noam0127/beagu-index/blob/fix/v110-staging-edited-api-recovery-20261123/scripts/verify-render-preview.py)와 브라우저 실제 사이트 테스트를 별도로 수행해야 한다.

## 차단 해제 전 남은 사항

- **실제 Lv1·Lv2 양성 인증**은 시험 DB에 유효 코드/실추천 증빙이 없으므로 진행하지 않음. 2026 Google Form 유효 응답 검증이 끝나기 전 추천 Lv2 잠금 해제 금지.
- **실제 Lv3 회원가입·이메일 확인·Auth 세션·기기 소유자 연결** 및 관리자 소유자 AAL2 MFA 양성 E2E 미완료. 채팅창에서 비밀번호/세션/OTP를 수집하지 않음.
- **실제 Render 호스트 브라우저/CORS/E2E 미검증**. 새 성능 계측은 시험 Supabase URL에서만 전송되고 운영 호출은 하지 않는다.
- 시험 Edge 43개·정적 웹 참조 API 17개 설치, 전체 5개 롤아웃 잠금 유지. 안전 승인/전체 PC·모바일 양성 E2E 전 운영 배포 **NO-GO**.

## 최종 불변 확인

- 시험 Supabase의 `auth.users`, `auth.sessions`, `auth.mfa_factors`, `beagu_admin_accounts`, `beagu_level_sessions`, `beagu_private.participants`, 추천 프로필, 성능 샘플·속도 제한·전체 카운터 모두 **0건** 확인. 추천 기능 설정 `public_enabled=false`.
- 시험 Edge 함수 **43개** 등록, 정적 웹 참조 API **17개 설치**, 추천·2026 관리자·학급일지 **5개 기능 잠금**.
- 운영 GitHub `main` SHA `b2460e47aa53c9e06ffc3899fad21aa63cae94bb` 그대로, 운영 Supabase·운영 웹에 쓰기 작업 없음. Render에 실제 사이트 배포는 실행하지 않음.
