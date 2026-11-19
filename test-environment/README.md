# 배구인덱스 독립 스테이징 환경 — 인수 및 실행 기록
2026-11-20 · Draft PR #56 · **실제 운영 배포 금지**

## 현재까지 확인된 상태
- GitHub 저장소: noam0127/beagu-index
- 안전 브랜치: feature/test-web-lv0-lv2-20261120
- 이 PR의 base: feature/lv2-referral-phase1-20261119 (운영 main이 아님)
- 계정 구현 선행: Draft PR #49 코드와 문서 확인
- Supabase 연결 목록에는 운영 프로젝트 snvzwrexuqavnfvzgxqj 1개만 존재함
- 조직: noam0127's Org, free. **테스트 프로젝트 미생성**
- DNS·Cloudflare Pages 제어 연결이 없어서 실제 테스트 배포 주소 **없음**
- 운영 DB, Edge Functions, 기존 Form/Apps Script, main **쓰기 작업 없음**
- 테스트 웹의 기본 config.js는 enabled:false. 운영 API 요청이 코드에서 차단됨

## 파일 구조
- test-web/index.html, app.js, config.js, recover.html, recover.js, robots.txt, _headers
- test-environment/supabase/20261120_stage_v1.sql
- test-environment/supabase/functions/beagu-test-v1/index.ts
- tests/test-web-stage-contract.mjs
- .github/workflows/test-web-stage.yml

## 서버 동작 계약
1. Supabase Auth 이메일 확인 후 verified JWT로 아이디 등록. 다른 계정과 이름 중복 불가.
2. 익명 Lv0 공통번호 -> 서버에서 발급하는 256비트 증명(30분 TTL); 가입 후 인증된 계정이 1회 소비. 인증되지 않은 브라우저 레벨 주장 불허.
3. 로그인 Lv0 공통번호 -> 서버에서 해당 Auth 사용자 ID의 Lv1 영구 저장.
4. Lv1 계정 -> HMAC 기반 256비트 난수형 추천 토큰을 반환(동일 계정에서는 같은 토큰), DB에는 SHA256만 보관.
5. 테스트 설문은 **별도의 이메일 인증된 계정**이 전용 링크로 제출하는 서버 관리 모의 응답. DB 단일 트랜잭션에서 자기 추천·동일 기기·동일 응답자 중복 제출 거부.
6. 정상 모의 제출 시 추천인 access level=2와 unread notice를 서버에 기록. 재로그인 시 알림 표시.
7. Lv2 자료 조회는 서버에서 live JWT 및 저장된 level>=2 확인 후 **가상 학교 3개만** 반환.
8. 탈퇴는 비밀번호 재인증, CAPTCHA 및 전역 refresh 세션 철회 후 auth.users 삭제와 FK cascade.
9. 비밀번호 복구는 test-only Auth 메일의 일회용 token_hash를 verifyOtp(type=recovery)로 확인한 뒤 updateUser. 통상 JWT의 잔여 유효기간은 짧게 관리해야 함.
10. 챌린지 고유번호는 이 계정·설문·레벨 경로 어느 곳에서도 사용하지 않음. 기존 challenge.html 파일에는 손대지 않음.

## 테스트 Supabase 생성 전 필수 승인/비용 확인
Supabase 조직은 Free로 조회되며 프로젝트 1개만 확인되었다. 공식 가격표는 Free 조직에 최대 2개 활성 프로젝트를 설명하지만, **이 조직에 새 프로젝트를 만들 때의 정확한 견적·승인 상태는 아직 확인하지 못했다.**
조직/요금 확인 후 별도 프로젝트를 만들고 완료 상태가 ACTIVE_HEALTHY인지 검증해야 한다.
운영 프로젝트 **snvzwrexuqavnfvzgxqj에는 새 SQL을 절대로 실행하지 않는다**.
본 SQL은 운영 beagu_private 스키마가 보이면 PRODUCTION_FORBIDDEN 오류를 발생시킨다.

## 별도 테스트 프로젝트 연결 방법 (미실행)
1. 오직 새 프로젝트에서 SQL 파일을 검토 후 실행. public.beagu_stage_* 함수를 service_role 전용으로 유지하고 RLS를 실 DB에서 확인.
2. Edge Function 이름 beagu-test-v1로 test-environment/supabase/functions/beagu-test-v1/index.ts 배포 (테스트 프로젝트에만).
3. Edge Function의 서버 환경값 설정:
   - BEAGU_TEST_PROJECT_REF = 신규 테스트 project ref (운영 ref 사용 불가)
   - BEAGU_TEST_SITE_ORIGIN = 테스트 전용 배포 Origin
   - BEAGU_TEST_RATE_SECRET = 충분히 긴 별도 임의값 (32+자)
   - BEAGU_TEST_REFERRAL_SECRET = 별도 임의값 (32+자)
   - BEAGU_TEST_LEVEL1_CODE = 운영과 다른 시험용 공통번호 (8+자)
   - BEAGU_TEST_ENABLED = true (모든 점검 후)
   - BEAGU_TEST_CAPTCHA_CONFIRMED = true (Auth에서 CAPTCHA 직접 검증 확인 후)
   - SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY = **테스트 프로젝트 소속 값만**
   비밀값은 GitHub에 커밋하거나 브라우저에 노출하지 않는다.
4. Auth 이메일 인증 필수, 테스트용 SMTP/Redirect Allow List 설정. 복구 메일 템플릿에서
   `https://<test-host>/recover.html#token_hash={{ .TokenHash }}` 를 사용해야 한다.
5. Supabase Auth > Protection에서 Turnstile CAPTCHA를 실제로 활성화하고 직접 Auth API 우회 차단을 검사한다.
6. 새 Cloudflare Pages **별도 프로젝트**의 build output root를 `test-web/` 로 지정. 기존 운영 프로젝트나 main/배포 설정을 수정하지 않는다.
7. 테스트 전용 호스트가 정해지면 `test-web/config.js`의 5개 **공개** 변수만 수정하고, `_headers` CSP connect-src를 정확한 테스트 Supabase hostname으로 좁힌다. 기존 운영 Supabase hostname 사용 금지.
8. noindex + X-Robots-Tag 헤더, 200 응답, TLS, 모바일 뷰, 다른 기기에서의 CORS를 실측 확인.

## 최소 실제 인수 시나리오 — 아직 미수행
- 테스트 계정 A: 임시 이메일로 가입, 메일 확인, 아이디 확정, 초기 Lv0 확인
- A: 전용 Lv1 코드 확인, 서버 Lv1 영구 기록, 추천 URL 발급
- 다른 브라우저/기기에서 계정 B: 별도 이메일 인증 및 Lv0 계정 생성
- B: A URL 접속 후 가상 설문 1회 제출. 서버 credited=true 확인
- B: 같은 URL 재제출은 duplicate, A가 본인 링크 제출하면 self_referral 거부
- 같은 브라우저/기기에서 생성된 B 계정의 제출은 same_device 거부(단, 스토리지 초기화·기기 위장은 차단할 수 없음)
- A: 로그아웃→다른 기기 재로그인→Lv2 유지, 알림 1회, 3개 가상 학교 서버 조회
- 계정별 직접 SQL 조회·변경 차단(RLS), 탈퇴, 이메일 복구 링크 1회성, CAPTCHA 실패, 브루트포스, 서버 URL 보호 확인

## 미완성·위험
- **실제 가입 2계정, 이메일 인증, SQL 실행, CAPTCHA, E2E 테스트를 실시하지 않았다.** 작성된 코드는 검증 완료가 아니다.
- 모의 설문은 test Supabase 서버의 로그인된 별도 계정 제출로만 처리된다. **실제 테스트용 Google Form/Apps Script 연결과 위변조 방어는 아직 구현·검증 전**. 운영 설문은 절대 수정하지 말 것.
- 브라우저별 임의 deviceProof는 편의상 동일 브라우저를 거를 뿐 실제 교사를 증명하지 못하며, 저장 공간 삭제로 우회 가능. 개인정보 보존기간·허용범위 및 계정 남용 정책 추가 필요.
- Auth Access JWT는 전역 로그아웃 뒤에도 만료 시각까지 남을 수 있다. 민감 엔드포인트에서 live auth.users/session_id 검사 추가 검토.
- HMAC 추천 키 회전 및 기존 링크 폐기/관리자 정정 절차는 미구현.
- 스테이징 SQL에 대한 실제 PostgreSQL 적용·RLS 검증 및 Edge Deno 타입 검사는 별도 프로젝트/CI 실행 결과 확인이 필요.
- 기존 챌린지 고유번호 IDOR는 선행 브랜치에 패치 후보가 있으나 운영에 반영하지 않았고 실제 재현·재검증은 미실시.
- 현재 TEST 사이트는 공개 접속 주소가 없고, 오프라인 모의 화면은 실제 E2E의 대체가 아니다.

## 운영 공개 금지 기준
실제 2계정 E2E, SMTP/CAPTCHA 직접 검증, 독립 DB·호스트, RLS/IDOR, 데이터 삭제·민감 로그 및 보안 점검 모두 확인될 때까지 이 PR은 Draft 상태 유지. 운영 main, Cloudflare 운영 프로젝트, 운영 Google Form을 변경하지 않는다.
