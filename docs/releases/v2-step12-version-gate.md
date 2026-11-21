# 배구지수 통합 업데이트 시스템 v2.0 — 12단계 버전 확정 잠금

기준일: 2026-11-22 (Asia/Seoul) · **Draft 개발 코드 전용**

## 12단계 목적 및 구현 결과

여러 채팅방에서 만든 PR을 통합했더라도, 작업이 아직 `main`에 반영되지 않았거나
독립 시험 DB·RLS·Auth·브라우저 E2E·관리자 승인 증빙이 충분하지 않다면
**불변 릴리스 버전은 생성하지 않는다.**

실제 구현:

1. `release-version-gate.mjs`: 후보 PR 번호/상태, 후보 SHA와 검토된 SHA, 최신 `main` SHA,
   GitHub Actions 실행의 **정확한 head SHA**, 필수 실행명, 독립 QA 증빙을 검증하는 순수 모듈.
2. 검증 대상은 11단계 통합 후보 **PR #223**. 11단계 마지막에 검토한 `main`
   `0a16b4cc41df76d37d3f70e3f0edb909cafe8cc3`를 **검토 시점 스냅샷**으로 고정.
   새 `main` 커밋은 `main_moved_since_review`로 차단하며 몰래 새 버전에 포함하지 않는다.
3. Owner+AAL2 관리자 `status(check_latest=true)`에서 **GitHub PR 및 workflow runs를 읽기 전용으로 조회**,
   `release_version_gate`과 차단 사유를 반환한다. GitHub 실패나 실행 결과 일부만 확인되면
   `workflow_evidence_unavailable` 등으로 처리한다.
4. 서버 `RELEASE_VERSION_CREATION_PAUSED=true`를 코드에 고정해
   `create_version`, 기존 `register`, `stage_apply` **세 우회 경로**를 모두 HTTP 423으로 차단한다.
   이 검사는 Supabase 테이블 쓰기보다 먼저 수행되므로 버튼을 직접 우회해도 승인되지 않는다.
5. 관리자 페이지는 후보 SHA/최신 `main` 비교와 사유를 표시하고,
   **버전 생성 및 시험 적용 버튼을 비활성화**한다. 오류 코드는 한국어로 설명한다.
6. CI에 16개 차단 테스트, 기존 Deno 타입·릴리스·보안·패키징·HTTP 회귀 검사를 통합한다.

## 왜 지금 버전을 생성하지 않는가

- PR #223은 2026-11-22 조회 당시 **Draft·미병합**.
- 후보 PR head와 검토된 최신 `main` SHA는 서로 다르다.
- PR 단위 CI 성공은 **현재 main과 합친 새 SHA의 통합 QA** 증빙이 아니다.
- 11단계 읽기 전용 확인에서 시험 Supabase `public` 업무 테이블이 0개,
  시험 릴리스 관리자 API도 미배포다.
- 독립 시험 DB 마이그레이션·RLS, 인증된 API, 이번 후보 브라우저 E2E, 관리자
  최종 릴리스 승인은 **미검증**이다.
- 이전에 제출된 `stage_rollback` 작업에 복원 대상 SHA 없이 `queued`인 항목이
  남아 있다. **12단계에서 운영 DB를 수정하거나 그 작업을 취소하지 않았다.**

## 안전 정책

| 객체 | 12단계 처리 |
|---|---|
| 통합 후보 SHA | 관찰·비교만. 버전 카탈로그에 **미등록** |
| 사용자로부터 받은 approval/evidence | **서버에서 승인 근거로 채택하지 않음** |
| GitHub CI 성공 | 동일 SHA 검증 정보만. DB/RLS/E2E 증거로 확대 해석 금지 |
| `create_version` | 차단 · HTTP 423 |
| `register` | 차단 · HTTP 423 |
| `stage_apply` | 차단 · HTTP 423 |
| `stage_rollback` | 이전 10단계 안전 SHA 검사 유지 |
| `prod_apply`, `prod_rollback` | 이전 10단계 운영 배포 정적 잠금 유지 |

현재 `RELEASE_QA_EVIDENCE=Object.freeze({})`이므로 별도로 감사 가능한 검증 증빙
구현 전에는 어떤 UI 텍스트나 사용자 입력으로도 상태를 '통과'로 만들 수 없다.
테스트는 가상 증빙을 순수 함수를 통해 주입하여 차단 조건을 검증할 뿐,
실제 서버에서 생성·배포가 열리도록 설정하지 않았다.

## 다음 필수 선행 작업

1. 배포와 독립적인 시험 Supabase 스키마·RLS·Edge Functions를 준비하고 별도의 검증 기록을 생성한다.
2. 이번 후보를 독립 시험 호스팅에 적용하고 실제 Auth/브라우저 E2E를 실행한다.
3. 새로운 `main` 커밋이 추가되면 변경된 파일과 통합 후보를 다시 병합·시험하고,
   최신 SHA를 재고정한다.
4. 위 검증의 **서버 검증 가능한 SHA 연동 증빙**과 관리자의 최종 승인을 구현한 뒤,
   별도의 코드 변경·PR 검토를 통해 서버 안전 잠금 해제를 논의한다.
5. 검증된 후보만 불변 버전으로 확정하며, 승인 없는 시험·운영 배포는 계속 금지한다.

**12단계의 산출물은 버전 확정 기능의 검증·차단 장치이며,
실제 릴리스 버전이나 신규 배포를 생성했다는 뜻이 아니다.**
