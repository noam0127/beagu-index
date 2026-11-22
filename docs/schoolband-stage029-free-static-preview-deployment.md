# 『난감한 스쿨밴드』 029/030 — 무료 독립 시험 미리보기 및 커밋 검증

2026-11-23 · `schoolband-playtest` 브랜치 · **소스/시험 패키지 구현 / 공개 HTTP 접속 미검증 / 출시 게이트 미완료**

## 0. 변경 금지 범위

- 운영 `main`, 운영 웹 `baeguindex.com`, 운영 Supabase DB/Edge Functions의 설정과 자료를 수정하지 않는다.
- 저작권 허락 요청, 유료 API·서비스 가입/결제, 유료 플랜 업그레이드 금지.
- 연주감, 실제 음악·음향 재생, 청음/타격감 검증 금지.
- 학교 교가 게임용 차트는 미등록이므로 버튼을 잠금 상태로 유지한다.

## 1. 실제 조사 결과와 무료 배포 선택 이유

1. 저장소 `noam0127/beagu-index`는 GitHub **public**, 사용자에게 admin 권한이 있으며 `schoolband-playtest` 독립 브랜치가 존재한다.
2. 저장소 루트 `CNAME` 내용이 **`baeguindex.com`**이므로 같은 저장소의 GitHub Pages 설정을 자동으로 켜거나 소스를 바꾸면 운영 도메인과 충돌할 위험이 있다. 029단계에서는 GitHub Pages 설정을 변경하지 않는다.
3. 기존 Vercel에는 `beagu-index`(운영)와 `baegu-index-test`(시험)라는 **서로 다른 프로젝트**가 있다. 시험 프로젝트의 이전 버전 배포는 READY지만 029 게임 최신 커밋이 아니다.
4. 무료 Vercel API 배포를 **`baegu-index-test` 프로젝트의 preview 타깃**에 시도했다. 첫 요청은 잘못된 `target:\"preview\"` 인자로 HTTP 400, 이를 생략하고 재시도하니 **HTTP 402 `api-deployments-free-per-day` 한도(>100건/24시간)**에 도달했다. 배포 생성에 성공하지 않았으며 유료 업그레이드를 하지 않았다. 테스트 프로젝트 기존 PRODUCTION 별칭도 변경하지 않았다.
5. 대안: 이미 공개된 시험 브랜치 파일의 **정적 읽기 전용 HTML**을 무료 Git 원본 변환 프록시 `raw.githack.com`에서 보여주는 방식. 해당 서비스는 공식 Vercel/GitHub Pages가 아닌 **제3자 무료 임시 프록시**이고, 접속 보장·서비스 약관/가용성을 보증할 수 없다. 파일도 이미 공개 GitHub 소스에 한정한다. 실제 HTTP 검증은 아직 성공 증거가 없다.

### 미검증 미리보기 주소 (접속 성공을 보증하지 않음)

- 브랜치 갱신형 시험 안내: `https://raw.githack.com/noam0127/beagu-index/schoolband-playtest/games/nangam-schoolband-v08/preview/index.html`
- 직접 게임: `https://raw.githack.com/noam0127/beagu-index/schoolband-playtest/games/nangam-schoolband-v08/index.html`
- 고정 커밋 시험 URL: `https://raw.githack.com/noam0127/beagu-index/<검증한40자리SHA>/games/nangam-schoolband-v08/preview/index.html`.
  - 위 `<...>` 표기는 실제 URL이 아니라 자리표시자이다. 검증된 커밋을 대입해야 한다.
  - 한 번 고정한 커밋 URL은 운영/시험 브랜치 후속 변경이 있어도 이전 내용에 고정된다.
  - 외부 프록시에서 해당 HTML·차트 JSON을 실제 200으로 응답하는지는 아직 **미확인**이므로 링크를 정식 시험 웹으로 안내하지 않는다.

## 2. 구현 코드

- `games/nangam-schoolband-v08/preview/index.html`: **운영 웹이 아님**을 명확히 알리는 별도 정적 안내 랜딩. 게임 본문은 `../index.html`로 열도록 연결. 실교가 미등록·유료 서비스 미사용·음향 검증 제외를 화면에 표시. `noindex,nofollow`.
- `scripts/test-schoolband-stage029.cjs`:
  - allowlist 대상 3개 공개 정적 자산만 가져옴: 게임 `index.html`, `charts/school-homepages.v1.json`, 시험 안내 `preview/index.html`.
  - `artifacts/schoolband-stage029/site/`에만 파일을 복사하고 SHA-256·파일 크기·Git commit/branch 정보를 `preview-release.json`에 기록. **루트 `CNAME`, 운영 관리 HTML, 설문 데이터, 인증 토큰/환경변수 파일을 배포하지 않음**.
  - Node 내장 HTTP 서버로 4개 경로 HTTP 200, HTML/JSON Content-Type, 소스 SHA-256 일치, 발행된 CNAME이 없음을 테스트.
  - `--external` 선택 시 GitHub Actions의 정확한 40자리 `GITHUB_SHA`를 사용한 `raw.githack.com` URL에서 HTML/JSON 3개 리소스에 대해 HTTP 200, Content-Type, 내용 SHA-256을 검증한다. CDN 캐시/일시 장애는 오류로 기록하고 성공처럼 표시하지 않는다.
  - Node 22 내장 기능만 사용, 추가 외부 패키지·유료 API 없음. 게임음악 시작/청음 테스트 없음.
- `.github/workflows/schoolband-stage029.yml`: **시험 브랜치 전용** push/수동 workflow. README/운영 소스 배포 없이 위 패키지를 7일 보존 GitHub Actions artifact로 업로드하고 CDN 고정커밋 HTTP probe를 실행한다. `permissions: contents: read`뿐이며 GitHub Pages/Vercel 설정을 변경할 권한/절차가 없다.

## 3. 확인 상태 (근거 없는 PASS 금지)

| 항목 | 상태 |
|---|---|
| 소스 브랜치 공개 및 운영 CNAME 확인 | VERIFIED |
| 운영/시험 Vercel 프로젝트 구분 | VERIFIED |
| Vercel 시험 Preview API 배포 | FAILED — 402 무료 배포 일일 횟수 제한 |
| GitHub Pages 자동 변경 또는 유료 플랜 | NOT DONE (의도적 운영 보호) |
| GitHub 안내 페이지·allowlist·해시 검증 스크립트 Git 반영 | IMPLEMENTED |
| Node 테스트 소스 문법 | JS PARSE PASS |
| GitHub Actions 실제 실행 및 artifact 생성 | NOT VERIFIED |
| 로컬 HTTP 200/무CNAME 테스트 실행 | NOT VERIFIED (CI 작성만 함) |
| raw.githack.com 실제 HTTP 200/정확한 SHA 검증 | NOT VERIFIED (도구 네트워크 차단으로 접속 확인 실패) |
| 사용자 실제 브라우저 접속·화면 동작 | NOT VERIFIED |
| 운영 사이트 `baeguindex.com` 변경 | NONE |
| 음악 재생·청음·연주감 검증 | USER-EXCLUDED |

## 4. 롤백/실패 시 안전한 대안

- 이 단계에서는 운영 웹을 바꾸지 않았으므로 운영 롤백 대상이 **없다**.
- CDN 브랜치형 주소가 잘못된 버전을 표시하거나 CDN 장애가 발생하면 해당 URL을 *검증된 과거 커밋*으로 고정한 새 URL을 배포해야 한다. 이는 단순 미리보기 링크 교체이지 운영 DNS/사이트 복구가 아니다.
- CDN 제공자가 이용 불가능하면 GitHub Actions의 정적 ZIP artifact만 전달·로컬 테스트할 수 있지만 이는 외부 접속 가능한 시험 웹을 의미하지 않는다.
- 실제 공개 HTTP URL에 접속할 수 없으면 029 최종 완료는 보류한다. 유료 플랜/운영 Pages로 우회하지 않는다.

## 5. 7개 전문가 역할 검토

1. **리듬게임**: 정적 게임과 학교 홈페이지 JSON만 동봉, 기존 창작곡 연주 가능/실교가 잠금 유지.
2. **음향 데이터**: 음원 다운로드·편곡·청음 검사를 하지 않고 정적 HTML에 이미 있는 자체 창작곡 설계만 사용.
3. **연출**: 실운영과 시각적으로 구별되는 별도 미리보기 안내, 실교가 미등록 표시.
4. **프런트·데이터**: 동일 출처 상대 경로의 홈페이지 목록 로드, JSON 해시 일치, 공개 학교 검색 GET만 허용.
5. **UX·접근성**: 시험 링크/주의사항/키보드 포커스 표시, 실제 동작은 HTTP 검증 후 판정.
6. **보안·운영**: `CNAME` 유출·Pages 운영 도메인 설정 변경 방지, 허용목록 빌드, 별도 시험 프로젝트 프리뷰만 시도, 미승인 음악/인증 토큰 미배포.
7. **QA·배포**: 특정 40자리 Git SHA+SHA256 파일 일치 테스트와 HTTP 200 게이트, 외부 네트워크 실패 시 배포 완료 선언 금지.

## 6. 다음 단계

030/030에서는 실제 시험 웹의 검증/운영 배포 최종 승인 여부를 판단한다. **029는 아직 완료되지 않았다**. 019–028 미확인 GitHub Actions/브라우저 검사·실기 검증도 계속 열린 상태다. 사용자가 명시적으로 금지한 3개 업무는 030에서도 절대 재개하지 않는다.
