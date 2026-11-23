# 배구지수 v1.1.0 — 실제 Render 배포·CORS·Lv3 인증 준비 확인 (2026-11-23 KST)

## 핵심 판정

**운영 배포 NO-GO.** 시험 Edge API의 설치 성공은 실제 Render 웹사이트가 배포되거나 이메일 회원가입이 통과했다는 증거가 아니다.

- 시험 Supabase `ycwuugggqbunlbwuzvbx`는 `ACTIVE_HEALTHY`.
- 실제 읽기 전용 Auth SQL (운영 DB 미접근): `auth_users=0`, `confirmed_users=0`, `verified_mfa_factors=0`, `enabled_owners=0`, `owner_with_verified_mfa=0`, `active_level_codes=0`, `referral_profiles=0`, `earned_lv2_profiles=0`, `linked_member_accounts=0`. 따라서 실제 Lv3 회원가입·이메일 인증, 추천 달성 Lv2·관리자 AAL2 MFA 양성 E2E **실행 불가**.
- 독립 Render Blueprint `render.yaml`: 브랜치 `fix/v110-staging-edited-api-recovery-20261123`, `runtime: static`, `autoDeployTrigger: off`. 브랜치 설정은 정렬됐지만 실제 Render 서비스 배포를 의미하지 않는다.
- GitHub 관리 연결은 있으나 **Render 서비스 관리 연결은 현재 없음**. 연결·승인 없이 Render 계정/호스팅을 임의 생성하거나 유료 서비스를 신청하지 않는다.

## 실제 읽기 전용 호스트 진단

- 일회성 GitHub Actions [#45094279448](https://github.com/noam0127/beagu-index/actions/runs/45094279448)을 통해 서비스 이름에서 추정한 후보 `https://baegu-index-v110-sandbox.onrender.com`을 **실제 외부 HTTPS로 확인**.
- 후보 주소의 `/beagu-preview-health.json`이 **HTTP 404** 반환. 해당 주소에서 현재 SHA의 독립 시험 웹이 준비됐다는 증거 없음.
- **후보 주소는 Render가 실제 배정한 주소라고 확인되지 않았음**. 404는 Render 사이트 미생성, URL 불일치, 배포 지연·누락, 또는 빌드 경로 문제 모두와 양립한다. 서비스가 실제로 존재하지 않는다고 단정하지 않는다.
- 자동 검사 코드는 외부 호스트에서 GET만, 시험 Supabase에서는 OPTIONS만 사용한다. 실설문·관리자 변경·로그인·회원가입·개인정보 기록 변경 없음.
- [통합 검증기](https://github.com/noam0127/beagu-index/blob/fix/v110-staging-edited-api-recovery-20261123/scripts/staging/check-render-live-sha-cors.py): 정확한 `*.onrender.com` HTTPS 원본 URL 및 전체 Git SHA를 요구한다. 기존 `verify-render-preview.py`의 **사이트 SHA/스테이징 식별자/robots/noindex/CSP/운영 관리자 UI 차단 등 10개 GET 확인**을 모두 통과한 뒤에만, 시험 Supabase의 `beagu-level-api`, `beagu-postit-api-v1`, `beagu-perf-ingest-v1`, `beagu-2026-review-admin` 4종의 실제 CORS OPTIONS를 확인한다. Origin이 **정확히** Render 주소와 일치하고 허용 method/headers와 `Vary: Origin`이 있어야 통과.
- [실패 차단 자동 테스트](https://github.com/noam0127/beagu-index/blob/fix/v110-staging-edited-api-recovery-20261123/tests/test-render-live-sha-cors.py) 통과: SHA 불일치, 없는 웹사이트, 운영 Origin으로의 CORS fallback, wildcard Origin, 필요한 인증 헤더 누락, 외부 URL을 모두 거절한다. **이 테스트는 오프라인 모의 검증**이며 실제 Render 성공 증거가 아니다.
- [검증 워크플로](https://github.com/noam0127/beagu-index/blob/fix/v110-staging-edited-api-recovery-20261123/.github/workflows/v110-render-live-probe-once.yml): 처음엔 후보 주소를 검사하고 `render_verified=false`로 **NOT VERIFIED** 처리. 나중에 Render의 실제 서비스 URL을 확인한 후 Actions `workflow_dispatch` 입력 `render_origin`에 전달할 수 있다. CI 워크플로 자체의 성공과 **Render 배포 인증 성공은 별개**이므로 반드시 `render_verified=true`인지 확인한다.

## 서비스 소유자가 실제 Render 사이트를 설정할 때 필요한 조건

1. Render Dashboard에서 **현재 시험 전용 정적 서비스**의 실제 assigned `https://*.onrender.com` 주소와 GitHub 연결 브랜치를 확인한다. 없다면 `render.yaml` Blueprint로 독립 시험 정적 서비스만 생성한다. **운영 도메인·운영 DB·GitHub main과 연결하지 않는다.**
2. `autoDeployTrigger: off` 유지, 배포할 때 **현재 시험 개발 브랜치의 전체 40자리 Git SHA**를 확인하고 Render에서 수동 배포한다. 배포 후 `/beagu-preview-health.json`이 SHA와 `ycwuugggqbunlbwuzvbx`를 명시하는지 먼저 확인한다.
3. 정확한 Render 호스트가 확인된 경우에만 **시험 Supabase**의 `BEAGU_STAGING_ALLOWED_ORIGIN`에 정확한 HTTPS Origin 문자열을 설정한다. 프로덕션에 해당 변수를 설정하지 않는다. 연결 전에 보안 관리자/정식 계정 기능 잠금은 해제하지 않는다.
4. GitHub Actions의 **`v1.1.0 one-time read-only Render site and CORS readiness probe`**를 `Run workflow`로 실행하고 `render_origin`에 실제 서비스 주소를 입력한다. 검증 로그의 `render_verified=true`를 확인해야 실제 웹 SHA·CORS가 준비됐다고 판단할 수 있다.
5. 그 다음 별도 PC/모바일 **실제 Render 호스트** 브라우저 E2E를 실행한다. 기존 CI의 localhost에서 모의 Lv1·Lv2 응답으로 실행한 Chromium 검사는 이를 대체하지 않는다.

## 실제 Lv3 회원 및 관리자 MFA 검증 전제

- 시험 Supabase Auth에서 **실제 시험용 이메일**을 사용하여 회원가입·이메일 확인을 마치고, Auth redirect allowlist가 실제 Render `challenge.html` 주소만 허용하는지 검사해야 한다.
- Lv3는 **단순 가입 요청 성공만으로 인증 완료라 주장하지 않는다**. 이메일 확인, 현재 JWT의 `sub` 일치, Lv2 추천 달성 상태 검증, 기존 개인 고유번호·기기 권한 연결을 별도 서버 측에서 검사해야 한다.
- 시험 관리자 AAL2 검증은 **실제 이메일 인증된 관리자 소유자 계정과 실제 TOTP MFA 등록 및 활성 세션**이 생긴 뒤에만 실행한다. 가상의 AAL2 DB 행은 E2E 근거가 아니다.
- API 17/17 설치, 시험 Supabase Edge 43개, 잠금 기능 5개이며 실제 웹 배포·Lv3·MFA 등 3가지의 양성 E2E는 아직 **미통과**. 운영 웹·DB·main 변경 금지 유지.

## 2026-11-23: 시험 API의 저장소/배포본 불일치 해소 및 CORS 엄격화

- **중요 발견:** 원래 `supabase/functions/beagu-level-api/index.ts` 파일은 실제 시험 Supabase에 배포됐던 `beagu-level-api` v5의 코드와 다르다. 실제 v5에는 `verifiedMemberTier`, `isVerifiedLv3Member` 및 개인 고유번호·Auth 연결 확인 로직이 더 있다. 같은 방식으로 포스트잇 v4에도 최신 회원 소유권 로직이 포함되어 있다. **원본 GitHub 함수 파일을 그대로 재배포하면 Lv3·회원 소유권 기능이 퇴행할 수 있으므로 금지**한다.
- 시험 서버에서 실제 제공되던 `beagu-level-api` v5의 원본 소스·공유 의존 파일 총 6개, `beagu-postit-api-v1` v4의 원본 소스·공유 파일 총 2개를 개발 브랜치 `scripts/staging/recovered-beagu-level-api-v5/`, `scripts/staging/recovered-beagu-postit-api-v4/`에 보존했다.
- **시험 서버만 재배포:** 기존 기능을 유지한 채 정확한 Render Origin 검사를 적용한 `beagu-level-api` **v6 ACTIVE**, `beagu-postit-api-v1` **v5 ACTIVE**. `SUPABASE_URL`이 반드시 `ycwuugggqbunlbwuzvbx`여야 하고, 로컬 시험 출처 또는 `BEAGU_STAGING_ALLOWED_ORIGIN`에 등록된 한 개의 정확한 Render HTTPS 도메인만 허용. 운영 출처·임의 Render 출처·빈 Origin은 CORS 응답 없이 HTTP 403. 이 비밀 설정 값이 등록되기 전까지 Render 출처는 **거부**된다.
- [실제 HTTP 보안 검사 #45094909765](https://github.com/noam0127/beagu-index/actions/runs/45094909765) **PASS**: 4개 API(Level, Postit, 2026 reviewer, performance gateway)의 로컬 CORS·Headers·Vary, 운영 두 도메인/임의 Render/빈 Origin 사전 요청 차단, Lv1/포스트잇 무세션 GET 차단. 실제 회원가입·승급·브라우저 Render 호스트 E2E 미실시.
- 변경 후 시험 API 총 43개, 참조 17/17개 설치, **추천 2개·학급일지 2개·관리자 1개 잠금 유지**. 운영 웹·운영 DB·GitHub main은 변경하지 않음. Render 후보 주소의 health 404 역시 미해결이므로 배포 및 SHA 확인은 **NOT VERIFIED**.
