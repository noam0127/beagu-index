# 배구지수 통합 업데이트 시스템 v2.0 · 3단계 안전장치

2026-11-22 · 개발 브랜치 전용 · **운영 사이트/운영 Supabase 미배포**

## 목적

사용자가 명시적으로 운영 배포를 승인하기 전에는 운영 웹 코드와 공개 학교 목록 데이터가
관리자 API, 기존 대기 작업, GitHub Actions 스케줄, 시험판 빌드에 의해 변경되지 않도록
fail-closed 안전장치를 준비한다.

## 서버·워커 경계

1. `beagu-release-manager-v1`의 `PRODUCTION_RELEASES_PAUSED=true`는 브라우저나
   비밀번호/환경 변수로 해제할 수 없는 정적 코드 안전장치이다.
   - Owner+AAL2라도 `prod_apply` / `prod_rollback`은 HTTP 423으로 거부한다.
   - `worker_next`는 기존 운영 배포 대기 작업을 claim하지 않는다.
   - 기존 운영 배포 `worker_complete`도 거부한다.
   - 무인 `bootstrap` / `data_refresh` 신규 등록을 차단한다.
2. 시험 배포 `stage_apply` / `stage_rollback` 승인 경로는 유지한다.
3. GitHub Actions `worker.py`는 `target=staging`이고 작업이 시험 적용/복원일 때만
   빌드를 허용한다. 예전 `.release-job.json`을 재사용해 운영판을 출판하는 일을 막는다.
4. 시험 웹을 재게시할 때 함께 묶이는 GitHub Pages 루트는 **이미 발행된 운영 SHA**를
   사용한다. 공개 학교 목록 JSON은 `HEAD`의 최신 파일 대신
   `beagu_site_release_state_v1.public_data_blob_sha`에서 고정된 Git blob을 복원한다.
   해당 SHA가 없으면 과거 운영 SHA에 포함된 원본 파일을 그대로 쓴다.
5. GitHub OIDC 토큰은 이미 저장소·`main`·워크플로와 발급자/청중을 검증한다.
   이 검사를 유지하며, 권한 검증은 브라우저 버튼의 `disabled` 상태에 의존하지 않는다.

## 검증

- `node --test tests/site-release-center.mjs`
- `python3 tests/site-release-packaging.py`
- `node --check js/beagu-admin-updates-v1.js`
- `python3 -m py_compile scripts/release-manager/worker.py`

패키징 테스트는 운영 작업 빌드 거부, 시험 작업 성공, 승인된 데이터 blob 재현,
위조된 blob 식별자 거부를 검사한다. 검사 코드는 PR의 GitHub Actions로 실행한다.

## 출판 금지 및 한계

- 이 단계의 결과는 **PR 코드**이며, 운영 Edge Function·DB·GitHub Pages에 적용하지 않는다.
- 운영 배포 재개는 별도의 사용자 승인, 서버 차단 해제 PR 리뷰, 운영/시험 분리,
  성공한 테스트 기록을 거쳐야 한다.
- 동일 GitHub Pages 도메인 `/_preview/`는 여전히 운영 루트를 함께 게시한다.
  운영 bytes 동일성을 강제하려면 고정 빌드 아티팩트 및 독립된 시험 호스팅이 필요하다.
- 운영 Supabase와 시험 Supabase 연결 분리는 별도 단계에서 해결한다.
- PR #193(자동 버전 목록)과 PR #198(관리자 버튼 차단)은 동일 영역을 수정하므로
  향후 통합 단계에서 충돌을 해결한다.
