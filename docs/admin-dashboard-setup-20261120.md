# 관리자 전용 통계 페이지 · 적용 및 초기 설정

관리자 URL: https://baeguindex.com/admin.html

관리자 링크는 공개 메뉴에 넣지 않았고 검색엔진 비색인 메타를 적용했다. 단, 이 주소의 HTML은 공개 저장소에 배포된 정적 페이지이므로 **로그인 화면 자체는 URL을 아는 사람에게 보일 수 있다**. 인증 없이 통계 데이터에 접근하는 것은 서버 API에서 차단된다. 로그인 화면 HTML 자체까지 비공개로 만들려면 Cloudflare Zero Trust Access 같은 추가 네트워크 접근제어가 필요하며 현재 미적용이다.

## 보안 및 데이터 처리

1. Auth 이메일·비밀번호 로그인 → TOTP 6자리 코드 → 서버 AAL2·현재 활성 세션·관리자 명단 검증을 거쳐 조회
2. 기존 레벨0·1·2는 별도 유지. 관리자 권한을 사용자가 스스로 등록할 수 없으며 공개 저장소에는 인증 비밀정보를 저장하지 않음
3. 실제 DB 집계: 방문, 익명 방문자, 학교 검색·선택·상세 이벤트, 학교별 일별 중복제거 조회수, 게임 세션·완료율·최고점 일부, 챌린지·레벨, 관리자 감사
4. 실측되지 않는 Lv.0 회원 수, 활성 회원 수, 비주얼 노벨 장기 플레이, 전체 로그인 실패·수집 장애는 미수집으로 명시
5. 별도 일간 학교조회 테이블은 한국 날짜 × 방문자 해시 × 학교 기준 중복 제거이며 엄밀한 연속 24시간 중복제거와 다름
6. 방문/학교검색/아케이드 게임 관리자 JWT는 기록 전 차단. 학교 조회·관심 수집 테이블에도 선제 필터 적용. 익명으로 보낸 트래픽, 일부 챌린지·노벨 활동까지 관리자 동일성을 완전 식별할 수 있다는 뜻은 아님

## 계정 및 비밀번호 초기 설정 (본인이 직접)

**조사 당시 Supabase auth.users는 0명, 관리자 목록도 0명. 어떤 비밀번호도 ChatGPT가 생성하거나 저장하지 않았다.** 본인 계정을 아래와 같이 생성해야 로그인할 수 있다.

1. Supabase Authentication → Users: https://supabase.com/dashboard/project/snvzwrexuqavnfvzgxqj/auth/users
2. Add user 메뉴에서 본인 이메일로 신규 Auth 계정을 생성하고, 비밀번호 관리자에서 **20자 이상의 무작위 비밀번호**를 생성하여 설정한다. 비밀번호를 채팅이나 공개 소스에 복사하지 않는다.
3. 해당 Auth 사용자의 UUID를 복사하여 Supabase SQL Editor: https://supabase.com/dashboard/project/snvzwrexuqavnfvzgxqj/sql/new 에서 다음을 실행한다(실제 UUID로 치환).

   INSERT INTO public.beagu_admin_accounts (user_id,role,enabled)
   VALUES ('실제-Auth-사용자-UUID'::uuid,'owner',true)
   ON CONFLICT (user_id) DO UPDATE SET role='owner', enabled=true, updated_at=now();

4. Supabase Authentication → MFA에서 Authenticator App(TOTP)가 활성화되었는지 확인한다.
5. admin.html에서 이메일·비밀번호 로그인 → 인증 앱 등록 및 OTP 6자리 인증 → 대시보드 이용.
6. 로그인 후 대시보드 맨 아래에서 비밀번호 변경 가능(16자 이상, Supabase Auth.updateUser 사용). 비밀번호는 대시보드 데이터베이스나 감사 로그에 저장되지 않는다.

## 계정 생성 전까지

- 인증되지 않은 누구도 보호된 통계 API를 조회할 수 없도록 HTTP 401/403 적용
- 계정 생성/권한 등록/실제 TOTP E2E는 미완료로 보고
- 로그인 화면 공개와 실제 통계 공개는 다르다
- Cloudflare Access를 설정하지 않았으므로 네트워크 수준으로 관리자 URL 자체가 비공개인 것은 아니다

## 집계 관련 참고

- 관리자 화면의 **학교 선택 이벤트**는 `public.school_search_events`의 `school_selected` 저장 행 수다. 중복 제거되지 않은 과거 이력도 포함한다. 학교별 이벤트 횟수 순위 역시 이 원본 이벤트를 집계한다.
- 별도의 **중복 제거 학교 조회수**는 `beagu_private.school_view_daily`의 실제 유효 선택 1건/방문자/학교/한국 날짜 기록이다. 공개 페이지에서 사용하는 `beagu_school_view_totals`와 같은 유효 선택 경로이며, 과거 `school_selected` 이벤트는 방문자 중복 판단이 불가능하여 소급 반영하지 않는다. 따라서 기록이 처음부터 0건일 수 있으며, 원본 학교 선택 횟수와 다르더라도 오류로 단정하지 않는다.
- 관리자 학교별 순위에서 두 집계 방식을 별도 선택할 수 있다. 관리자 본인의 익명 활동은 아직 완전 제외를 입증하지 못했다.

방문 이벤트는 사용자 수와 다르다. 게임 시작 세션·완료된 게임 수는 다르며 게임 점수는 현재 보관중인 상위 기록에 한정된다. 원본 설문 응답과 개인정보를 대시보드에 제공하지 않는다. 일·주·월 차트와 오늘/7일/30일/전체 필터는 DB에 존재하는 시점만을 사용한다.