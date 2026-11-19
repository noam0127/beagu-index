# 2026 챌린지 개인 고유번호 (Lv.2 향후 연계용)

## 발급 및 표시

- `challenge.html`의 `#certificate`는 인디스쿨 공유용 이미지를 만드는 유일한 캡처 영역이다. 공개 참여 순번만 담는다.
- `#challengeIdentityPanel`은 `#certificate` 밖에 위치하며 `data-html2canvas-ignore="true"`를 지정했다.
- 서버 인증을 거친 동일 브라우저 방문자 UUID는 항상 같은 `participant_no`와 `identity_code`를 받는다.
- 예시 형식: `BG26-AAAA-BBBB-CCCC-DDDD-EEEE` (20자리 무작위 16진수, 총 80-bit).
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

## 확인

- DB: 9 participation, 9 issued, 9 distinct, 0 ordinal mismatch; re-issue same visitor idempotent.
- 권한: 새 RPC는 anon/authenticated 실행 불가, service_role만 실행 가능.
- Edge Function ACTIVE v1, frontend changes committed. 실제 로그인 계정을 사용한 모바일/PC 브라우저 E2E는 별도 검증이 필요하다.
