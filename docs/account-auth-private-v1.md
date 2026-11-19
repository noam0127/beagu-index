# 배구지수 비공개 계정·로그인 v1 — 개발·개인정보 보호 인계

> **2026-11-19 후속 개발 반영:** 이 문서의 초기 TODO 중 비밀번호 재설정 화면, 자체 탈퇴 API, 이메일 템플릿, CAPTCHA 전달/보존기간 정리 코드는 개발 브랜치에 추가되었습니다. **운영 이메일 SMTP와 CAPTCHA 공급자 설정·실제 이메일 발송은 여전히 미설정/미검증이며 기능 플래그는 모두 OFF입니다.** 정확한 구현 상태와 네 가지 출시 조건은 [계정 보안 4개 항목 개발·검증 문서](account-security-lifecycle-v1.md)를 우선 확인하세요.

작성: 2026-11-19 / 대상: Draft PR #49  
**상태: 개발 브랜치 구현, 운영 미배포. 기존 사이트 화면에 가입·로그인 버튼/메뉴를 추가하지 않았다.**

## 개발된 파일

- supabase/migrations/20261119_account_auth_private_v1.sql — 새 계정용 비공개 테이블, RLS, 서비스 역할 전용 RPC. 모든 기능 플래그 OFF. **운영 DB 미설치**
- supabase/functions/beagu-account-v1/index.ts — 회원가입, 이메일확인 후 아이디 등록, 아이디/비밀번호 로그인, 이메일 최초 로그인, 현재 상태 조회, 토큰 갱신, 로그아웃, 비밀번호 복구 요청 API. **운영 Edge 미배포**
- js/beagu-account-client-v1.js — 화면 없는 순수 JS 인증 모듈. 기존 HTML에서 불러오지 않는다. 인증 토큰은 메모리에만 유지하므로 새로고침 시 다시 로그인해야 한다.
- account-email-confirmed.html — 이메일 확인 후의 텍스트 전용 안내. 가입·로그인 버튼 없음. 보안 전용 JS가 URL의 임시 인증 파라미터를 제거.
- tests/account-auth-private-v1.mjs / .github/workflows/account-auth-private-v1.yml — 정적 보안·기능 계약과 GitHub CI 검사.

## 가입·로그인 과정

1. Lv0 신규 이용자: signUp({ username, email, password })로 Supabase Auth 이메일 인증 요청. 가입 직후 레벨은 오르지 않는다.
2. 인증 메일 확인 후: beginConfirmedRegistration({ email,password })로 인증 사용자임을 확인.
3. finishRegistration(username)으로 **확인된 JWT의 실제 auth.users.id**에만 아이디를 1:1 연결. username은 소문자 ASCII 문자·숫자·밑줄 4~20자이며, 중복 이름은 데이터베이스 고유 제약으로 거부.
4. 이후 login({ username,password }) — 서버 내부에서만 username→Auth 사용자 확인, Supabase Auth가 비밀번호 검증. 아이디 없음과 비밀번호 오류는 같은 응답으로 처리. 계정의 초기 레벨은 0.
5. 로그아웃: Auth 현재 세션을 철회하고 메모리 토큰 삭제.

**주의:** 처음 입력한 아이디는 이메일 인증 전에는 예약되지 않는다. 가입 신청 시 아이디는 선택 의사만 받으며, 인증 완료 후 가장 먼저 등록된 계정이 아이디를 가진다.

## 최소 수집 및 정보 흐름

| 자료 | 저장 위치 |
| --- | --- |
| 이메일 | Supabase Auth에만 |
| 비밀번호 및 검증용 해시 | Supabase Auth 내부에서만 처리 |
| 아이디, Auth 사용자 UUID, 레벨(초기 0), 정지 여부 | 비공개 account_profiles_v1 |
| 로그인 시도 기록 | HMAC 처리한 해시 키와 횟수만, 비공개 account_login_budgets_v1 |

학교, 이름, 휴대전화, 주민번호, 주소, 학생정보, 설문 답변, 개인 고유번호, 방문자 UUID를 계정 생성 기능에서 받지 않는다. 앱의 새 테이블은 RLS 활성화, 일반 익명/로그인 사용자 직접 접근 금지, 서비스 역할 전용 접근. 비밀번호·토큰은 GitHub·서버 로그·브라우저 저장소에 쓰지 않는다.

## 운영 전 반드시 확인할 사항

- 현재 운영 Supabase에는 **새 계정 테이블/Edge가 설치·배포되지 않음**. 가입·로그인·아이디 등록·복구 4개 기능 플래그는 모두 OFF를 기본값으로 둔다.
- Supabase Auth의 **이메일 확인 필수 설정**과 실제 SMTP 발송, 확인 링크의 Redirect URL 허용 목록 검증. 확인을 강제하지 않는 프로젝트라면 운영 공개 금지.
- 이메일 확인 리디렉트: https://baeguindex.com/account-email-confirmed.html (운영에 미배포, 메인 병합 이후 별도 검증 필요).
- 32자 이상 별도 보안 난수 BEAGU_ACCOUNT_RATE_PEPPER를 Supabase 비밀 설정에 등록. 절대로 GitHub·웹·Apps Script에 기록하지 않음.
- 비밀번호 복구 요청 코드가 있지만 안전한 재설정 페이지와 세션 검증은 아직 미완성. 복구 플래그는 계속 OFF.
- 회원 탈퇴·계정 정보 삭제와 보유 기간, 로그인 시도 예산 해시의 정기 삭제(예: 30일), 개인정보 처리 고지를 운영 전 구현.
- CAPTCHA/봇 방지와 아이디·IP별 추가 제한, 이메일 발송량 제한을 운영 전에 강화. 현재 서버측 HMAC 기반 아이디/이메일 및 전체 요청 예산은 기본 방어에 불과.
- 기존 RLS/인증 사용자 권한 및 Supabase Security Advisor 검토, 개발용 DB에 실제 SQL을 적용한 DDL/보안 테스트, 가입→메일→확인→로그인→로그아웃까지 통합 시험 필요.
- 새 계정과 Lv1 공통번호, Lv2 추천 링크는 **아직 연결되지 않음**. 자동 승급·계정별 추천 기능은 2차 개발.
- 기존 챌린지 API UUID IDOR 보안 문제는 신규 계정과 별개로 수정 필요.
- 사용자가 UI 출시를 승인하기 전에는 **어떤 기존 화면에도 가입/로그인 버튼을 추가하지 않음**.
- 운영 Edge 배포, GitHub main 병합, 기능 활성화, 운영 DB 마이그레이션은 별도의 보안 검증과 사용자 승인 후 수행.

## Supabase 공식 자료

- https://supabase.com/docs/guides/auth/passwords
- https://supabase.com/docs/guides/auth/redirect-urls
- https://supabase.com/docs/guides/auth/general-configuration
