# 배구지수 계정 보안 감사 — 2026-11-19

**상태: GitHub Draft PR #49의 개발 브랜치만 변경. 운영 Edge, 기존 HTML, Forms/Apps Script, Supabase 데이터베이스 미변경. 네 계정 기능 플래그 기본 OFF.**
기존 사용자가 접근하는 페이지에는 가입/로그인/복구 버튼을 추가하지 않았다.

## 실제 프로젝트 점검 결과

- 운영 Supabase 프로젝트 ref: snvzwrexuqavnfvzgxqj, ACTIVE_HEALTHY.
- 운영 Auth 사용자: **0명**(집계값만 조회했으며 이메일 등 개인정보는 조회하지 않음).
- 새 비공개 account_profiles_v1과 account_v1_settings: 운영 DB **미설치**.
- 신규 beagu-account-v1 Edge: **운영 미배포**.
- 기존 추천/레벨2 플래그 public_enabled/ingest_enabled/login_enabled 모두 false.
- auth.users 참조: public.survey_submissions.user_id는 **ON DELETE SET NULL**. Auth 사용자 삭제 시 설문 제출 행 자체는 남음. 설문 원본 삭제를 약속해서는 안 되며 별도 개인정보 처리·익명화 정책이 필요.
- Security Advisor: 기존 3건의 익명 호출 가능한 SECURITY DEFINER 함수, extension_in_public 경고 등이 남음. 본 계정 브랜치의 신규 RPC는 service_role에만 권한을 주도록 설계했지만 **운영 DB 마이그레이션 테스트 전**.
- 프로젝트 설정 중 SMTP, 이메일 확인 강제, CAPTCHA, Redirect URL 허용 목록은 현재 연결된 도구로 직접 조회·검증할 수 없음. **설정 완료라고 주장하면 안 됨.**

## 1. 비밀번호 재설정

**개발 브랜치에 준비 완료, 실제 메일/재설정 통합 테스트 미실행.**

- 신규 account-password-reset.html, js/beagu-account-password-reset-v1.js.
- 민감한 토큰이 주소창에 남지 않도록 token_hash 쿼리를 읽은 직후 history.replaceState.
- 페이지에는 기존 요구에 따라 **버튼 없음**. 새 비밀번호·확인 입력 후 Enter/완료로 제출. 유효하지 않은 복구 링크에서는 폼이 보이지 않음.
- 신규 API action=complete-recovery: Supabase Auth verifyOtp({token_hash,type:'recovery'})로 **일회용 복구 증거를 확인**하고 updateUser({password}) 사용. 성공 후 모든 세션의 refresh 토큰 철회 시도.
- 코드번호·UUID·일반 사용자 ID만으로 비밀번호를 바꾸는 API는 없음. 복구 기능 플래그 OFF 유지.
- **운영에 반드시 필요한 템플릿 변경**: Supabase Authentication → Email Templates → Reset Password 메일의 링크가 다음 형태를 가리키도록 구성해야 함.
  `https://baeguindex.com/account-password-reset.html?token_hash={{ .TokenHash }}`
- 이 링크 구성은 기존 Supabase 기본 recovery 콜백(#access_token=...)과 다를 수 있다. **현재 기본 템플릿으로는 이 화면이 작동한다고 보장하지 않음**.
- 암호 확인, 만료·재사용, 일반 JWT 불허, 리셋 후 재로그인, 같은 계정 다중기기 세션에 대해 통합 테스트 필요.
- 실제 출시 시에는 접근성 관점에서 '버튼 없음' 설계의 모바일·보조기기 사용성을 별도 확인해야 함.

## 2. 탈퇴·정보 삭제

**새 API 코드는 준비, 실제 운영 데이터 연동 및 삭제 실험은 미실행**.

- 신규 action=delete-account는 JWT의 실제 Auth user와 최근 입력받은 현재 비밀번호의 재인증을 요구. 요청 확인 문구는 DELETE_MY_ACCOUNT.
- 두 인증의 user ID가 완전히 일치해야 처리. 위조 UUID/고유번호/클라이언트의 임의 user_id는 무효.
- 성공 시 Auth 세션 refresh 토큰 전역 무효화 후 Auth 사용자 삭제(하드 삭제). 앱 account_profiles_v1은 ON DELETE CASCADE.
- 계정에 대응하는 해시 로그인 횟수 제한 키를 별도 service_role RPC로 삭제. 그 외 만료된 해시 예산은 30일 이전 기록을 삭제하는 별도 정리 RPC를 준비했으나 **주기적 실행 일정은 아직 설치하지 않음**.
- public.survey_submissions의 사용자 연결은 FK 정책에 따라 NULL 처리되어 조사 데이터가 남음. 사용자의 개인 설문 답변 관련 열람/삭제/비식별화 정책은 별도 마련해야 함. 단지 Auth 사용자 삭제만으로 '모든 개인정보가 삭제된다'고 표현하지 말 것.
- 보존대상 분석: 개인 추천 이벤트, 설문 응답, 이메일 발송 로그, 백업, 외부 서비스의 데이터에 대한 데이터 보존 정책과 탈퇴 UI/재인증 경로 완성 필요.
- 삭제 정책 플래그 account_deletion_enabled=false. 운영 활성화/실사용 삭제는 하지 않음.

## 3. 이메일 발송 설정

**실제 대시보드 설정·발송 성공 여부 미확인**.

- Supabase 공식 자료에 따르면 기본 SMTP 서비스는 통상 **프로젝트 팀에 사전 승인된 주소로만 발송**되며 운영용이 아님. 일반 교사를 대상으로 가입메일·복구메일을 보내려면 커스텀 SMTP 구성이 필수.
- Dashboard:
  - https://supabase.com/dashboard/project/snvzwrexuqavnfvzgxqj/auth/smtp
  - https://supabase.com/dashboard/project/snvzwrexuqavnfvzgxqj/auth/providers : Email provider 및 Confirm Email 강제
  - https://supabase.com/dashboard/project/snvzwrexuqavnfvzgxqj/auth/templates : Confirm signup / Reset Password 템플릿
  - https://supabase.com/dashboard/project/snvzwrexuqavnfvzgxqj/auth/url-configuration : 사이트 URL 및 Redirect URL
- SMTP 발신 주소/도메인, SPF/DKIM/DMARC, 비밀키 저장, 전송 건수 제한, 요청 반복 방어 확인.
- 실제 외부 테스트 주소로 가입 메일과 복구 메일이 도착하는지 및 인증 결과를 검사해야 함. **테스트 이메일은 이 단계에서 발송하지 않음**.
- 메일 공급자 비밀번호·API 키는 GitHub/프론트/문서/채팅에 기록하지 않음.

## 4. 봇·계정 공격 방어

**기본 레이트 리밋 + Supabase Auth CAPTCHA 전달 코드 추가. 실제 CAPTCHA 활성 설정 미확인**.

- Edge signup/sign-in/bootstrap/recovery 요청에 CAPTCHA token 입력을 요구하고 Supabase Auth 메서드의 captchaToken 옵션으로 전달하도록 수정함.
- Supabase 인증 제공자 자체 CAPTCHA 보호를 켜지 않으면 전달한 토큰은 서버에서 검증되지 않을 수 있음. **외부에서 Supabase Auth API를 직접 호출하는 공격도 차단하려면** 프로젝트 Auth Bot and Abuse Protection에서 CAPTCHA 보호를 반드시 활성화해야 함.
- Supabase Dashboard Bot Protection: https://supabase.com/dashboard/project/snvzwrexuqavnfvzgxqj/auth/protection
- 추천: Cloudflare Turnstile 또는 hCaptcha 사이트 키/비밀키 구성, 발급 토큰 만료·재사용 테스트. 현재 화면에 보안 위젯과 가입 UI는 아직 추가하지 않음(기존 사용자 요구 유지).
- 서버 가입·로그인·재설정별 15분 시도 예산(HMAC 해시), 글로벌 요청 예산을 유지. **공유 글로벌 예산이 대규모 공격에서 정상 사용자를 차단할 수 있는 위험**은 남아 있음.
- 안전하다고 검증되지 않은 X-Forwarded-For 헤더를 IP 제한용 신뢰 자료로 사용하지 않음. IP 출처 보장 검증 후 추가 제한 또는 게이트웨이/Cloudflare WAF 권장.
- 가입·로그인과 같은 계정 API가 실제 운영에 노출된 후 DDoS/credential stuffing/봇가입/이메일 폭탄 테스트 수행 필요.

## 자동 검사

- GitHub Actions: account-auth-private-v1.yml에서 Node 정적/동작 모의 검사 및 Deno 타입 검사 실행.
- 통과는 **개발 코드의 정적 검증**만 뜻함. 실제 SMTP, Auth 설정, CAPTCHA 보호, DB 계정 삭제의 End-to-End 통과를 뜻하지 않음.

## 출시 승인 조건

1. 별도 스테이징 환경에서 새 SQL과 Edge를 설치하고 Auth/TOTP/복구/삭제/동시가입·중복인증/권한변경 테스트를 수행.
2. 이메일 확인 필수 및 custom SMTP 실제 발송 확인, 복구 이메일 템플릿과 인증 링크 확인.
3. Supabase Auth CAPTCHA 활성 + 본인 로그인 상태 검사, 비정상 자동 호출 실험.
4. 계정/설문/이벤트/백업 데이터 보존 및 탈퇴 정책 정리.
5. 개발 PR을 Draft로 보존하고 **명시적 출시 승인 전 main/운영 서비스에 반영하지 않기**.

### 근거 문서
- https://supabase.com/docs/guides/auth/auth-smtp
- https://supabase.com/docs/guides/auth/auth-captcha
- https://supabase.com/docs/guides/auth/passwords
- https://supabase.com/docs/reference/javascript/auth-verifyotp
- https://supabase.com/docs/guides/auth/managing-user-data
