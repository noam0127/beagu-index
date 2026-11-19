# 2026 챌린지 개인 고유번호 (Lv.2 향후 연계용)

## 발급 및 표시

- `challenge.html`의 `#certificate`는 인디스쿨 공유용 이미지를 만드는 유일한 캡처 영역이다. 공개 참여 순번만 담는다.
- `#challengeIdentityPanel`은 `#certificate` 밖에 위치하며 `data-html2canvas-ignore="true"`를 지정했다.
- 서버 인증을 거친 동일 브라우저 방문자 UUID는 항상 같은 `participant_no`와 `identity_code`를 받는다.
- 기존 형식(2026-11-19 이전 발급): `BG26-AAAA-BBBB-CCCC-DDDD-EEEE` (80-bit). 재발급·변경·폐기하지 않는다.
- 신규 형식(2026-11-19 변경 후 첫 발급): `BG26-XXXXXX-XXXXXX` (12자리 Base32, 60-bit). `I`, `O`, `0`, `1` 제외.
- 두 형식을 모두 허용하며, 기존 `identity_code` 행은 수정하지 않는다. 1회 발급한 방문자는 원래 형식을 유지한다.
- 고유번호는 지금은 **Lv.1 참여코드도, Lv.2 로그인 코드도 아니다**. 일반 기기 스크린샷은 웹페이지가 차단할 수 없다.

## 운영 데이터

- 비공개 원장: `beagu_private.participants` (기존 순번/방문자).
- 새 비공개 원장: `beagu_private.challenge_identity_codes` (순번 ↔ 고유번호 ↔ 방문자 UUID ↔ 발급일).
- `(campaign,visitor_id)`와 `(campaign,participant_no)` UNIQUE 및 외래키, `identity_code` UNIQUE, RLS 및 공개 권한 회수.
- 2026-11-19 적용 당시 기존 9건을 일괄 발급했다. 기존 참여 순번 변경 없음.
- 새로운 발급은 `public.beagu_issue_challenge_identity(uuid)`를 서비스 역할로만 실행하는 트랜잭션을 사용한다. 구형 공개 발급 API `beagu_join_challenge(uuid)`의 anon/authenticated 실행 권한은 해제했다.

## 서버 API

- Edge Function: `beagu-challenge-identity`, `POST {action:"issue",visitor:"UUID"}`.
- 요청 헤더 `X-Beagu-Session`: `beagu-level-api`에서 발급된 기존 Lv.1 이상 세션 (6시간, SHA-256 해시 조회).
- 응답: `{participantNo,identityCode,lv1Code:false,lv2Access:false}`.
- Service role key는 서버 환경변수로만 제공한다. 비밀번호/개인번호를 공개 수집, URL, 통계 로그에 남기지 않는다.

## 관리자가 SQL Editor에서 확인

```sql
SELECT participant_no, identity_code, issued_at
FROM beagu_private.challenge_identity_codes
WHERE campaign = '2026'
ORDER BY participant_no;
```

공개 페이지 및 클라이언트 코드로 전체 번호 목록을 반환하지 않는다. 레벨2 개발 시 번호를 단독 신원증명 수단으로 쓰지 말고 별도 인증 또는 소유 확인을 설계한다.

## 2026-11-19 짧은 번호 개편

- 신규 번호는 `extensions.gen_random_bytes(12)`의 암호학적 무작위 바이트에서 한 바이트당 5비트씩 추출하여 32문자 알파벳에 매핑한다.
- 기본키·고유키·참여 순번·참여자 기록은 그대로 유지한다. 레벨2에서 두 형식을 모두 인식한다.
- 짧은 번호도 단독 로그인 자격증명이 아니다. 실제 레벨2 인증에는 별도의 사용자 확인과 시도 횟수 제한이 필요하다.

## 확인

- DB: 9 participation, 9 issued, 9 distinct, 0 ordinal mismatch; re-issue same visitor idempotent.
- 권한: 새 RPC는 anon/authenticated 실행 불가, service_role만 실행 가능.
- Edge Function ACTIVE v1, frontend changes committed. 실제 로그인 계정을 사용한 모바일/PC 브라우저 E2E는 별도 검증이 필요하다.
