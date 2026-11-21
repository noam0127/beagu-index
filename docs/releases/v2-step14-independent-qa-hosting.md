# 배구지수 통합 업데이트 시스템 v2.0 — 14단계 독립 시험 호스팅 준비·실제 Chromium 검사

2026-11-22 (KST) · **운영·시험 웹 배포 없음 · 운영/시험 DB 변경 없음 · 릴리스 버전 생성 없음**

## 현재 확인한 배포 구조

- 운영 `baeguindex.com`은 GitHub Pages 기반이며 운영 릴리스 버전은 `관리자 배포 시스템 1.0` (DB 읽기 전용 확인).
- 기존 `baeguindex.com/_preview/`은 최근 별도 작업에 의해 `1.1.0-qa.20261122`로 배포된 것으로 기록됐다.
- 저장소 루트의 `wrangler.jsonc` 이름은 **`beagu-index`**. 이를 통합 QA 호스팅에 재사용하면 운영 프로젝트와 혼동될 위험이 있다.
- 따라서 13단계의 SHA 고정 웹 후보 빌더는 그대로 사용하고, 14단계에서는 **외부 호스팅 없는 실제 브라우저 QA** + **분리된 호스팅의 배포 경로를 잠금 상태로 준비**한다.

## 1. 실제 Chromium 브라우저 QA

새 파일:
- `scripts/release-manager/qa-browser-smoke.cjs`
- `.github/workflows/release-v2-browser-qa.yml`

GitHub Actions가 PR의 고정된 HEAD를 체크아웃하고 해당 SHA의 웹 파일만 임시 폴더에 빌드한다.
Python HTTP 서버를 **127.0.0.1:8134**에만 열고 Chromium에서
데스크톱(1365×900)과 모바일(390×844)을 검사한다.
기본 대상 페이지는 홈·챌린지·관리자 업데이트·Lv1 검색·학교 비교의 각 5개다.

브라우저 네트워크의 모든 요청은 Playwright에서 가로챈다.
`127.0.0.1:8134` 로컬 요청만 허용하고 CDN·운영/시험 Supabase·기타 외부 주소는
**모두 차단**한다. 실제 로그인을 시도하거나 데이터를 작성하지 않는다.
HTML 200 응답, 제목·본문·링크, QA 표시, robots 및 시험 Supabase CSP를 확인한다.
CI에서 작은 `browser-manifest.json`만 1일간 보관하며, 전체 웹·학교 자료와
스크린샷은 저장하지 않는다.

**한계:** CDN 스크립트와 Supabase 요청을 차단하므로 정적 UI의 브라우저 표시·기초 탐색을
검사할 수는 있지만 **회원가입/로그인, 실제 학교 검색, 인증·RLS, 포스트잇 쓰기 등의 기능 E2E는 미실행**이다.
CI 합격을 출시 준비 완료로 해석하지 말아야 한다.

## 2. 외부 호스팅 경로는 준비하되 업로드는 잠금

새 파일:
- `docs/releases/v2-step14-qa-hosting-policy.json`
- `scripts/release-manager/qa-hosting-preflight.py`
- `.github/workflows/release-v2-independent-qa-hosting.yml`
- `tests/release-step14-hosting-plan.py`

**제안한 전용 프로젝트명:** `beagu-v2-isolated-qa` (Cloudflare Pages Direct Upload).
이는 GitHub Pages 운영 웹과 완전히 다른 프로젝트를 사용하기 위한 **제안명**이며,
아직 실제 프로젝트를 생성하거나 공개 URL을 발급하지 않았다.

호스팅 워크플로는 `workflow_dispatch` 수동 검사만 지원하며 자동 PR/push/schedule 배포는 없다.
배포 작업은 코드에 **`if: ${{ false }}`**로 잠겨 있고,
Python 승인 정책에도 별도 **`QA_EXTERNAL_PUBLICATION_LOCKED=True`**가 있다.
설정 JSON을 외부에서 `ready=true`로 바꾸거나 후보 SHA를 조작해도 업로드 허용으로 바뀌지 않는다.
기존 `beagu-index` 운영 Cloudflare 프로젝트와 `CNAME`은 사용하지 않으며,
해당 잠금을 해제하려면 사용자 명시적 동의 후 **별도의 검토된 코드 변경**이 필요하다.

Cloudflare API 토큰·계정 ID는 이번 작업에서 만들거나 사용하지 않았다.
향후에는 **별도 QA Pages 프로젝트를 직접 생성하고**, Cloudflare Access,
보호된 GitHub 환경, 권한을 최소화한 QA 프로젝트 전용 API 자격증명,
메인 도메인과 별개의 QA 주소를 검증한 뒤에야 작업을 활성화한다.

### 특히 주의할 점: Pages preview URL 기본 공개

Cloudflare Pages의 preview URL은 기본적으로 공개될 수 있으므로,
`noindex`나 QA 안내 배너만으로 접근을 제한했다고 볼 수 없다.
Cloudflare Access의 접근 정책을 구성하고, **분기별 프리뷰 URL뿐 아니라
기본 `*.pages.dev` 주소의 공개 여부도 별도 확인**해야 한다.
Access 구성·실제 도메인 확인 전에는 출판 작업을 잠금 상태로 둔다.

공식 자료:
- https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/
- https://developers.cloudflare.com/pages/get-started/direct-upload/
- https://developers.cloudflare.com/pages/configuration/preview-deployments/
- https://developers.cloudflare.com/pages/platform/known-issues/

## 자동 검증·현재 완료 기준

- 브라우저 QA: 고정 SHA, 로컬 HTTP, QA 배너, 외부 네트워크 전면 차단,
  운영 URL 요청 감지, PC·모바일의 HTML 검사
- 호스팅 정책: 운영과 다른 프로젝트명, 전체/부분 SHA 검증,
  CNAME 및 배포 파일 제거, 워크플로 `if: false` 확인,
  모든 부정합·위조 정책에서도 업로드 잠금 유지
- 기존 릴리스 센터 타입·보안·패키징 및 GitHub PR CI는 그대로 유지
- 외부 QA 호스팅 **미생성**, 후보 배포 **0회**, DB 변경 **0건**,
  `main` 병합 **0회**, 불변 릴리스 버전 생성 **0회**

**다음 15단계:** 시험 DB 업무 스키마/인증·RLS 및 브라우저 실제 API 연동 검증을
운영과 분리된 환경에서 준비한다. 외부 QA URL 게시 여부는 별도 명시적 승인 이후에만 처리한다.
