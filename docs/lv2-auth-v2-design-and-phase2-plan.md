# 배구지수 Lv.2 인증 정책 v2 — 역사적 초안 (폐기)

> **이 문서는 더 이상 현행 정책이 아닙니다.** 2026-11-19 최종 변경으로 레벨0부터 가입·로그인을 허용하고 레벨업하기에서 **공통번호로 Lv1 / 개인 전용 추천 링크로 Lv2**를 진행합니다. 고유번호와 챌린지는 전부 레벨업 동선에서 제외합니다. [최신 정책 v3](lv2-auth-v3-levelup.md)를 우선합니다.

수립일: 2026-11-19  
상태: **설계 확정 / 구현 전 / 배포 금지**  
대상: GitHub Draft PR #49 (feature/lv2-referral-phase1-20261119)  
우선순위: **기존 Google Forms·Apps Script 설치가 끝난 뒤 2차 개발**  
기본 원칙: 기존 운영 서비스, 원본 설문, 공통 Lv.1 코드, 기존 발급번호, 공개 데이터 보존. 새 인증 플래그는 모두 꺼둔다.

## 0. 기존 PR과 달라진 최종 정책

1. Lv.1: 기존 기기·공통 Lv.1 참여코드 간편 인증 유지.
2. 챌린지: 기존과 동일한 개인 고유번호(긴 BG26 번호, BG26 6+6 번호, 10자리 번호) 자동 발급·보관. 고유번호는 **로그인 비밀번호가 아니다**.
3. 개인 추천 링크 여러 명에게 공유. 구글폼의 유효 추천 제출 하나가 확인되면 DB의 access_level=2.
4. **승급과 가입은 서로 독립**: 이미 서버에서 소유권이 확인된 기기는 회원가입 없이 Lv.2 이용.
5. 다른 기기: **아이디+비밀번호**로만 Lv.2 접속. 가입하지 않았다면 기존 기기에서 가입하도록 안내.
6. 가입: Lv.2 이후에만 선택 가능. 고유번호 입력만으로 가입·소유권 회복 불가.
7. 비밀번호와 이메일 확인·복구: Supabase Auth 사용. 자체 비밀번호 저장·평문 로깅 금지.
8. 기존 Draft PR #49의 **고유번호 직접 로그인 코드는 폐기 대상**이며, 운영 배포/병합 금지.

## 1. 인증 경로

### A. 같은 기기(회원가입 없음)

- Lv.1을 정상 인증한 뒤 챌린지 화면에서 본인 고유번호와 초대 링크 확인.
- 신규 발급: UUID를 신뢰하지 않고, 기기 내 생성한 비추출형 WebCrypto 개인키의 공개키를 신규 신원에 원자적으로 결속. 서버는 서명한 난수 challenge를 검증한다. 기기 인증은 추가된 공개키와 실제 개인키 소유를 증명하는 것.
- 서버가 초대한 사용자의 추천 1건을 유효 처리하면 추천 프로필의 access_level을 2로 바꿈. 계정 연결 여부는 변하지 않는다.
- 같은 기기에서 서명 검증 후 단기 세션을 발급. 서버는 매번 프로필의 현재 레벨과 정지 여부를 재조회하고 Lv.2 사용 허용.
- 기존 Lv.1 공통 코드 세션이나 임의 방문자 UUID만으로는 개인 신원·Lv.2 권한을 얻지 못함.
- 브라우저 데이터/기기 키가 유실되면 **같은 기기라도** 자동 소유권 입증 불가능. 이미 가입한 계정으로 로그인하거나 별도 복구 심사를 거쳐야 함.
- 구현 선택: 별도 device-challenge/session 관리 또는 기존 level session 확장 중 하나로 일관화. 모든 Lv.2 민감 API에 서버 검증된 계정 JWT 또는 현재 기기 proof가 필요; 클라이언트의 level 변수는 인증 근거가 아니다.

### B. 다른 기기(회원가입 사용자)

- 아이디 → 서버의 비공개 username-to-email 매핑 → 서버측 Supabase Auth signInWithPassword(email,password), 이메일을 외부에 반환하지 않음.
- Auth가 반환한 사용자를 검증한 뒤 (auth.user.id ↔ 비공개 연결 테이블 ↔ challenge_referral_profiles)에서 access_level=2, disabled=false 확인.
- 비밀번호 일치만으로 Lv.2를 주지 않음. 미연결 또는 Lv.1 사용자는 거부.
- 인증 성공하면 서버 검증된 Lv.2 세션으로 이용. 이메일 변경/비밀번호 초기화가 Lv.2 권한을 자동 생성하지 않음.
- 사용자 이름 미등록/오입력/비밀번호 오류는 일반화된 오류를 반환하여 아이디 열거 공격을 줄임. 사용자명 정규화, 서버 레이트리밋, 서비스 측 보호와 감사.

### C. 정식 계정 생성 (Lv.2가 된 기존 기기에서만)

1. 서버가 현재 요청 기기 nonce 서명, 기존 소유자 결속, 현재 Lv.2 상태 및 신선한 재인증(예: 5~10분 이내)을 확인.
2. **고유번호는 안내·참조용**으로만 확인; 고유번호 단독 입력은 소유권 증거가 아님.
3. 아이디 유효성 검사 및 정규화. 비공개 고유 인덱스와 원자적 예약/확정으로 중복 방지. 예약에 짧은 만료 기간 부여.
4. 이메일·비밀번호 입력. Supabase Auth 이메일 확인을 필수로 하고 이메일 인증 링크 발송. 자체 DB에 비밀번호나 파생 해시를 보관하지 않음.
5. 이메일 확인 후 동일 인증 기기에서 완료 요청. 서버가 Auth JWT를 Auth 서버로 재검증하고 확정된 email_verified 상태와 일회성 등록 티켓을 확인.
6. 트랜잭션에서 **한 visitor에 한 auth_user_id**, **한 auth_user_id에 한 visitor**, **한 username에 한 계정**을 UNIQUE 제약으로 보장. 사용자 조작 가능한 user_metadata는 권한에 사용하지 않음.
7. 중간 단계 실패/이메일 미확인/중복 경쟁은 연결을 취소·만료 처리; 승급 이력은 그대로.
8. Auth 회원가입/확정의 2단계 특성을 고려해 pending 상태 및 복구 작업을 구현하고, 이메일 확인이 끝나지 않은 Auth 사용자가 Lv.2를 얻지 못하게 막는다.

### D. 비밀번호 찾기

- 비밀번호 찾기 화면에서는 **등록한 이메일 주소**를 받는다(아이디 입력 로그인과 구별).
- Supabase Auth resetPasswordForEmail + 승인된 redirect URL + 복구 세션 검증 후 updateUser.
- 화면에는 가입 여부를 노출하지 않는 동일한 안내. 비밀번호 변경 후 정책에 따라 기존 세션 철회/만료 및 재로그인.
- 인증 이메일/재설정 토큰/비밀번호는 API URL, 로그, 추천 실적, 개인 고유번호와 연결해 기록하지 않는다.

## 2. 승급 UX 확정 문구

Lv.2 승급이 서버에서 확인되고, 해당 기기에 본인 proof가 있으면 모달/별도 패널 표시:

- 제목: **레벨2가 열렸습니다!**
- 본문: **이 기기에서는 바로 이용할 수 있습니다.**
- 추가: **다른 기기에서도 이용하고 싶으신가요?**
- 설명: **아이디와 비밀번호를 만들면 다른 휴대전화나 컴퓨터에서도 레벨2를 이용할 수 있습니다.**
- 버튼: **계정 만들기 / 나중에 하기**
- 계정 만들기 → 가입 화면, 나중에 하기 → 바로 Lv.2 검색.
- 기존 기기에서는 가입 배너를 반복 강제하지 않음. 이후 Lv.2 인증 화면에서도 계정 만들기를 선택 가능.
- 다른 기기 Lv.2 화면: **아이디 / 비밀번호 / 로그인 / 비밀번호 찾기**, 미가입 안내: **아직 계정이 없다면 기존 인증 기기에서 먼저 계정을 만들어 주세요.**
- 승급 UI 노출은 프로필의 access_level=2와 기기 검증 양쪽을 확인한 후에만 허용.

## 3. 1차 구현 유지·수정·폐기

| 구분 | 대상 | 결정 |
| --- | --- | --- |
| 유지 | beagu_private.challenge_identity_codes | 원장과 3종 코드 포맷 유지, 식별값으로만 활용 |
| 유지 | challenge_referral_profiles/events, referral credit | 서버 추천 실적·승급/중복 이벤트 방어 유지 |
| 유지 | survey.html, 사전입력 form entry IDs, Referral.gs 및 기존 submit trigger | 기존 별도 Google Forms 설치 작업은 변경 없음 |
| 유지 | 공통 Lv.1 코드, Lv.1 세션 및 검색/공개 데이터 | 무중단·무삭제 |
| 수정 | challenge_device_claims + staged bound identity issuer | 기존 단순 device secret hash에서 원자적 발급·WebCrypto nonce 서명/공개키 결속 방식으로 보강 |
| 수정 | beagu-level-api, level-search.js, beagu-level-state-v1.js | 기기 세션+Supabase Auth JWT의 서버별 권한 재확인 |
| 수정 | challenge.html, js/challenge.js, search-lv2.html | 승급 모달, 선택적 가입, 다른 기기 로그인 |
| 수정 | beagu-referral-v1 enroll/credit | 발급 소유자 검증·추천 승급만 처리; 코드 인증 관련 기능 제거 |
| **폐기** | beagu-referral-v1의 action=login(identityCode) | 고유번호 직접 로그인 API 삭제 |
| **폐기** | beagu_referral_auth(p_identity_hash) | 고유번호 해시 → 로그인 권한 RPC 호출 제거, 권한 취소 후 제거 가능 |
| **항상 OFF** | 기존 login_enabled | 기존 고유번호 직접 로그인을 다시 켜지 않음 |
| 신규 | beagu-account-v2 Edge + 계정/기기/가입 UI/세션 관리 | 선택적 Supabase Auth 계정 등록·로그인·복구 |

## 4. Supabase DB 설계 (제안, 지금은 미적용)

### 재사용

- beagu_private.challenge_referral_profiles: campaign, visitor_id, access_level, upgraded_at, disabled 및 추천 실적. **권한의 단일 원본**.
- beagu_private.challenge_identity_codes: 3종 포맷 및 기존 순번. 기존 원문을 임의 삭제/수정하지 않음.
- beagu_private.challenge_referral_events: 중복 이벤트와 동일 UUID 거부. 익명 폼 입력 UUID는 조작할 수 있으므로 실제 교사 식별로 해석하지 않음.
- public.beagu_level_sessions: Lv.1 기존 세션 유지. 고유번호 직접 로그인을 위해 추가한 nullable identity 컬럼은 계정/기기 검증 없는 권한 발급의 증거로 쓰지 않음.

### 신규/확장 예정

1. beagu_private.challenge_device_keys
   - device_id UUID PK, campaign+visitor_id FK, public_key JWK/검증용 형식, status(active/revoked), issued_at, rotated_at, last_used_at.
   - 클라이언트 비추출형 개인키는 서버에 저장하지 않음. **암호학적 서명 검증**이 공개키와 연동.
2. beagu_private.challenge_device_challenges
   - 랜덤 nonce 해시, device_id, created_at, expires_at, consumed_at. 1회 사용/단기 만료.
3. beagu_private.challenge_device_sessions 또는 검증 가능한 기존 세션 확장
   - 해시로 저장한 짧은 만료 토큰, device_id, visitor_id, expires_at, revoked_at. 서명 증명 갱신 및 서버의 매요청 권한 재조회.
4. beagu_private.challenge_auth_accounts
   - campaign+visitor_id UNIQUE (referral_profiles FK), auth_user_id UUID UNIQUE (auth.users FK), username_canonical UNIQUE, state(pending/active/disabled), verified_at, created_at.
   - Auth 비밀번호/재설정 토큰 **저장 금지**. 이메일은 auth.users에 맡기고 서비스 테이블 복제 최소화.
5. beagu_private.challenge_auth_enrollment_tickets
   - 티켓 해시/짧은 TTL/1회 소비, visitor_id, device_id, 가입 요청 ID, 예약 username, auth_user_id, 생성·만료·사용 시각.
6. beagu_private.challenge_identity_revocations
   - 코드 교체 이력, 이전 코드 해시, 신규 코드 해시, 사유, 회수 시각, 관리자 감사 ID; **원문 비밀값 로그 금지**.
7. 사용자명·로그인·코드 재발급 관련 예산/시도 제한
   - 앱 레벨·Auth 레벨 제한 병행. 사용자명·IP·device 별 최솟값, 서버측 IP 신뢰성 점검.
8. 별도 신규 플래그
   - device_lv2_enabled=false, account_signup_enabled=false, account_login_enabled=false.
   - 기존 login_enabled는 **true로 바꾸지 않음**. 기존 public_enabled 및 ingest_enabled도 설치·테스트 완료 전 false 유지.

모든 신규 개인정보/인증 관련 테이블은 비공개 스키마 + RLS + anon/authenticated 직접 권한 없음. 서비스용 Edge 내부에서 검증. 권한 결정은 클라이언트 상태나 JWT user_metadata가 아닌 DB 원장으로 한다.

## 5. UUID 취약점과 레거시 소유권 복구 정책

### 취약점

현재 운영 중인 구형 beagu-challenge-identity는 유효한 Lv.1 공통 세션 + 타인 visitor UUID만으로 그 사람의 원래 고유번호를 읽을 수 있는 가능성이 있다. 개인 고유번호를 인증 자격으로 쓰지 않기로 바꿔도 **원문 노출 취약점 자체는 남으므로 별도 차단**해야 한다.

### 신규 코드 발급: 해결 경로

- 브라우저가 신규 키쌍을 준비. 서버는 임의 UUID만으로 기존 고유번호를 반환하지 않으며, **신규 신원 발급과 공개키 결속을 하나의 트랜잭션으로 진행**.
- 재조회 시 서버 nonce에 대한 기기 개인키 서명 + 서버 검증된 세션을 요구. 서명 실패/모르는 UUID는 일반 오류만 반환.
- 공개 API에 identity_code 원문을 출력하는 경우는 최초 적법한 발급 또는 검증된 소유자 재조회에만 한정하고, 모든 응답 no-store. 향후에는 코드 해시만 운영 인증에 사용.
- 기기 키 손실 시 UUID만으로 자동 재발급하거나 다른 브라우저로 이전할 수 없음. 자동 복구 방식을 열지 않는다.
- challenge_device_claims에 준비되어 있는 단순 해시 proof가 누구나 **첫 바인딩**할 수 있는 구조는 충분하지 않으므로 검증·재설계 후 교체.

### 기존 고유번호(레거시)

- 이전에 발급한 코드에는 당시 서버에 강하게 결속된 기기 개인키나 인증 계정이 없을 수 있다.
- 그러므로 **UUID + 고유번호 + 공통 Lv.1 세션 조합만으로 소유권이 강하게 입증되는 것은 아니다.** 유출 가능성이 있는 코드를 본인이 보유했다는 사실을 단독 소유권 증명으로 쓰지 않음.
- 기존 참여자에는 기존 발급번호/순번과 Lv.1 권한은 보존하되, 소유권 강도가 부족하면 자동 Lv.2 기기 결속·계정 선점을 **보류**.
- 레거시 정당 소유자의 수동 이전은 추가 독립적 확인 가능한 증거, 이메일 확인 및 관리자 심사/감사 이후에만 허용. 실제 확인 가능한 원천 증거가 없으면 강한 소유권 입증이 불가능함을 인정하고, 일방적인 계정 귀속·회복을 하지 않음.
- 코드 노출/유출 시 서버 관리자 전용으로 기존 코드 폐기 → 새 코드 발급 → 해시 원장 재결속 → 구기기 세션 철회 → 관련 가입 티켓 무효화 → 기존 Auth 계정·레벨 관계 유지 또는 안전한 재확인까지 **원자적으로 수행**하도록 개발.
- 이미 제3자가 유출된 코드를 확보했을 가능성을 고려해 기존 번호 3종의 민감도는 높게 유지하되 **로그인에는 사용하지 않음**.

## 6. Google Forms 설치 범위 유지

- 기존 1차 문항 제목 **BG26 추천 확인값 (자동 입력)** / **BG26 기기 확인값 (자동 입력)**, 둘 다 단답형·선택 문항 유지.
- 기존 scripts/beagu-2026-noon-sync.gs 수정본 + scripts/beagu-2026-referral-addon.gs 추가 및 installBeagu2026ReferralBridge 1회 실행 절차 **변경 없음**.
- survey.html 사전 입력 링크의 실제 entry ID 2개만 설치 후 반영. 본문 응답·학교·이름·이메일은 추천 이벤트와 연결하지 않음.
- Google Forms 익명 응답에서 사전 입력 UUID는 사용자 임의 수정 가능. 중복·동일 UUID·반복 이벤트는 제한하되 **실제 사람을 완벽하게 식별한다고 주장하지 않음**.
- 새로운 인증 정책 때문에 구글폼 문항, URL, 현재 통계 트리거나 로그인 요구 설정을 다시 수정할 필요 없음.

## 7. 2차 구현 순서와 완료 기준

P0. **착수 상태 확인** — 사용자 Google Forms 문항 2개/entry ID/Apps Script 트리거 설치 여부만 확인. 실제 webhook 제출 테스트 전 운영 ingest OFF.

P1. **취약점 봉쇄** — 현재 서버·브랜치 UUID 조회 경로 전체 감사. 기기 공개키 원자 발급, 기존 코드 조회 막기, 신규 challenge 응답/리플레이 방지. 레거시 보류 흐름 설계. 기존 Lv.1/기존 챌린지 회귀 테스트.

P2. **기기 기반 Lv.2 세션** — 추천 실적 프로필과 소유자 proof 연결. 동일 기기 signed challenge + 서버의 실시간 access_level=2 조회. 다른 UUID, 만료 세션, 우회 header는 거부.

P3. **정식 계정 테이블·Supabase Auth** — 이메일 확인 설정·허용 redirect 확인. username 유일성, pending/active, Auth user 1:1 링크. 신선한 device proof + Lv.2 사용자만 가입. 이메일 인증 후 원자 확정.

P4. **다른 기기 로그인/복구** — 아이디/비밀번호 로그인(이메일 내부 매핑), Auth 사용자 확인 + profile 권한 확인, rate limits, 비밀번호 찾기 이메일·세션 교체. 비밀번호는 Supabase Auth만 처리.

P5. **UI** — “레벨2가 열렸습니다!” 모달; 계정 만들기/나중에 하기; 기존 기기 즉시 Lv.2; 다른 기기 로그인과 미가입 안내. 로그인 상태 변경·로그아웃·기기 키 분실 시나리오 포함.

P6. **정합성·보안 테스트** — 긴/짧은/10자리 코드 소유권 조회는 입증된 소유자만; 코드 단독 로그인 차단; 타인 UUID/고유번호·키 재사용·계정 중복/username 충돌·이메일 미확인·동시 가입·토큰 재생·추천 중복/동일 기기·revoke 이후 세션 거부·비밀번호 재설정·복수 기기. 모든 테스트는 새 테스트 데이터와 롤백 가능 경로로.

P7. **최종 승인 게이트** — 먼저 staging/별도 개발 브랜치에서 Forms→스크립트→추천 집계→기기 승급→계정 확인→다른 기기 로그인 전 과정 확인. main/프로덕션은 명시적 최종 승인 전 금지. 모니터링·롤백 절차 확인 후 플래그를 **개별 단계**로 개방. legacy login_enabled는 영구 OFF.

필수 결과물: 수정 파일과 SQL migration diff, 실제 Supabase 보안 advisor 점검 결과, 테스트 실행 결과, 소유권 위험·레거시 복구 정책, 운영 롤백 순서. 

## 8. 수용 테스트 (최소)

- [ ] 기존 공통 Lv.1 인증/검색/학교비교 그대로 작동
- [ ] 3종 기존 고유번호 모두 보존, 코드만으로 Lv.2·가입 불가
- [ ] 본인 UUID를 임의로 바꿔도 다른 고유번호 원문 불가
- [ ] 정상 추천 1건은 account 없음에도 원장 레벨2로 승급
- [ ] 기존 바인딩 기기는 계정 없이 Lv.2 가능
- [ ] 다른 기기는 기기 proof가 없으면 로그인 UI 표시
- [ ] Lv.2 사용자가 선택적으로 이메일 확인 후 계정 생성 가능
- [ ] 한 개인에 두 Auth 계정, 한 Auth 계정에 두 개인 연결 불가
- [ ] 미인증 이메일·레벨1 계정·해지 계정은 Lv.2 거부
- [ ] 아이디 로그인 실패/과다 시도 제한 및 이메일 비밀번호 복구 작동
- [ ] 코드 재발급 시 구 코드 사용·유출 관련 세션 거부
- [ ] 기존 설문 URL, 응답 데이터, 집계, Lv.1 사용자의 기존 상태 영향 없음
- [ ] 1차 설치 중에도 운영 Lv.2 기능 OFF
