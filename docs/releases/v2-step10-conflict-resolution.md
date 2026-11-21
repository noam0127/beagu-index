# 배구지수 통합 업데이트 시스템 v2.0 — 10단계 코드 충돌 조정

2026-11-22 · **독립 통합 브랜치 전용. 운영 웹/시험 웹/운영 Supabase 배포·변경 없음.**

## 기준

- 9단계 독립 통합 PR: #216
- 9단계 기존 통합 내용: #193 → #201 → #205 → #208 → #211
- 10단계 조정 대상: **#198 (관리자 UI), #199 (운영 배포 보안), #195 (시험 DB 격리)**
- 통합 방식: 겹치는 파일의 개별 수정 의도를 검토하여 소스 수준으로 조정.
- **주의:** 충돌을 실제 Git 명령으로 자동 해결했다고 주장하지 않는다. 아래 파일은 사용자 요청에 따라 서로 다른 PR의 변경 의도를 함께 반영한 수동 통합 코드이다.

## 충돌 해결 내역

| 겹치는 파일 | 서로 다른 변경 의도 | 10단계 통합 결과 |
|---|---|---|
| `js/beagu-admin-updates-v1.js` (#193 ↔ #198) | 불변 버전 드롭다운·개발 작업함 ↔ 운영 적용·롤백 중지 | 기존 버전 선택 UX를 유지하면서 prod_apply/prod_rollback 버튼 및 명령을 이중 차단 |
| `supabase/functions/beagu-release-manager-v1/index.ts` (#193 ↔ #199) | GitHub PR 수집·버전 카탈로그 ↔ 관리자·워크플로 서버의 운영 배포 금지 | Owner+AAL2/status API 유지, 운영 명령 HTTP 423, worker OIDC 경로의 운영 작업 claim/complete 차단 |
| `scripts/release-manager/worker.py` (#199 ↔ #195) | 승인된 공개 데이터 blob 고정·운영 작업 빌드 금지 ↔ 시험 Supabase 프로젝트 참조 치환 | staging 허용 빌드에 한해 고정 데이터 복원 및 preview JS/HTML Supabase URL·공개키 치환 |
| `tests/site-release-packaging.py` (#199 ↔ #195) | 운영 빌드 차단·데이터 blob 검증 ↔ 시험 환경 격리 검증 | 둘을 한 패키징 테스트로 결합하고 null staging rollback 검사 추가 |

## 이전 시험판 롤백 오류에 대한 방어

실제 첫 시험 적용 이력이 `from_sha=null`인 경우에도 예전 릴리스 API는
`stage_rollback` 작업을 대기열에 기록했다. 이 경우 재배포 산출물에서
`/_preview/`가 사라질 수 있다.

- 브라우저: 대상 `from_sha`가 40자 유효 SHA가 아니면 롤백 버튼을 비활성화
- 관리자 Edge API: 유효한 SHA가 없으면 `no_staging_rollback`로 요청 거절
- GitHub OIDC 워커: 대기 중인 `stage_rollback`이 null SHA면 **failed**로 표시하고 게시하지 않음
- Python 패키징: `staging_sha`가 유효하지 않으면 출력 아티팩트를 변경하기 전에 거절

**이 코드는 개발 PR에만 있으므로, 실제 운영 DB에 남은 대기 작업은 이 단계에서 수정하거나 취소하지 않았다.**

## 아직 남은 위험

1. **운영/시험 웹은 GitHub Pages 하나의 아티팩트**에 함께 들어간다. staging 작업은 운영 루트 파일을 같은 SHA로 다시 포장할 수 있다. 파일을 고정하는 것과 인프라 수준 분리는 다르다.
2. 시험 Supabase 프로젝트의 실제 DB 스키마·RLS·Edge Function 준비 여부는 이 코드 변경으로 해결되지 않는다.
3. 프론트·서버의 인증 경로가 시험 프로젝트에서 실동작하는지 E2E 검증하지 않았다.
4. 문자열 치환은 preview 내 하드코딩된 URL/공개키에 대해서만 작동한다. 빌드 후 남은 직접 참조는 검사하지만 동적 조합·외부 API 요청 등은 별도의 브라우저 네트워크 검증이 필요하다.
5. 운영 릴리스 API의 코드는 운영에 배포되지 않았고, `main`도 병합하지 않았다. 따라서 현재 운영 환경에서는 이 보안 안전장치가 활성화되었다고 주장할 수 없다.
6. GitHub PR #195의 `v1.1.0` 전체 기능 구현을 통합한 것은 아니다. 이 PR에서 충돌한 **시험 환경 격리 코드·HTTP 진단 도구**를 통합한 것이다.

## 검사

- `node --test tests/site-release-center.mjs`: 기존 인증·버전 관리 회귀
- `node --test tests/release-step9-merge-tree.mjs`: 9단계 원본 코드 보존
- `node --test tests/release-step10-security-invariants.mjs`: 통합된 UI/API/워커 잠금 검사
- `python3 tests/site-release-packaging.py`: 운영 빌드 차단, staging 치환, pinned data, null SHA 롤백 거절
- `python3 -m py_compile scripts/release-manager/worker.py tests/staging-http-smoke.py`
- 별도 GitHub Actions `Site release manager checks` 및 텔레메트리 CI 결과 확인

## 다음 11단계

- 검증된 비운영 환경에서 DB 마이그레이션/RLS와 Edge Function 인증 실제 테스트
- 배포 승인 워크플로와 preview root 재패키징의 위험 분석
- 스테이징 브라우저 네트워크 요청 및 기능 E2E 점검
- CI 통과 후에도 운영 출시 승격은 관리자 별도 명시적 승인 필요
