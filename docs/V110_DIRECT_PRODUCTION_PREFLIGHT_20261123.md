# 배구지수 v1.1.0 — 시험 웹 생략 후 운영 직접 배포, 1회 통합 사전검증 (2026-11-23)

## 사용자가 승인한 방식
시험 웹을 거치지 않고 **자동 검증을 통과한 운영용 코드만** 실제 웹에 배포한다. 이것은 코드 안전성·기존 사용자 보호·관리자 인증·복원 체계까지 생략하라는 뜻은 아니다.

## 외부 시스템에서 실제 확인한 상태
- 운영 Supabase: `snvzwrexuqavnfvzgxqj`; 2026-11-23 읽기 전용 확인 시 Auth 사용자 **3명**, Auth 세션 **7개**, 활성 owner **1명**. 운영은 완전한 무사용자 환경이 아니다.
- 운영 릴리스 상태: `production_sha=5950755c8174788d7bb1fa879be73a15f25d9ae2`, `staging_sha=41fa2fe4c68cf533f9183806ac3e16f31f662612`. 관리자 시험 SHA와 운영 SHA는 다르며 어느 것도 현재 개발 SHA와 같지 않다.
- 운영 GitHub `main` 읽기 기준 `b2460e47aa53c9e06ffc3899fad21aa63cae94bb` (변경 없이 유지). **실제 배포 SHA와 main 자체가 다르므로, main만 비교해 복사하면 미승인 변경까지 같이 배포될 수 있다.**
- 개발 브랜치 `fix/v110-staging-edited-api-recovery-20261123`는 당시 main과 비교해서 기존 파일 수정 **27개**, 신규 파일 **152개**, 삭제 없음. 수정 파일에는 `js/beagu-level-state-v1.js`, `js/beagu-participation-auth-v2.js`, `js/challenge-member-auth-v1.js`, `js/beagu-page-performance-v1.js`, `challenge.html`, `admin-updates.html`, `scripts/release-manager/worker.py`, `supabase/functions/*` 등이 포함되어 있어 **시험 전용/인증/관리자/운영 코드가 뒤섞여 있다.**
- 시험 Supabase에는 Edge 함수 **43개**, 운영에는 **29개** 등록. 같은 API 이름이라도 코드·버전이 다르고, 특히 Stage 전용 `beagu_stage_*` DB 함수 및 `BEAGU_STAGING_ALLOWED_ORIGIN`이 생산 코드의 안전한 대체품은 아니다.
- 운영 Supabase Security Advisor에는 관련 WARNING: `extension_in_public` 1건, `anon_security_definer_function_executable` 6건, `authenticated_security_definer_function_executable` 6건, `auth_leaked_password_protection` 1건. 이번 단계에서 운영 권한·RLS·Auth 설정은 **변경하지 않음**. 실제 운영 CI에서 먼저 위험 평가해야 한다.
- 운영 GitHub Pages 배포기는 `beagu-release-controller.yml`과 `scripts/release-manager/worker.py`에서 서버 승인을 받은 **고정 production_sha** 아카이브를 게시함. 단순히 main에 커밋하는 것이 실제 웹 배포가 아니며 `prod_apply`는 owner AAL2와 **시험 배포 증명**을 요구한다. 오래된 시험 SHA로 prod_apply를 호출하면 잘못된 v1.1.0이 공개됨.

## 자동검사 실제 실행 결과

- [GitHub Actions #45100113151](https://github.com/noam0127/beagu-index/actions/runs/45100113151) **검사 프로그램 자체 PASS / 운영 직접 배포 판정 NO_GO**. 테스트가 성공한 것과 배포 후보가 승인된 것을 혼동하지 않는다.
- 배포된 SHA `5950755c...`와 개발 후보 당시 SHA `2f739c63...` 사이 **변경 파일 총 216개**: 시험/서버 권한 기능 **99개**, 인증·관리자·데이터 등 실행 변경 **44개**, 개별 검토가 가능한 정적 파일 **2개**, 추가 검토가 필요한 기타 파일 **71개**.
- 고정 운영 SHA와 main 최신 SHA가 다르며, 216개를 한 번에 운영에 배포하면 **시험 전용 함수/API·권한·데이터를 가져갈 위험이 높다**. 실제 배포를 하지 않은 이유는 이 자동검사가 확실한 NO-GO를 반환했기 때문이다.
- 이 검사는 **테스트 웹을 사용하지 않고** 실제 운영 Git SHA와 후보 브랜치 차이만 검증했다. GitHub Pages/운영 Supabase에는 변경을 가하지 않았다.

## 이번 차례에서 실제 완료한 작업

- [운영 고정 SHA 대비 직접 배포 허용성 검사기](https://github.com/noam0127/beagu-index/blob/fix/v110-staging-edited-api-recovery-20261123/scripts/release-manager/direct-prod-readiness.py), [독립 회귀 테스트](https://github.com/noam0127/beagu-index/blob/fix/v110-staging-edited-api-recovery-20261123/tests/test-v110-direct-prod-readiness.py), [읽기 전용 CI](https://github.com/noam0127/beagu-index/blob/fix/v110-staging-edited-api-recovery-20261123/.github/workflows/v110-direct-prod-readiness.yml).
- 차이 범위를 실제로 게시된 `production_sha` 기준으로 분류하며 시험 전용 파일·Auth/관리자/설문·런타임 파일을 **강제 NO_GO**, CSS 등 순수 정적 파일만 별도 검토 가능 후보로 표시.
- CI는 절대 실제 GitHub Pages 배포·Supabase 수정·회원 생성·관리자 승인 우회를 수행하지 않는다. CI 워크플로 성공과 **운영 배포 승인/완료를 혼동하지 않는다.**

## 시험 웹 없이 실제 운영 공개까지 최단 경로

1. **정확한 운영 기준 고정**: 배포 상태 `5950755c...`를 불변 롤백 SHA로 보존. 현재 `main`에서 이미 배포되지 않은 변경과 개발 브랜치의 새 변경을 구분해 순수 운영 릴리스 후보를 구성한다. `data/public-compare-school-directory-v1.json`을 이전 생성 시각으로 복사해 최신 데이터가 퇴행하지 않도록 한다.
2. **잠금 기능 제외**: 실 이메일 인증·Lv3·추천·학급일지 비밀번호·2026 관리자 심사 등 실제 실양성 검증이 없는 기능은 릴리스에서 비활성/숨김 유지. 개발용 Stage DB URL·Publishable key·테스트용 Edge handler·모의 Auth 경로와 `beagu_stage_*` 서버 함수는 운영에 복사하지 않는다.
3. **자동 CI로 운영용 후보 검증**: 현재 운영 API 계약+E2E 음성 검사, 브라우저 데스크톱/모바일 공개 경로, 개인정보·RLS·CSP·권한 점검, 정적 파일 패키징, 사용자 3명의 기존 세션·인증 호환성, 오류 복구·되돌리기 증명을 모두 확인한다. UI 테스트는 모의 서버를 사용했다는 사실을 명시하고 실제 양성 인증이라고 주장하지 않는다.
4. **관리자 승인 유지·시험 단계만 생략**: CI가 충분한 *명시적 허용 경로*를 구현하기 전에는 기존 `prod_apply` 요구 조건을 임의 제거하거나 승인된 척 호출하지 않는다. 정식 허용 경로가 생기더라도 owner의 살아 있는 AAL2 로그인, 배포할 SHA·버전·변경 파일·자동검사 증거, 동일 SHA 직접 배포 동의, 롤백 대상 확인이 필요하다.
5. **게시 후 실제 기능 점검**: 배포 메타/버전/SHA, 200/404 라우팅, 비식별 페이지 계측, 운영 로그인 무퇴행, 잠금 기능 접근 차단 검증. 실패 시 운영의 원래 고정 SHA로 되돌리는 절차를 준비한다.

## 현재 판정

**NO-GO, 운영 웹/DB/깃허브 main 미변경.** 이용자가 적다는 이유만으로 운영의 3개 Auth 계정·7개 세션이나 민감한 학교별 정보의 보호 요구가 줄지는 않는다. 현재 개발 브랜치를 그대로 게시하거나, 오래된 `41fa2fe4...` 시험 버전을 운영에 적용해서는 안 된다.

다음 차례에 할 작업은 더 많은 실험 기능을 만드는 것이 아니라, **실제 게시 SHA에서 변경점을 시작하는 운영용 격리 릴리스 후보 + 자동 테스트 + MFA 승인 경로**로 압축한다.
