# 배구지수 통합 업데이트 v2.0 · 13단계 — 독립 시험 웹 빌드 경로

기준: 2026-11-22 / 브랜치 `integration/release-v2-step13-isolated-staging-20261122`.

## 목표 및 실제 개발

지금까지 `https://baeguindex.com/_preview/` 경로로 시험 코드를 게시하면
GitHub Pages의 **운영 루트와 시험 경로가 같은 배포 아티팩트에 들어간다**.
즉, 시험 웹을 다시 게시하는 작업만으로도 운영 사이트 파일이 함께 게시될 위험이 있다.

이를 해소하기 위한 코드를 **분리된 개발 브랜치**에 구현했다.

1. `scripts/release-manager/build-isolated-staging.py`: 정확한 Git 커밋 SHA로부터
   **운영 사이트 루트가 포함되지 않은 단독 정적 사이트**를 빌드한다.
   운영용 `CNAME`, `_preview/`, 관리자 작업 스크립트, SQL, GitHub Actions,
   테스트 파일은 출판 파일 목록에서 제외한다.
2. 모든 HTML/JS/CSS/JSON의 운영 Supabase 프로젝트 ID 및 공개키와
   운영 사이트 링크를 **시험 프로젝트/독립 HTTPS origin**으로 치환한다.
   원래 Git 소스 파일과 운영 사이트 산출물은 수정하지 않는다.
3. `connect-src`는 시험 Supabase와 자기 사이트만,
   `form-action`과 `frame-src`는 자기 사이트만 허용하는 CSP
   메타 태그를 추가한다. Google Forms·Apps Script·외부 iframe 등은
   **샌드박스용으로 별도 분리/검증하기 전에는 시험 웹에서 제한될 수 있다.**
4. 모든 HTML에 검색 엔진 차단 메타와 눈에 보이는 시험용 배너,
   별도 `robots.txt`를 추가한다.
5. `.github/workflows/staging-isolated-artifact-validation.yml`:
   읽기 전용 PR CI, 운영 배포 권한 없는 빌드, 하루 동안 보관되는
   **GitHub Actions 검토용 사이트 아티팩트** 생성.
   이 워크플로에는 `pages:write`, `id-token:write`,
   `deploy-pages`, Supabase DB/Edge write가 없다.
6. 이전 `.github/workflows/beagu-release-controller.yml`의 운영과
   `/_preview/`를 함께 출판하는 작업은 **개발 코드에서만**
   `if: ${{ false }}`로 잠근다. `main`으로 병합/배포하지
   않았으므로 **현재 운영의 기존 릴리스 워커가 중단됐다는 뜻은 아니다.**
7. `tests/release-step13-standalone-staging.py` 및
   `tests/release-step13-isolation-policy.mjs`로 차단 규칙, 입력 검증,
   소스 코드 불변성, 산출물의 운영 Supabase 참조 제거, 페이지 배포 방지 등을 확인한다.

## 현재 상태(읽기 전용)

- 시험 Supabase 프로젝트: `ycwuugggqbunlbwuzvbx`
- 2026-11-22 확인 당시 `public` 업무 테이블 0개
- 활성 Edge Functions는 `beagu-test-v1`, `beagu-stage-preview` 2개만 확인
- 실제 독립 호스팅 도메인/프로젝트는 **연결·구성·배포하지 않음**
- `docs/releases/v2-step13-staging-readiness.json`의 판정: **BLOCKED**
- 기존 시험 웹은 계속 `https://baeguindex.com/_preview/`에
  남아 있으며, 이번 단독 산출물이 실서비스 URL에 게시된 것은 아님

## 별도 호스팅 적용 전 절대 조건

1. **독립된 HTTPS origin과 정적 호스팅 프로젝트**를 실제로 설정하고
   운영 GitHub Pages/CDN 도메인과 공유 배포 권한이 없음을 확인한다.
   Vercel과 같은 별도 호스팅 서비스는 향후 선택 가능하지만,
   아직 연결하거나 배포하지 않았다.
2. 시험 Supabase의 필요한 최소 업무 스키마·RLS·사용자 인증 관련
   URL/Redirect URL과 필수 Edge Functions를 안전하게 준비하고 검증한다.
   운영 데이터 복제나 운영 서비스 역할키 공유는 금지한다.
3. 독립 호스팅 origin을 정확히 설정하여 이 스크립트로 후보를 재빌드한다.
   현재 검증용 `https://preview-build.invalid`는 **실제 배포 주소가 아니다**.
4. 브라우저 네트워크에서 운영 Supabase 또는 실제 Forms/Apps Script에
   쓰기 요청이 나가지 않는지 검사한다. 수동 회원가입/포스트잇/추천
   테스트는 반드시 가상 테스트 데이터·시험용 계정만 사용한다.
5. 운영 게시를 막는 안전 잠금 해제는 관리자 명시적 승인과 별도 PR,
   독립 릴리스 파이프라인 검증 후에만 논의한다.

## 재현 가능한 비운영 검사

```bash
python3 tests/release-step13-standalone-staging.py
node --test tests/release-step13-isolation-policy.mjs
python3 scripts/release-manager/build-isolated-staging.py \
  --sha "$(git rev-parse HEAD)" \
  --origin https://preview-build.invalid \
  --output /tmp/beagu-audit-only-staging
```

여기서 생성하는 사이트는 로컬/CI **검토용 아티팩트**이며
출시 승인·시험 웹 실배포·운영 데이터 작업이 아니다.

## 14단계로 넘기는 차단 항목

실제 호스팅 대상 설정, 시험 Supabase 업무 스키마 및 RLS·Auth 준비,
안전한 읽기/쓰기 API의 통합 테스트, 시험 도메인 인증 리디렉션 점검을
**승인 전에는 실행하지 않는다.**

특히 이번 13단계에서 GitHub Actions가 성공하더라도
**독립 호스팅 정상 접속 및 시험 DB 기능의 통과**라고 표현하지 않는다.
