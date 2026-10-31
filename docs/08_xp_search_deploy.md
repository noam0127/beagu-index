# 배구지수 8순위 — XP 게이지·학교 선택/상세 기록 (2026-10-31)

## 결과와 현재 단계
- GitHub UI: 홈페이지/index.html + challenge.html 모두 같은 500명 목표 게이지.
- 출처: 기존 `beagu_join_challenge`가 발급해 온 2026 챌린지 `participant_no`의 최대값만.
  이는 **2026 Google Forms 응답자 수가 아니며**, 이미 지급된 개인 “N번째”와 현재 누적 최댓값은 다를 수 있음.
- RPC 불가/오류에는 “집계 확인 불가” 표시. 누적 0명으로 변환하지 않음.
- 성공 시 499/500, 500/500, 501/500(게이지 상한 100%)이 정확히 처리됨.
- 이벤트 종류: `search_confirmed`(Enter+유일학교), `school_selected`(실제 클릭), `detail_viewed`(성공적인 상세 렌더).
- 자동완성, 단순 입력, 무결과, 중복/동명이교 결과, 자동 클릭만으로 이벤트 전송 금지.
- 기존 `beagu_record_visit`는 유지. 2023~2026 조사 데이터와 인증/레벨 공개권한도 유지.
- 저장 필드에는 school_id, 이벤트 타입, 페이지, 표시레벨, action_id, 시각만 있음.
  인증코드·원본 검색어·IP·실명·비밀번호는 기록하지 않음.
- `viewer_level`은 페이지 표시값이지 서버에서 재검증된 참여코드 등급이 아님.
- 학교 관심도 이벤트는 학교의 근무문화나 우수성을 평가하는 지표가 아님.

## 반드시 수행할 운영 DB 설치
현재 GitHub 정적 파일 외에 서버 DB 설치가 필요합니다. DB SQL은 이 실행 환경에서
실행할 수 없으므로 **아직 운영 DB에 설치됐다고 보장하지 않습니다.**

1. Supabase 프로젝트 `snvzwrexuqavnfvzgxqj` SQL Editor에서
   `supabase/08_xp_search_install.sql` 원문을 검토한 뒤 실행.
2. `supabase/08_xp_search_verify.sql`을 읽기 전용으로 실행.
   `beagu_get_challenge_progress()` 값이 챌린지의 현재 최대 발급 순번과 일치해야 함.
3. 개인 창에서 입력/Enter/학교 선택/상세 클릭 테스트 후 검증 SQL에서 기록 건수 확인.
4. 브라우저 `service_role` 키를 추가하지 말고, SQL Editor 관리자 접근만 유지.
5. Supabase Health/Security Advisors에서 권한 경고 검토.
   이번 API는 엄격히 검증된 익명 이벤트 쓰기가 필요하므로
   `SECURITY DEFINER` RPC를 제한된 예외로 사용하며 원본 테이블에는 직접 권한이 없음.

**롤백:** GitHub에서는 이번 변경 커밋을 되돌림. DB 테이블과 로그의 삭제는
데이터 보존 문제가 있으므로 사전 백업·동의 없이 수행하지 않음.
