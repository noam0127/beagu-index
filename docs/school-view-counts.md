# 학교별 조회수 (2026-11-20)
- Displays a small eye counter on Lv.0/Lv.1 search cards and the public school report.
- Meaning (updated): one anonymous browser per school per Asia/Seoul calendar day after a saved `school_selected` action. Search-result impressions, text searches and detail-view events alone do not count. Lv.0 selections, Lv.1 detail-expansion selections and selecting a school on the public report page all qualify.
- Starts at installation/selection-metric switch; older school-search telemetry events are not backfilled, since legacy events cannot reliably deduplicate repeat browsers or identify tests/admin actions. The existing counter tables were empty at the time of this switch.
- Server keeps no raw visitor UUID, IP, name, email, or search query in the new view tables. Private daily rows contain salted SHA-256 pseudonyms; the public table contains only counts. All tables have RLS and no anon direct table access.
- RPCs: `beagu_record_school_view` validates a recent saved `school_selected` action and only increments a distinct daily visitor; `beagu_school_view_counts` returns at most 40 aggregate counts.
- Admin exclusion is ready for verified Supabase Auth app_metadata admin roles and a private owner-browser exclusion digest. No admin identity or browser has been registered here; until admin login/registration exists, unauthenticated operator browsing still counts.
- Network failures do not show a fictitious value. The counter updates only on confirmed server results.

## 2026-11-20 수집 경로 보강
- `school_selected` 이벤트가 서버에 성공적으로 저장되면, `js/search-telemetry-v1.js`가 **직접** `beagu_record_school_view` RPC를 호출한다.
- `BeaguSchoolViewCounts` UI 위젯이 누락되거나 늦게 로드되어도 중복 제거 조회수의 서버 기록은 계속 시도한다.
- UI 카운터는 `applyConfirmedCount`로 **서버가 확인한 수치만** 표시한다. 원본 검색 이벤트를 조회수로 변환하거나 기존 학교 통계에 소급 추가하지 않는다.
- 계측 시점 이전 `school_selected` 이벤트 162건과 실제 일별 중복 제거 조회수 0건은 의미가 서로 다르다. 새 사용자 선택으로 유효한 요청이 들어온 경우부터 누적한다.
