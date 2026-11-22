# 배구지수 v1.1.0 — 시험 Render 출처(CORS) 보호

## 발견한 차단 원인

2026-11-23 읽기 전용 검사에서 다음 6개 함수의 GitHub 코드 및
시험 Supabase 실제 배포 상태를 확인했다.

- `beagu-level-api` — 참여코드/Lv1/Lv2
- `beagu-postit-api-v1` — 회원 연동
- `beagu-admin-access` — 관리자 권한 및 MFA
- `beagu-admin-dashboard-v1` — 관리자 통계
- `beagu-admin-members-v1` — 관리자 회원관리
- `beagu-telemetry-v2` — 방문/활동 계측

현재 운영용 코드의 허용 출처에는 Render 시험 사이트가 없다.
시험 프로젝트에 배포된 함수는 일부가 **로컬 테스트 주소만** 허용하도록
별도로 수정되어 있다. 따라서 운영용 소스를 그대로 시험 프로젝트에
배포하면 기존 시험 프로젝트의 보호 정책이 풀릴 위험도 있다.

## 안전한 공통 정책

`supabase/functions/_shared/staging-origin.ts`에는 정확한 프로젝트 URL로
구분되는 정책을 추가했다.

- 운영 프로젝트: **기존 운영 CORS 허용 목록을 그대로 사용**하고
  환경 변수 값만으로 Render 출처를 추가하지 않는다.
- 시험 프로젝트 `ycwuugggqbunlbwuzvbx`: 기존 허용 목록 중
  지정된 로컬 QA 주소만 유지한다. 운영 도메인과 다른 GitHub Pages,
  제3자의 Render 도메인은 거부한다.
- 시험 프로젝트에 `BEAGU_STAGING_ALLOWED_ORIGIN`이 정확히
  `https://<실제로 발급된 이름>.onrender.com`으로 설정되면 그 **단일 출처만**
  추가한다. 와일드카드, 포트, 하위 경로, IP, HTTP는 허용하지 않는다.
- CORS 허용은 사용자 권한이 아니다. 관리자 allowlist, JWT/AAL2/MFA,
  Lv1/Lv2 권한 조건은 반드시 서버에서 별도로 검사한다.

## 실제 적용 전 순서

1. Render 독립 시험 사이트를 연결하고 **실제 발급된 HTTPS 주소**를 확보한다.
   서비스 이름만으로 추측한 URL은 사용하지 않는다.
2. 시험 Supabase 프로젝트의 환경 변수
   `BEAGU_STAGING_ALLOWED_ORIGIN`을 정확한 Render origin으로 지정한다.
   운영 Supabase에는 이 변수를 추가하거나 수정하지 않는다.
3. 현재 **시험 프로젝트에 배포된 함수의 실제 코드**와 GitHub 개발
   브랜치의 각 함수를 비교한 후, 단계별로 시험 전용 CORS 변경만 통합한다.
   현재 배포본은 일부 함수가 QA용으로 따로 수정되어 있으므로
   GitHub 파일을 무조건 덮어쓰면 안 된다.
4. 각 시험 함수의 OPTIONS 응답에 정확한
   `Access-Control-Allow-Origin` 값이 있고, 운영 도메인과 다른 Render
   도메인 요청은 여전히 거부되는지 읽기 전용 요청으로 검증한다.
5. 그다음에만 이메일 실계정·참여코드·관리자 MFA E2E를 진행한다.

**이번 GitHub PR은 코드와 자동검사만 변경한다.** Supabase Edge Function
실배포·환경 변수 변경·Render 연결·운영 배포는 하지 않는다.

공식 문서:
- https://supabase.com/docs/guides/functions/cors
- https://supabase.com/docs/guides/functions/secrets
