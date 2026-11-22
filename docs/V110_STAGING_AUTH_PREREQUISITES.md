# 배구지수 v1.1.0 — 실제 시험 인증 준비도

2026-11-23 읽기 전용 조회에서 **시험 Supabase** `ycwuugggqbunlbwuzvbx`의
`auth.users`, 이메일 확인 사용자, MFA 등록, 활성 관리자, 참여코드, 추천 달성 프로필,
Lv2 포스트잇 계정 연결이 모두 **0**으로 확인되었다.

> 이 숫자는 조회 당시의 상태이며 지속적으로 변할 수 있다.
> 모의 E2E 성공은 실제 인증 계정 존재나 운영 배포 안전의 증거가 아니다.

## 1. 준비도 진단(읽기 전용)

Supabase 대시보드에서 **반드시 시험 프로젝트 ID**를 확인한 후,
`scripts/staging/auth-readiness.sql`을 읽기 전용으로 실행한다.
결과 단일 행의 **숫자 집계만** JSON 파일에 저장한다. 이메일·비밀번호·토큰·개인
ID·휴대폰번호·service_role 키는 저장하거나 업로드하지 않는다.

```sh
node scripts/staging/check-auth-readiness.cjs --input stage-counts.json
```

종료 코드 2는 미준비, 1은 잘못된 입력/프로젝트, 0은 실제 브라우저 검사를
시작할 전제조건이 존재한다는 뜻이다. **0도 실사용자 E2E 통과는 아니다.**

CI의 `tests/staging-auth-readiness.cjs`은 테스트 데이터를 사용한
검증기 자체의 단위 테스트로, 실제 계정을 만들거나 실서비스에 접근하지 않는다.

## 2. 테스트 환경을 준비하는 순서

1. Render에 개발 브랜치를 쓰는 별도 시험 정적 사이트를 생성하고,
   실제 `https://<시험-주소>.onrender.com`을 확보한다.
2. 시험 프로젝트 Authentication → URL Configuration에서 이 정확한 origin의
   `challenge.html`과 `postit.html` 복귀 주소 두 개를 허용한다.
3. 시험 프로젝트에만 **별도 테스트 이메일 계정**을 생성하고 이메일 확인을
   완료한다. 운영 실사용자 계정 및 운영 DB 데이터는 가져오지 않는다.
4. Lv1·Lv2 검증은 임의로 권한 숫자를 수정하지 말고, 별도
   시험용 참여코드와 유효한 추천 달성 과정을 통해 만든 데이터를 사용한다.
   현재 데이터가 없어 실제 Lv2 검증은 시작할 수 없다.
5. 관리자 MFA는 확인된 별도 시험 Auth 계정을 명시적으로
   `public.beagu_admin_accounts`에 활성화된 `owner` 권한으로
   등록한 후 관리자 로그인 화면에서 TOTP를 등록·검증한다.
   **관리자 승인·등록은 수동으로 수행하며 이 도구가 대신하지 않는다.**
6. 준비도 재조회에서 전제조건이 모두 참이면 PC·모바일
   이메일 인증, Lv1/2, Lv3, 관리자 MFA의 **실제** E2E를 실행한다.

관리자 테이블의 `enabled`와 `role`만으로 충분하지 않다. 서버는
Supabase Auth JWT 인증, `aal2` 및 활성 MFA 세션도 확인한다.
권한 등록 전 사용자가 직접 해당 시험 계정과 프로젝트를 확인해야 한다.

## 3. 권한과 배포 경계

- 현재 진단은 **SELECT 집계만** 사용하며 데이터를 수정하지 않는다.
- 운영 프로젝트 `snvzwrexuqavnfvzgxqj`에서 위 SQL을 실행하지 않는다.
- 독립 시험 웹의 2026 운영 설문 링크는 `/staging-survey-unavailable.html`로 바꿔 제공한다.
  실제 설문 또는 추천 실적 E2E는 **별도의 시험 설문 및 시험 데이터 연동**이 준비된 뒤에만 진행한다.
  테스트를 위해 운영 Google 설문에 응답을 제출하지 않는다.
- 실계정 확인, MFA 등록, Auth URL Configuration은 시험 프로젝트에서만 한다.
- 기능 E2E가 완료되어도 배포 승인·GitHub `main` 업데이트는 별도 통제한다.
- 인증/배포 자격증명은 ChatGPT나 GitHub 코드·PR 코멘트에 직접 붙여넣지 않는다.
