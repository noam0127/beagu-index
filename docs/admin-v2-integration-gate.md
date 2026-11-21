# 관리자 회원관리 v2.0 — 9단계 통합 게이트

## 실제 GitHub 비교 (2026-11-22)
`main` 대비 브랜치 비교 결과:
| PR | 브랜치 | main보다 앞선 커밋 | main보다 뒤진 커밋 | 의존 |
|---|---|---:|---:|---|
| #210 | feat/admin-v2-member-challenge-detail | 4 | 1 | 최초 |
| #212 | feat/admin-v2-member-challenge-ui | 6 | 1 | #210 |
| #214 | feat/admin-v2-member-directory-filters | 10 | 1 | #212 |
| #215 | feat/admin-v2-member-db-pagination | 16 | 1 | #214 |
| #217 | test/admin-v2-member-scale-review | 17 | 1 | #215 |

이 브랜치들은 누적 의존 관계다. 각 PR의 변경사항을 독립적으로 main에 순서 없이 병합하면 중복 변경/충돌 위험이 있다.

## 통합 권장 순서
1. 최신 main의 1개 선행 커밋이 무엇을 바꿨는지 확인하고, 특히 `admin.html`, `js/beagu-admin-members-v1.js`, Edge Function, migration 충돌 여부 검토
2. 통합용 **새 시험 브랜치**에서 main + 최종 누적 브랜치(#217) 통합. 운영 main 직접 변경 금지
3. 기존 PR #206(회원 목록 마스킹)과 현재 누적 UI가 같은 JS 파일을 변경하므로 반드시 수동 diff 비교 및 서버 응답 최소화 정책 확정
4. DB migration 순서: `20261122010000_admin_member_challenge_summary_v1.sql` → `20261122020000_admin_member_directory_v2.sql`. 실제 DB에는 이 채팅에서 적용 금지
5. Edge Function은 DB RPC 존재/권한 검증 후 배포; UI는 그 뒤에 적용
6. 테스트 웹에서 인증, 회원 목록, 페이지 201/501, 상세 챌린지, 정지·복구, 감사 로그, 롤백 시나리오 실행
7. 검증 및 사용자 승인 후에만 별도 배포 채팅에서 운영 반영

## 실제 확인된 위험
- #210부터 #217까지 `supabase/functions/beagu-admin-members-v1/index.ts`를 누적 변경
- #212부터 #217까지 `js/beagu-admin-members-v1.js` 변경; PR #206과 잠재적 충돌
- 모든 비교 브랜치가 main보다 1커밋 뒤짐. `compare_commits`의 diverged는 텍스트 병합 충돌 확정 판정이 아님
- #215에서 발견된 중복 `status`/`sort` 선언 및 200페이지 상한은 #215 브랜치에서 수정됨
- #210 SQL 반환 컬럼 `link_status`는 RETURNS TABLE의 첫 컬럼 이름으로 매핑되므로 `select m.status` 자체만으로는 오류라고 단정할 수 없음. 실제 RPC 검증 필요
- SQL 서비스 역할 권한, RLS, MFA, 개인정보 노출 여부는 통합 후 실검증 필요
- 4,000명 초과 성능 검증, 전체 자동 테스트, main 최신 코드와 실제 병합 테스트는 아직 미실시

## 완료 기준
- 최신 main과 통합 브랜치 간 코드/DB 충돌 0건
- Node/Deno 정적 및 단위 테스트 모두 성공
- 테스트 DB 4,001명·10,001명 검증
- anon/authenticated 권한 차단 및 관리자 AAL2 세션 검증
- 기존 회원 상세·정지·복구·감사 로그 회귀 통과
- 테스트 웹에서 사용자 승인

이 문서는 배포 실행 명령이 아니며, main 병합/운영 배포/운영 DB 수정은 금지한다.
