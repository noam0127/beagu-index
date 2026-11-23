# 배구지수 v1.1.0 — Lv3 회원 연결·중지·동일 계정 재연결 및 감사 (2026-11-23)

## 실제 범위

- 시험 Supabase `ycwuugggqbunlbwuzvbx`와 GitHub 브랜치 `fix/v110-staging-edited-api-recovery-20261123`만 수정. 운영 Supabase `snvzwrexuqavnfvzgxqj`, `baeguindex.com`, GitHub `main` **변경 금지**.
- 기존 정식 Auth 이메일 검증, Lv2 추천 실적 검증, 현재 `auth.sessions` 검증 및 원래 기기 비밀값 해시 검증을 모두 재사용. 브라우저/사용자에게 service-role 키를 제공하지 않음.
- ‘연결 해제’의 실제 정책은 **일시 중지 `status='suspended'`**. 다른 계정에게 같은 방문자나 과거 작성자 UID를 이전하지 않는다. 기존 포스트잇/댓글은 삭제하지 않으며, **Lv3와 새 작성·반응·댓글 권한을 중단**한다. 같은 계정·동일 방문자·동일 작성자·원래 기기·새 유효 세션·유효 추천을 확인할 때만 명시적인 복원을 허용한다. 기기 상실 또는 타인에게 이전은 자동 허용하지 않으며 별도 본인 확인·복구 정책이 필요하다.

## 실제 시험 DB 변경

- [시험 전용 이행 SQL](https://github.com/noam0127/beagu-index/blob/fix/v110-staging-edited-api-recovery-20261123/scripts/staging/schema-postit-member-transition-audit-qa-20261123.sql) 적용:
  - `beagu_private.beagu_postit_member_link_audit` 생성. `LINK` / `SUSPEND` / `REACTIVATE`와 이전/이후 상태·시각·최소 식별자만 비공개 감사. **이메일, 휴대전화, IP, Auth JWT, 기기 비밀값/해시를 감사에 저장하지 않는다.** 사용자 UUID·방문자 UUID·세션 UUID도 재식별 가능성이 있는 내부 정보이므로 비공개/RLS 제한; 보존기간·삭제 요청 대응 정책은 정식 출시 전 확정 필요.
  - `public.beagu_stage_postit_member_transition(p_user,p_session,p_visitor,p_author,p_action,p_device_hash)` 설치. `SECURITY DEFINER SET search_path TO ''`, **service_role만 EXECUTE 허용**. DB 트랜잭션 안에서 실제 유효 Auth 세션 재확인, 방문자/회원 고유 연결 `FOR UPDATE`, 원래 기기·실제 2026 유효 추천 재확인 후 상태 변경과 감사 INSERT 원자 처리.
  - 다른 Auth 사용자 또는 방문자·작성자 ID는 **중지 상태에서도 절대 이전 불가**; 중복 LINK·중복 중지는 상태 변화/감사 중복 없음. 중지된 계정을 일반 LINK로 재활성화할 수 없으며 `REACTIVATE`와 원래 기기 증명이 필요.
  - 마지막 감사 INSERT가 실패하면 회원 상태 변경 자체도 자동 롤백.
- [기존 무감사 연결 RPC 철회](https://github.com/noam0127/beagu-index/blob/fix/v110-staging-edited-api-recovery-20261123/scripts/staging/schema-disable-unaudited-member-binding-qa-20261123.sql): 시험 DB의 구형 `beagu_postit_bind_verified_member`에서 **service_role 실행 권한까지 철회**. 최신 Post-it 시험 API는 이 RPC를 사용하지 않으며 새 감사 RPC만 호출. 운영 구형 RPC는 이번에 변경하지 않았다.
- 시험 `beagu-postit-api-v1` **v7 ACTIVE**: `link_member`, `suspend_member`, `reactivate_member` 요청은 반드시 서명 검증된 Auth JWT와 현재 세션 ID·Lv2 원래 방문자·서버 계산 작성자 ID를 사용해 동일 RPC를 호출. 심사 및 감사 RPC 실패 시 HTTP 503으로 fail-closed. `writer_status`는 해당 인증 계정의 `active`/`suspended`/`unlinked` 상태만 전달, 다른 계정 정보는 노출하지 않음.
- 웹 `challenge.html`에 **'회원 연결 잠시 해제'** 버튼 추가. `js/challenge-member-auth-v1.js`에서 확인 대화상자·권한 갱신·중지 상태 및 원래 기기 복원 UI 지원. 로그인 성공/로그아웃/회원 연결 상태 확인과 Lv3 표시 서버 재검증을 분리. 신규/재연결 모두 원래 기기 증명을 필요로 함.

## 실행 검증

- [실제 QA SQL](https://github.com/noam0127/beagu-index/blob/fix/v110-staging-edited-api-recovery-20261123/tests/sql/staging-member-link-lifecycle-rollback-20261123.sql) PASS: **가상 DB 사용자 및 실제 DB 함수**로 LINK→SUSPEND→REACTIVATE 각각 감사 발생, 재실행 멱등성, 다른 사용자 탈취 거부, 원래 기기 없거나 가짜 비밀값의 거부, 비활성 추천 거부, 만료·삭제 세션 거부, 과거 연결의 암묵적 복원 거부, 감사 INSERT 강제 실패 시 전 상태 복구 검증. 모든 가상 계정·세션·방문자·추천·기기·연결·감사·트리거는 `ROLLBACK` 후 **0행**.
- [서버/화면 정적 보안 계약 테스트](https://github.com/noam0127/beagu-index/blob/fix/v110-staging-edited-api-recovery-20261123/tests/staging-member-lifecycle-contract.test.py)로 원래 방문자 유일성·서버 세션 확인·원자 감사·비공개 권한·사용자 명시 동작 및 원본 RPC 우회 금지 확인.
- [PC·모바일 Chromium 시뮬레이션](https://github.com/noam0127/beagu-index/blob/fix/v110-staging-edited-api-recovery-20261123/scripts/test-v110-staging-lv3-browser.cjs): **실제 브라우저 렌더링**, 그러나 인증/레벨/포스트잇 서버 응답은 모의 처리. Lv3→중지 시 Lv2, 원래 기기 키가 없으면 복원 버튼 숨김, 같은 계정·기기 복원 후 Lv3를 검사. 실계정 사용자나 실제 추천을 만들지 않음.
- 매 시점 `auth.users`, `auth.sessions`, `beagu_postit_member_accounts`, 비공개 회원 감사, 추천 프로필/기기 claim 등에 잔여 QA 행이 없는지 별도 조회.

## 출시 전 필요

- 실제 Render 시험 웹 주소·Git SHA 및 CORS 검증, **실 이메일 확인 완료 계정과 실제 추천 달성 방문자**를 사용한 회원 연결·중지·복원·계정 탈취 시도 E2E.
- 본인 인증을 거친 ‘기기 분실/계정 변경/탈퇴’의 별도 정책. **자동 명의 이전은 금지**.
- UUID/감사 기록의 보존기간·열람/삭제 요청 및 개인정보 영향 검토, 관리자 감사 열람 접근 통제, 장애 및 중복 요청 재현 테스트.
- 기능 잠금 **5개 유지**, 전체 운영 출시 **NO-GO**.
