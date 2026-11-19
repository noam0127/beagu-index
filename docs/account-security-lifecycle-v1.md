# 배구지수 계정 보안 후속 개발 — 4개 항목 구현 및 출시 전 인계

기준일: 2026-11-19  
대상: Draft PR #49 / GitHub 개발 브랜치에만 반영  
**운영 서비스·Supabase DB·Auth 설정·Google Forms·Apps Script는 이 작업으로 변경하지 않았다.**

## 0. 상태 구분

| 항목 | 소스 구현 | 운영 설정 | 실제 사용자 시험 |
| --- | --- | --- | --- |
| 비밀번호 재설정 화면 | 구현 | 미연결·복구 플래그 OFF | 미수행 |
| 탈퇴와 앱 계정 정보 삭제 | 구현 | 탈퇴 플래그 OFF | 미수행 |
| 인증/복구 이메일 발송 | 한국어 복구 이메일 템플릿 제공 | SMTP·도메인·템플릿·Redirect 미설정/미검증 | 미수행 |
| 봇 방어 | Supabase Auth CAPTCHA 토큰 전달 + 서버 HMAC 제한 + 보수적 활성화 가드 | Auth CAPTCHA·Turnstile/ hCaptcha 미확인·비활성 | 미수행 |

이번 개발은 **비활성화된 안전한 소스 준비** 단계다. 설정 미확인 상태에서 배포·활성화하면 안 된다.

## 1. 비밀번호 재설정

파일:
- `account-password-reset.html` — 독립적인 비밀번호 변경 화면. 기존 홈·검색·챌린지 화면의 버튼/메뉴를 변경하지 않는다. 기존 제품 요청대로 새 화면에도 별도 버튼을 두지 않고 마지막 입력창에서 Enter/완료로 제출.
- `js/beagu-account-password-reset-v1.js` — URL의 `token_hash`를 읽고 즉시 주소창에서 제거. 복구 전용 `type=recovery`를 요구한다. 12~128자 및 일치 여부 확인, 일회성 복구 API 요청, 성공 후 로그인 안내.
- `supabase/functions/beagu-account-v1/index.ts` — `request-recovery`는 CAPTCHA·이메일별 요청 횟수 확인 후 Auth 발송 API 호출; `complete-recovery`는 `verifyOtp({token_hash,type:'recovery'})` 성공 때만 `updateUser({password})` 수행, 세션 전체 만료 요청.
- `supabase/email-templates/account-recovery.html` — 자체 SMTP 템플릿에 복사해 설정할 `{{ .TokenHash }}` 기반 복구 이메일. **현재 Supabase에서 이 템플릿을 사용 중이라는 뜻이 아님**.

보안 규칙: URL 비밀 토큰은 localStorage·sessionStorage·서버 로그에 저장하지 않으며 일반 로그인 JWT만으로 새 비밀번호를 설정할 수 없다. 입력창의 비밀번호는 처리 후 지운다. 메일 유출 가능성, 재사용, 유효기간, 리디렉트 경로를 실제 메일 테스트에서 검증해야 한다. Supabase Auth 발송 제한과 SMTP 설정은 사용자 인증 공급자에서 실행한다.

**운영 연결 전 중요한 확인:** Supabase Auth의 `Reset Password` 템플릿에 위 HTML을 반영해야 한다. 기본 `ConfirmationURL` 템플릿과 현재 서버의 `token_hash` 검증 경로를 혼용하면 비밀번호 복구가 동작하지 않을 수 있다.

## 2. 회원 탈퇴·개인정보 삭제

- `delete-account`은 서버에서 Auth JWT를 검증한 본인에 대해서만 요청할 수 있다.
- 요청자는 현재 비밀번호, 명시적 확인 문자열 `DELETE_MY_ACCOUNT`, CAPTCHA 증명을 다시 제공해야 한다.
- 서버가 Supabase Auth로 현재 비밀번호를 재검증하고 계정 ID 일치 여부 확인.
- Auth 로그인 세션 전체 철회 요청, `admin.auth.admin.deleteUser(user.id)` 실행. 앱 개인 계정 프로필은 `auth.users`에 대한 FK `ON DELETE CASCADE`로 지워진다.
- 사용자별 로그인 시도 예산의 HMAC 해시 기록은 `beagu_account_v1_purge_budgets`으로 정리; 글로벌 공유 예산은 개인 식별 정보가 없으며 30일 이내의 보존 정책에 따라 추후 만료 처리.
- 기존 `public.survey_submissions.user_id`는 FK `ON DELETE SET NULL`로, 회원 삭제 시 설문 원본 행은 삭제되지 않고 계정 연결만 제거된다. 익명·집계 데이터 보존과 이용자의 개별 계정정보 삭제 범위를 개인정보 처리방침에서 **분명히 구별**해야 한다.

**아직 미완:** 서버 로그·Supabase 인증 메일 전송 로그 등 다른 저장소의 보존기간 확인, 관리자용 재처리·데이터 삭제 확인, 추천 링크/레벨 원장의 계정 삭제 연동은 레벨업 기능 구현 때 동시 설계, 탈퇴 실사용 테스트. 보존 법령·운영 약관에 따른 삭제 예외는 별도 정책 수립.

## 3. 이메일 발송 설정 — 실제 운영자 작업 필수

필요한 설정:
1. 프로젝트 `snvzwrexuqavnfvzgxqj` → **Auth → Providers**에서 이메일 가입·확인 필수 점검.
2. **Auth → SMTP Settings**에서 별도 SMTP 공급자 설정. SUPABASE 기본 SMTP는 일반 가입자 대상 운영용이 아니다. SMTP 사용자 이름·비밀번호는 Supabase 비밀 설정에만 넣고 GitHub나 채팅에 기록하지 않는다.
3. 발신 도메인 DNS **SPF·DKIM·DMARC**를 발송 서비스 지침에 따라 설정·확인. 이름/표시 주소와 답장 받을 주소도 검토.
4. **Auth → URL Configuration**에 실제 `https://baeguindex.com` Site URL 및 `https://baeguindex.com/account-email-confirmed.html`, `https://baeguindex.com/account-password-reset.html` Redirect URLs 등록. 임의 redirect_url 허용 금지.
5. **Auth → Email Templates**의 가입 확인·비밀번호 재설정 템플릿 확인. 복구 템플릿은 해당 파일을 복사·설정. 비밀번호 변경 알림이 지원되는 경우 활성화 검토.
6. 샌드박스/테스트 이메일로 **가입 → 확인 → 아이디 확정 → 로그인 → 비밀번호 찾기 → 재설정 → 재로그인 → 탈퇴** 테스트. 스팸함·반송·발송 제한과 한글 제목/본문 확인.

공식 자료:
- https://supabase.com/docs/guides/auth/auth-smtp
- https://supabase.com/docs/guides/auth/auth-email-templates
- https://supabase.com/docs/guides/auth/redirect-urls
- https://supabase.com/docs/guides/auth/testing-auth-flows

**이 연결로 Auth SMTP/이메일 설정을 읽거나 쓰는 기능은 제공되지 않는다. 현재 설정이 완료되었다고 표시하지 않는다.** 공급자 자격증명이나 실제 테스트 이메일을 모르는 상태에서 임의 설정하지 않는다.

## 4. 봇 방어

- `beagu-account-v1`의 신규가입, 로그인, 이메일 최초확인 로그인, 복구 요청, 탈퇴 재인증은 `captchaToken` 필수. 토큰은 Supabase Auth의 `signUp`, `signInWithPassword`, `resetPasswordForEmail`에 전달하여 **Supabase 자체 검증**을 받는다.
- 서버 환경 설정 `BEAGU_AUTH_CAPTCHA_CONFIRMED=true`가 없으면 해당 작업들은 **fail closed**(HTTP 423). 이 설정은 Supabase Auth의 CAPTCHA 실제 활성화를 테스트한 뒤에만 적용한다.
- 로그인/회원가입/복구는 이메일·아이디·계정별 HMAC 처리 키의 요청 예산과 전체 서버 상한을 함께 사용한다. DB에 원본 이메일/IP를 저장하지 않는다. 보안 비밀값 `BEAGU_ACCOUNT_RATE_PEPPER`는 32자 이상 무작위 값을 사용한다.
- Supabase Dashboard **Authentication → Bot and Abuse Protection**에서 Cloudflare Turnstile(권장) 또는 hCaptcha 설정. 비밀키는 관리자 설정에만; 공개 sitekey는 후속 가입/로그인 UI에 필요하다.
- **중요:** Edge에서 문자열 형식만 확인하는 것과 Auth에서 CAPTCHA를 실제 검증하는 것은 다르다. Supabase의 원시 Auth API로 직접 접근하는 경로까지 테스트하여 CAPTCHA 없는 가입·로그인 요청이 차단되는지 검증해야 한다.
- 악의적 로그인 폭주, 이메일 도배, 계정 열거 및 같은 IP의 계정 분산 공격은 현재 HMAC 예산과 CAPTCHA만으로 완벽 차단되지 않는다. IP 단위 속도 제한은 신뢰된 CDN/프록시 뒤에서만 구현해야 하며, 요청자가 임의 설정 가능한 헤더를 신뢰해선 안 된다.
- 로그인 예산 해시 30일 이상분 정리 함수 `beagu_account_v1_expire_budgets`을 스테이징 SQL에 준비했다. **자동 스케줄은 미설치.**

공식 자료:
- https://supabase.com/docs/guides/auth/auth-captcha
- https://supabase.com/docs/guides/auth/auth-rate-limits

## 5. 운영 보호와 검증

- 개발: `feature/lv2-referral-phase1-20261119`, Draft PR #49.
- **아직** Supabase 운영 DB에 신규 account migration을 적용하지 않고, 운영 Edge를 배포하지 않음. 회원가입/로그인/재설정/탈퇴 기능 플래그 모두 OFF가 기본값.
- 기존 홈페이지에 회원가입/로그인 버튼·메뉴를 추가하지 않음. 비밀번호 재설정용 독립 페이지는 외부에 노출하지 않음.
- 기존 레벨1 공통번호 인증, Google Forms·Apps Script, 챌린지·설문 결과에는 영향 없음.
- 정적 GitHub Actions 테스트가 통과해도 **실제 이메일·CAPTCHA·Supabase Auth 계정 생성·삭제 통합 시험을 대체하지 못함**.
- 기존 챌린지 API UUID IDOR 문제는 별도 보안 패치 필요.
- 사용자별 Lv0→Lv1 귀속·계정별 추천으로 Lv2 자동 승급 역시 후속 작업.

### 출시 전 통과해야 할 검증
- [ ] Auth 이메일 가입·확인 의무 설정과 SMTP 실발송, 반송/발송 제한
- [ ] 정상/만료/가짜 복구 링크 구분, 재설정 링크 1회성, 다른 계정 비밀번호 변경 불가
- [ ] 탈퇴 시 비밀번호·CAPTCHA 재인증과 전 기기 접근 차단, 앱 개인 계정 삭제
- [ ] 익명 설문 원본 보존/비식별 정책과 사용자 데이터 삭제 범위 안내
- [ ] 실제 CAPTCHA 없는 직접 Auth 호출 거부, 동일 계정 재시도/봇 공격 방어
- [ ] 정상 로그인/레벨1 인증/학교 검색/기존 Forms 집계 회귀 테스트
- [ ] 계정 사용자가 0명인 개발 환경으로 테스트, 실제 서비스 데이터를 건드리지 않음
- [ ] 명시적 승인 전 main 병합·운영 배포·기능 플래그 변경 금지
