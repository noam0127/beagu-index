# 배구지수 통합 업데이트 시스템 v2.0 — 4단계 통합 설계 및 충돌 해결 계약

작성일: 2026-11-22 (KST)  
상태: **설계 및 개발 PR 전용 / 운영 웹·운영 Supabase 변경 금지**

> 이 문서는 저장소의 실제 PR 파일 목록과 코드 변경을 비교해 작성했다. 파일 중복은 실제 3-way merge 충돌과 같지 않다. 병합 가능성을 확정하려면 후속 통합 브랜치에서 실제 merge 및 테스트가 필요하다.

## 1. 기존 구현의 우선 보존 대상

| PR | 구현된 역할 | 재사용·통합 대상 |
| --- | --- | --- |
| [#193](https://github.com/noam0127/beagu-index/pull/193) | GitHub 공개 PR 표시, `main` 커밋의 자동 작업 목록, Owner 수동 버전 생성, 불변 SHA 카탈로그, 배포 버전 드롭다운 | `admin-updates.html`, `js/beagu-admin-updates-v1.js`, `beagu-release-manager-v1`, 새 버전 카탈로그 마이그레이션 |
| [#198](https://github.com/noam0127/beagu-index/pull/198) | 운영 배포 및 운영 롤백 버튼/핸들러 차단 | #193의 새 UI에 비활성 상태 및 명시적 안내 문구 이식 |
| [#199](https://github.com/noam0127/beagu-index/pull/199) | 서버 `prod_apply/prod_rollback` 차단, worker 작업의 production claim/complete 방지, 자동 `data_refresh` 차단, 공개 디렉터리 blob 고정 | #193의 배포 API에 안전 가드 재적용; 기존 Python worker 및 테스트 보존 |
| [#195](https://github.com/noam0127/beagu-index/pull/195) | v1.1.0 Lv3 개발 및 시험 배포의 Supabase URL/key 재작성 시도 | #199의 worker와 병합; 백엔드 테스트 격리는 실제 통합 테스트 통과 전까지 미검증 취급 |

**실제 확인 기준 SHA:** `main cdc249b384095ca62df8c964c0ab9ea2c540db16`.  
정확한 PR head SHA는 [기계 판독 계약](release-v2-integration-contract-20261122.json)에 기록한다. 기준 시점 이후 변경이 있으면 병합 전에 반드시 새로 조회한다.

## 2. 충돌 매트릭스와 결정

### A. #193 × #198: 관리자 UI JavaScript
- 공통 경로: `js/beagu-admin-updates-v1.js`.
- #193이 파일 전체 수준의 UI를 재구성하므로, #198의 기존 코드 조각을 그대로 적용하는 방식은 부적절하다.
- **결정:** #193의 신규 작업함·버전 생성·드롭다운 UI를 기반으로 하고, #198의 **운영 배포 및 운영 롤백 비활성화**를 신규 `render()`, `command()` 양쪽에 이식한다.
- 서버에서 `production_release_paused`를 반환할 때 이해 가능한 사용자 안내를 제공한다.
- **완료 기준:** DevTools에서 버튼을 활성화하거나 API에 직접 요청해도 운영 배포가 진행되지 않음.

### B. #193 × #199: Release Manager Edge Function와 Node 테스트
- 공통 경로: `supabase/functions/beagu-release-manager-v1/index.ts`, `tests/site-release-center.mjs`.
- **결정:** #193의 `create_version`, SHA 카탈로그, 시험 배포된 SHA만 운영 후보로 선택하는 기능을 보존한다.
- `adminAction` 시작부에 #199의 서버 측 운영 작업 차단을 유지한다. `create_version`은 버전 등록일 뿐 운영 배포가 아니므로 차단하지 않는다.
- `worker_next`와 `worker_complete`에 #199의 운영 작업 차단을 반영하고, 자동 공개 목록 배포 경로를 별도 플래그 승인 전까지 일시 중지한다.
- 두 PR 테스트를 합치고, 선택한 버전 API라도 pause를 우회할 수 없음을 검증한다.
- **완료 기준:** Owner+AAL2 및 GitHub OIDC 토큰을 가진 정상 호출자라도 운영 변경 작업이 거부됨; 버전 생성/시험 작업은 정책상 허용.

### C. #199 × #195: Python 배포 워커 및 패키징 테스트
- 공통 경로: `scripts/release-manager/worker.py`, `tests/site-release-packaging.py`.
- **결정:** worker의 production 작업 빌드 차단과 공개 데이터 SHA 고정을 유지하면서, 시험 출력물만 별도 staging Supabase로 연결하도록 수정한다.
- #195는 HTML/JS/MJS에서 운영 프로젝트 URL을 재작성하지만 **이것만으로 기능별 간접 운영 접근이나 별도 백엔드 구성까지 검증한 것은 아니다**. 운영 API 호출·폼·Edge Function·인증·저장소·문자 발송 여부를 전수 점검하고 한 곳이라도 실제 운영 쓰기 경로가 남아 있으면 패키징 실패 처리한다.
- #199의 데이터 blob 고정은 운영 루트를 보호하기 위한 임시 정책이다. 시험 데이터 변경 기능을 검증할 때는 **시험 전용 데이터 스냅샷**을 별도로 사용해야 한다. 운영 데이터 blob을 시험판에 강제하는 정책과 충돌하지 않도록 경로를 분리한다.
- **완료 기준:** 승인되지 않은 운영 SHA/데이터 변경 없이 시험 아티팩트 생성, 운영 프로젝트 참조 차단, 실패 시 미배포.

## 3. 시스템의 한 가지 진실: release manifest

한 버전에는 최소 다음의 정보를 함께 고정한다.

- 사람에게 보이는 `version`, `title`, 자동 생성된 `summary`와 수정 항목
- 통합된 PR 번호와 각 PR의 **검증된 head SHA**, 대상 commit SHA
- 소스·데이터·SQL migration·Edge Function의 변경 내역 및 의존성
- 빌드/보안/통합 테스트의 run ID, 통과·실패 상태
- 시험 배포 대상 아티팩트 식별자(digest), 배포한 환경, 시험 통과 여부
- 생산 배포 승인자·승인 시각·최종 불변 아티팩트 SHA (운영 배포는 이후 별도 승인)

**미해결 요구:** 현재 #193은 선택 PR을 조합하지 않고 `main HEAD` 전체를 동결한다.
따라서 "세 개발 작업만 골라 하나의 버전"이라는 목표를 충족하려면, **선택된 PR을 임시 통합 브랜치로 검증한 뒤 그 결과 커밋을 릴리스 후보로 고정**하는 별도 기능이 필요하다.
커밋/PR이 아니라 ChatGPT 대화 내용만을 근거로 완료 처리해서는 안 된다.

## 4. 안전한 통합 실행 순서

1. 새로운 `integration/release-v2-*` 작업 브랜치를 현재 `main`에서 생성한다. **`main` 자체에 직접 병합하지 않는다.**
2. #193의 버전 카탈로그·작업함·새 관리자 UI를 가져오되 최신 `main`과 다른 변경사항을 보존한다.
3. #199의 서버 및 워커 차단을 API의 모든 운영 배포 경로에 적용한다. #198 UI 차단을 이식한다.
4. #195의 시험 프로젝트 연결 코드를 worker에 이식하고 충돌 난 테스트를 재작성한다.
5. Node/Python 테스트·보안 검사·버전 후보 수집·브랜치 혼입 검사 후, **실제 병합 충돌이 0**임을 확인한다.
6. 시험 Supabase 프로젝트의 스키마·함수·테스트 자료를 운영과 독립적으로 검증한다.
7. 해당 아티팩트만 시험 환경에 배포할 수 있는 구조를 만든다. `/_preview/`는 운영 GitHub Pages 루트를 함께 재배포하는 한계가 있으므로 **독립 시험 호스팅**을 우선한다.
8. 모든 PR이 Ready로 전환되기 전까지 기존 운영 Edge Function·DB·`main`·운영 웹은 변경하지 않는다.
9. 별도 명시적 사용자 승인 전에는 운영 배포·운영 Supabase 마이그레이션·운영 Edge Function 배포를 수행하지 않는다.

## 5. 단계별 통과 기준(게이트)

- **G0 자료 확인:** `main` 및 PR의 SHA가 현재 최신인지 재확인. 오래되었으면 중단.
- **G1 코드 통합:** 중복 파일 충돌을 해결하고 의도하지 않은 파일 포함 여부 확인.
- **G2 배포 안전:** 관리자 API 직접 호출·GitHub OIDC 워커·스케줄·구버전 잡·롤백·자동 데이터 갱신 차단을 모두 테스트.
- **G3 환경 격리:** 시험 웹에서 운영 Supabase Auth/DB/Functions/Storage로의 쓰기 경로 0건.
- **G4 버전 정확성:** 선택된 PR 외 변경 미포함; `expected_sha` 경합 검증; 롤백할 코드와 데이터의 범위를 명시.
- **G5 시험 품질:** 통합 CI, 브라우저 스모크, 장애 복구 검증. 실패 시 배포하지 않음.
- **G6 운영 승인:** G0~G5 통과 후 별도 사용자 승인. 이 승인 없이 운영 배포 진행 금지.

## 6. 이번 4단계 범위

- 실제 PR 내용을 비교하여 위 통합 설계와 [기계 판독 계약](release-v2-integration-contract-20261122.json) 작성.
- GitHub의 새 **설계 전용 브랜치·Draft PR**에만 커밋.
- 이 문서는 PR 병합, 스테이징 적용, 운영 웹 배포, 운영 Supabase 변경을 포함하지 않는다.

## 주의할 추가 위험

- `main`에 이미 활성화된 release controller는 5분 주기/특정 파일 push에 의해 실행된다. 개발 PR을 무심코 `main`에 병합하면 운영 작업이 작동할 수 있다.
- #193의 버전 카탈로그 테이블은 현재 운영 DB에 설치되지 않았으며, 동작시키려면 SQL/Edge Function 적용이 필요하다. 4단계에서는 적용하지 않는다.
- #195의 환경 URL 치환은 운영 데이터 접근 차단의 일부에 불과하다. 시험 Supabase 구성이 부족하면 자동 테스트가 통과하더라도 실서비스형 End-to-End 이용은 불완전할 수 있다.
- 자동 학교 목록 업데이트 정책은 일반 코드 배포와 분리해 승인·감사해야 한다.
