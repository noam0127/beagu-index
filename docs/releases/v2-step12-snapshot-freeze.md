# 배구지수 통합 업데이트 v2.0 — 12단계 불변 버전 확정 안전 잠금

기준일 2026-11-22 (KST) · **릴리스 생성·시험/운영 배포·운영 DB 변경 없음**

## 목적

여러 ChatGPT 채팅에서 변경한 코드가 하나로 결합되더라도, **통합 검증 전에는 절대로 불변 버전을 생성하거나 신규 시험 배포를 할 수 없도록** 한다.
기존 시스템은 PR 작업함(6~8단계)을 읽으면서도 `create_version`, `register`, `stage_apply` 경로를 통해 최근 `main`의 변경분을 버전으로 저장하거나 배포 후보로 지정할 수 있었다.
11단계에서는 Deno·정적 HTML 패키징·배포 워커 검사를 통과했지만, 실제 시험 DB `public` 업무 테이블은 0개, 릴리스 Edge API는 미배포, RLS·Auth·브라우저 후보 E2E는 미검증이다.

## 이번 구현

- 새 순수 정책 모듈: `supabase/functions/beagu-release-manager-v1/release-snapshot-gate.mjs`.
- 관리자 Owner+AAL2 인증 뒤, `create_version` / `register` / `stage_apply`를 실행하기 전에:
  1. 서버에서 GitHub **현재 main SHA**를 직접 재조회한다.
  2. DB에서 읽은 기존 배포 작업이 `queued`/`running`인지 확인한다.
  3. 사용자가 검토했다고 요청한 `expected_sha`와 현재 main이 같은지 확인한다.
  4. 통합 후보의 승인된 불변 SHA 및 아래 8개 서버 증빙을 확인한다.
  5. 한 항목이라도 불충분하면 `423 version_snapshot_blocked`와 차단 이유를 응답한다.
- 마지막으로 **`VERSION_FINALIZATION_PAUSED=true`**가 고정된 별도 잠금이다. 모든 조건이 준비되더라도 리뷰된 소스 변경 없이는 해제되지 않는다.
- 기존 `PRODUCTION_RELEASES_PAUSED=true`는 유지하며 `prod_apply`/`prod_rollback`도 계속 차단한다.
- `status`에서 `release_gate`를 반환하며, 관리자 업데이트 화면의 버전 생성·새 시험 배포 버튼을 차단하고 이유를 표시한다. **서버 잠금이 보안의 근거**이므로 화면을 우회해도 실행할 수 없다.
- 코드가 합쳐진 뒤에도 과거의 잘못된 `stage_rollback` 대기 작업(`to_sha=null`)이 남아 있으면 `unsafe_staging_rollback_queued` 경고가 포함된다. 실제 운영 DB에 남은 요청을 지우거나 취소하지는 않는다.

## 불변 버전 후보에 반드시 필요한 독립 검증 8개

증빙 객체는 읽기 전용 평가 엔진에서 다음을 요구한다.

| 항목 | 증빙 출처 |
|---|---|
| 실제 병합 완료/트리 동일성 | GitHub tree/commit |
| 선행 PR 의존성 검증 | GitHub PR dependency review |
| 통합 SHA의 CI 성공 | GitHub Actions |
| 시험 DB 마이그레이션 검증 | 운영과 분리된 시험 DB |
| RLS·접근 권한 검증 | 시험 DB |
| Auth·역할별 인증 검증 | 시험 인증 시스템 |
| 통합 후보 브라우저 E2E | 실제 후보가 게시된 시험 브라우저 |
| 시험·운영 인프라 격리 | 독립 시험 호스팅 및 네트워크 검사 |

모든 증빙에는 **동일 40자 후보 커밋 SHA, 해당 검증 출처, 통과 상태, 검증 시각**이 필요하며 2시간 이상 오래되거나 미래 시각이면 불인정한다.

**중요:** 이 구조는 증빙을 검사하는 정책 함수이지 증빙 발급 시스템이 아니다. 현재 그 8개 항목을 확정하는 신뢰할 수 있는 서버 기록/서명 증빙 수집이 완성되지 않았으므로, 브라우저의 `passed:true`, 임의 JSON 문서, 일반 PR의 녹색 CI, 테스트 대상이 다른 시험 웹의 HTTP 200을 승인 증빙으로 사용하지 않는다.

## 11단계 실태 확인과 12단계 결론

- GitHub `main`은 11단계 기준점 이후에도 다른 개발 채팅의 변경으로 이동하고 있다. **최신 `main` 기준 재통합 검사가 필요하다.**
- 시험 Supabase 업무 스키마와 실제 릴리스 Edge API·Auth·RLS 검증은 아직 없다.
- 현재 운영 릴리스 데이터에는 `stage_rollback` 대기 작업이 있고 복원 대상 `to_sha=null` 상태를 읽기 전용으로 확인했다.
- 운영 웹 및 시험 웹은 현재 별도로 고정된 기존 버전을 유지한다.
- 따라서 **신규 릴리스 버전 발급 = 0건, 출시 가능 상태 = BLOCKED**이다.

## 시험 명령

`node --test tests/release-snapshot-gate.mjs`

17개 사례에서 최신 main 이동, SHA 불일치, 각 8개 검증의 누락, 만료/미래 시각/다른 SHA, 인증·승인 누락, 중복 대기 작업과 비정상 롤백, UI·서버 차단을 검사한다.
`deno check supabase/functions/beagu-release-manager-v1/index.ts`
및 `Site release manager checks`의 기존 패키징/타입/회귀 검사도 유지한다.

## 후속 진행

13~16단계에서는 시험 웹과 실제 웹을 분리하고 후보 SHA 검증 자동화를 구현하되, 사용자 명시적 승인 전에는 배포하지 않는다.
추후 시험 DB·인증·브라우저 E2E가 진짜로 검증되고 감사 가능한 증빙을 서버에서 조회할 수 있게 되면 별도 보안 리뷰를 거쳐 비상 잠금을 해제할 수 있다.
그 전에는 **버전 생성/시험 적용/운영 승격/운영 롤백을 자동화했다거나 완료됐다고 표시하지 않는다.**
