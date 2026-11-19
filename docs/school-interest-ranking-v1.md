# 학교 관심 순위 v1 (2026-11-20)

## 위치 / 레벨
- 검색 화면의 **학교별 찾기** 입력창 바로 아래 (search.html, search-lv1.html).
- Lv.0: 잠금 카드만 표시하며 순위 데이터 호출 없음.
- Lv.1/Lv.2: `X-Beagu-Session` 토큰을 서버에서 확인한 뒤 두 순위 표시.
- 최근 7일 많이 찾는 학교 / 이전 7일 대비 급상승 학교, 각 5개 기본 표시, 최대 10개.
- 기준 미달일 때는 실제 순위를 추정하거나 가짜 데이터를 넣지 않음.

## 집계
- 기존 `beagu_log_school_search` 성공 후에만 `beagu_record_school_interest` 호출.
- 검색을 확정하거나 학교를 직접 선택 / 상세 펼치기 할 때만 기록; 타이핑만으로 기록되지 않음.
- 익명 브라우저 UUID + 서버측 비밀 소금값으로 SHA-256 해시를 생성해 당일 학교별 중복을 제거.
- 7일 구간에서 `count(distinct visitor_digest)`로 재중복 제거.
- 5개 이상의 서로 다른 익명 브라우저가 기록된 학교만 공개.
- 급상승 = 최근 7일 순방문 수 - 이전 7일 순방문 수 >= 3.
- 최소 공개 기준과 레벨 권한은 서버측 RPC/Edge Function에서 enforced.
- 방문자는 실제 사람 1명과 정확히 일치하지 않음(브라우저별 UUID로 추정하며 조작 가능성 있음).

## 서버 구성
- Supabase 프로젝트: `snvzwrexuqavnfvzgxqj`
- 마이그레이션: `beagu_school_interest_rankings_v1`
- 테이블: `public.beagu_school_interest_daily` (RLS, 일반 열람/쓰기 권한 없음), `beagu_private.school_interest_actions` (RLS)
- 기록용 RPC: `public.beagu_record_school_interest` (기존 이벤트의 유효 action_id를 검사)
- 읽기 RPC: `public.beagu_school_interest_rankings` (service_role만 실행 가능)
- Edge Function: `beagu-school-interest-v1` (`verify_jwt=false`; 자체 Lv.1+ 세션 검증, 공개 origin 제한)
- `cron.job`: `beagu_interest_cleanup_v1` 매일 실행, 35일 경과 기록/해시 삭제

## 운영·검증
- 기존 school_search_events 기록은 변경하거나 삭제하지 않음; 과거 이벤트로 고유 방문자를 소급 추정하지 않음.
- 신규 집계 전환 전의 검색 기록은 순위에 포함되지 않음.
- DB 트랜잭션 안에서 정상 이벤트 → 익명 방문 1건 기록 → 전체 롤백을 검증함.
- 무효 action_id 호출 실패, 일반 사용자 집계 테이블 읽기 불가, service_role RPC 권한 확인.
- Edge Function은 ACTIVE로 배포됐으나 실제 브라우저를 통한 Lv.1 세션 종단간 테스트 및 Cloudflare 배포 확인은 별도 필요.
