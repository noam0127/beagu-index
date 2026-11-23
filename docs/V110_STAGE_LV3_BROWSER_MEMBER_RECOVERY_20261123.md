# 배구지수 v1.1.0 — Lv3 브라우저 표시 및 회원 인증 E2E 사전검증 (2026-11-23 KST)

## 문제와 실제 수정

시험 Supabase `beagu-level-api` v6는 `verifiedMemberTier(req, session)`를 통해 Auth JWT·2026 추천 Lv2 방문자·활성 회원 연결 기록을 확인하고 **Lv3**를 판정한다. 하지만 GitHub 웹 인터페이스의 `js/beagu-level-state-v1.js`는 `Authorization` 헤더 없이 `action:verify`를 호출하고 결과를 Lv2로 축소했다. `js/beagu-participation-auth-v2.js`도 `level>2`를 거부했고 `js/challenge-member-auth-v1.js`는 인증 레벨이 정확히 2가 아니면 회원정보 모달을 닫았다.

이는 **서버에는 Lv3가 구현되어 있지만 웹에서는 정상 인증 회원도 Lv3로 표시하지 못하는 결함**이다.

개발 브랜치 `fix/v110-staging-edited-api-recovery-20261123`에 다음을 실제 반영했다.

1. `js/beagu-level-state-v1.js`: 브라우저의 Lv1/Lv2 참여 세션을 보존하고, 독립된 **Supabase Auth access_token**이 있으면 서버 조회시에만 `Authorization: Bearer`를 함께 보낸다. 서버가 `level:3`을 반환한 경우에만 Lv3 뱃지·레벨 데이터·상태 카드를 표시한다. Auth JWT가 없거나 실패하면 서버의 Lv1/Lv2 결정으로 내려가며, 브라우저 메타데이터나 회원가입 응답만으로 레벨을 올리지 않는다.
2. `js/beagu-participation-auth-v2.js`: 참여코드 검증·상세 모달에서 **서버 확정 Lv3** 표시를 허용. 회원정보 진입 명칭을 Lv3에 맞게 수정했다. `request('verify')`에서만 별도 Auth 토큰을 전달하고, 신규 참여코드 `login`에서는 JWT를 자동 전송하지 않는다.
3. `js/challenge-member-auth-v1.js`: 서버 확정 Lv3가 되더라도 회원정보 모달을 닫지 않는다. 회원 연결/로그인/로그아웃 이벤트 발생 후 레벨을 다시 서버에 확인하도록 했다. **원래 기기의 소유권 연결 버튼은 그대로 유지**한다. 다른 계정에 자동 연결하면 잘못된 계정과 방문자 ID가 영구 결합될 위험이 있으므로 사용자의 연결 행동을 보존했다.
4. **운영 환경은 변경하지 않음.** GitHub `main`, 운영 Supabase 및 `baeguindex.com` 배포를 수정하지 않았다. 현재 Render 실제 시험 웹 배포도 미확인이다.

## 검증 범위와 근거

- [실제 PC/모바일 Chromium 자동검사 #45095749852](https://github.com/noam0127/beagu-index/actions/runs/45095749852) **PASS**:
  - 이메일 미인증 상태에서도 Lv2를 유지하고 Lv3를 부여하지 않는다.
  - 인증됐지만 동일 2026 방문자·기기 연결이 없으면 Lv2를 유지한다.
  - Auth 확인과 원래 기기의 회원 연결이 성립하면 서버 **모의** 판정 `level:3`을 받으며 Lv3 화면/인증 상세 모달이 정상 작동한다.
  - 다른 Auth 계정·이메일 미인증·연결 해제에서는 Lv2로 하향한다.
  - 참여 세션을 무효화하면 Lv0으로 내려간다.
  - 동시에 기존 Lv0/1/2 인증, 포스트잇, 화면 이동, 비식별 성능 계측 테스트도 PASS.
- [서버 Lv3 순수 판정 함수의 부정·양성 계약 테스트](https://github.com/noam0127/beagu-index/blob/fix/v110-staging-edited-api-recovery-20261123/tests/staging-lv3-member-predicate.mjs): `eligiblePostitAuthUser`, `isVerifiedLv3Member`, `resolveVerifiedPostitOwner`에서 정확한 2026 Lv2 방문자·이메일 인증·회원 레코드 결합이 필요함을 검증. 미인증/정지/삭제/익명 계정·다른 방문자/다른 계정·정지된 회원은 거부.
- [시험 DB 회원 연결 RPC 부정 테스트](https://github.com/noam0127/beagu-index/blob/fix/v110-staging-edited-api-recovery-20261123/tests/sql/staging-lv3-device-bind-denial-rollback-20261123.sql) **실제 SQL PASS**: 유효 추천/기기 증명이 없는 가상 `beagu_postit_bind_verified_member` 호출은 NULL 반환, 회원 행 생성 없음. 익명/회원의 직접 RPC 실행 권한 없음, `service_role`만 허용. `BEGIN/ROLLBACK` 후 회원/사용자/참여 세션/추천 프로필 0건.

## 사실과 제한

**Lv3가 실제로 발급된 것은 아니다.** PC/모바일 화면에 사용한 Auth/Level/Postit 응답은 가상으로 구성했다. 시험 Supabase에 실제 Auth 사용자 0명, 실 Lv2 자격 계정 0건인 상태에서 실제 메일 발송, 회원가입, 이메일 확인, 본인 원래 기기 연결의 양성 E2E를 수행하지 않았다. 실제 Render 주소/SHA/CORS도 아직 미확인이다.

검증된 것은 웹의 **Lv3 표시 결함 수정, 서버 권한 순수 함수, 무권한 RPC 거부**다. 출시를 허용하는 전체 E2E가 아니다. 독립 시험 API는 43개이며 참조 API 17/17개 설치; 2026 관리자/추천/학급일지 **5개 기능 잠금**과 운영 출시 **NO-GO**는 유지한다.

## 남은 필수 작업

- 시험용 Render 호스트 배포 및 정확한 Git SHA·CORS·Auth email redirect allowlist 확인. 정확한 `https://<host>.onrender.com/challenge.html`만 시험 프로젝트에 등록하고, 운영 사이트로 돌아가는 링크를 금지한다. `render.yaml` 변경은 배포가 아니다.
- 사용자가 승인한 실제 시험용 이메일 인증이 가능한 계정 및 유효한 2026 챌린지 Lv2 실적/기기 증명이 생긴 다음에만 실제 Lv3 회원 연결의 양성 브라우저 E2E 실행. 임의로 운영 개인 기록 복사하거나 실제 인증을 우회하지 않는다.
- 서버 역할이 아닌 일반 앱 사용자로의 직접 DB RPC 호출 방지, Auth 세션 취소·만료·다른 기기 재접속 및 회원 연결 삭제 후 Lv3 하향 E2E 검증.
- 전체 Auth/MFA, 공개 승인 프라이버시 검토, 실제 모바일 Render E2E 통과 전에는 운영 웹/DB/main 변경 금지.

## 2026-11-23 후속 — JWT 유효 기간과 실제 Auth 세션 종료를 분리해 철회 처리

**발견된 핵심 누락:** 기존 시험 `beagu-level-api` v6와 `beagu-postit-api-v1` v5는 `supabase.auth.getUser(jwt)`로 서명된 JWT와 활성 회원 연결을 확인했지만, 토큰에 포함된 `session_id`가 **현재도 `auth.sessions`에 남아 있는지** 독립 확인하지 않았다. Supabase [User sessions](https://supabase.com/docs/guides/auth/sessions) 자료에 따르면 JWT의 `session_id`는 DB의 `auth.sessions.id`에 대응한다. 로그아웃 직후 아직 만료되지 않은 JWT를 서버가 신뢰하지 않도록 추가 검사했다.

### 시험 환경에서 수행한 실제 변경

1. [서비스 역할 전용 세션 검사 SQL](https://github.com/noam0127/beagu-index/blob/fix/v110-staging-edited-api-recovery-20261123/scripts/staging/schema-lv3-revoked-auth-session-qa-only.sql) 적용. `public.beagu_stage_active_member_auth_session(p_user uuid,p_session uuid)`은 두 값이 동일한 활성 `auth.sessions` 행을 가리키고 `not_after`가 만료되지 않았을 때만 true. `PUBLIC`·`anon`·`authenticated` 직접 실행 금지, `service_role`만 실행 허용. 시험 DB에만 존재하며 운영 DB 수정 없음.
2. JWT payload를 단순 신뢰하지 않기 위해 **서버에서 먼저 `admin.auth.getUser(jwt)`로 검증된 사용자**를 얻고, 그 뒤에만 JWT의 `sub`·`session_id`·`exp`를 읽는 [공유 검사기](https://github.com/noam0127/beagu-index/blob/fix/v110-staging-edited-api-recovery-20261123/scripts/staging/recovered-beagu-level-api-v5/_shared/member-session-v1.mjs) 추가. JWT payload 파싱 자체는 서명 검증이 아니며 언제나 `getUser` 검증 후에 수행.
3. `beagu-level-api` **시험 v7 ACTIVE**: `verifiedMemberTier`가 회원 연결을 조회하기 전에 JWT의 Auth 세션 실존/유효 시간을 확인. 세션 삭제·기한 만료·계정 불일치·DB 조회 실패는 Lv3를 부여하지 않고 기존 유효 Lv2 자격으로만 응답. 원래 Lv2 추천 실적 검증은 계속 유지.
4. `beagu-postit-api-v1` **시험 v6 ACTIVE**: `authenticatedUser`에서 같은 세션 재검증을 적용. `link_member`·포스트잇 작성·댓글·공감 등 모든 정식 회원 행동에서 만료/종료된 Auth 세션은 회원 권한으로 통과할 수 없음. Lv2 참여코드만으로는 쓰기 권한이 생기지 않음.
5. **별도의 회원 연결 취소**는 현재 테이블의 `status='suspended'` 또는 기록 삭제로 나타낼 수 있으며, `verifiedMemberTier`의 active 여부와 `resolveVerifiedPostitOwner`가 즉시 거부하도록 기존 구현 유지. 새로운 사용자 공개 해지 UI나 운영 계정 변경은 도입하지 않음.

### 실제 시험과 검증 경계

- [실제 SQL Auth 세션 철회/만료 검사](https://github.com/noam0127/beagu-index/blob/fix/v110-staging-edited-api-recovery-20261123/tests/sql/staging-lv3-auth-session-revocation-rollback-20261123.sql): 가상 DB 사용자+세션을 **BEGIN/ROLLBACK** 안에서 생성. 정상 세션만 true, 다른 사용자 ID·NULL·만료·삭제된 세션은 false. 최종 Auth 사용자·세션·회원 0행 확인.
- [실제 SQL 회원 연결 취소 검사](https://github.com/noam0127/beagu-index/blob/fix/v110-staging-edited-api-recovery-20261123/tests/sql/staging-lv3-member-suspend-delete-rollback-20261123.sql): 가상 활성 회원 연결은 조회되지만 상태를 `suspended`로 변경하거나 행을 삭제하면 활성 연결 조회에서 제외. 최종 Auth 사용자·회원 0행.
- [JWT/서버 소스 회귀 테스트](https://github.com/noam0127/beagu-index/blob/fix/v110-staging-edited-api-recovery-20261123/tests/staging-lv3-active-auth-session.mjs): 만료·다른 주체·잘못된 `session_id`·만료 클레임 없는 JWT 거부, 서명 검증을 담당하는 `getUser` 호출 이후에만 파싱/세션 SQL을 수행하도록 확인. **테스트용 서명 문자열은 유효한 JWT가 아니며 실제 인증 성공의 증거가 아니다.**
- [실제 무인증 HTTP·CORS 검사](https://github.com/noam0127/beagu-index/actions/runs/45096617193) **PASS**, [전체 API 설치·잠금 검사](https://github.com/noam0127/beagu-index/actions/runs/45096644093) **PASS**, [PC/모바일 Chromium 가상 원격 로그아웃 검사](https://github.com/noam0127/beagu-index/actions/runs/45096624548) **PASS**. 가상 브라우저는 **서버 응답을 모의** 처리하였고, Auth 세션이 제거됐어도 브라우저에 JWT가 남은 경우 다음 서버 재확인에서 Lv3→Lv2로 떨어지는 상황을 검증했다.
- 철회가 서버에 반영되는 시점은 **다음 보호 API 요청부터**. 이미 열려 있는 브라우저의 뱃지 표시는 인증 상태 갱신/포커스 복귀 등 재검사 시점에 바뀔 수 있으며, 모든 화면이 별도 새로고침 없이 즉시 변경된다는 뜻은 아니다.

### 남은 차단

실제 Auth 가입 사용자·TOTP·실 Lv2 기기 소유권·실제 Render 호스트가 없으므로 유효 서명된 JWT를 통한 양성 Lv3·회원 철회 **실계정 E2E는 미수행**. 독립 시험 DB 함수와 Edge는 운영에 적용하지 않았다. 시험 함수 43개, 참조 API 17/17개, 기능 잠금 **5개 유지**, 전체 운영 배포 **NO-GO**.
