# 배구지수 통합 업데이트 시스템 v2.0 — 5단계: GitHub 개발 작업 자동 수집

2026-11-22 · 운영 웹·운영 DB·Edge Function 무변경 · PR #193 위에 쌓은 개발 브랜치

## 구현 범위

기존 PR #193의 관리자 개발 작업함을 재사용하고 다음 사항을 강화한다.

1. `beagu-release-manager-v1`의 Owner+AAL2 `status(check_latest=true)`에서 GitHub PR 목록을 **읽기 전용**으로 가져온다.
2. GitHub REST `/pulls?state=all&sort=updated&direction=desc&per_page=100&page=N` 경로를 최대 3페이지 조회한다.
3. 저장소 URL과 숫자 PR 번호, 40자리 head SHA를 확인하고 중복 PR을 제거한다.
4. 상태를 `draft`(개발 중), `review`(병합 대기), `merged_to_main`(main 병합), `merged_other_base`(다른 브랜치 병합), `closed_unmerged`(미병합 종료)로 구분한다.
5. 관리자 화면에 열린 PR과 최근 main 병합 PR을 별도로 표시한다. **병합 성공은 버전 생성이나 시험·운영 배포 성공과 다르다.**
6. GitHub 페이지 조회 실패는 `error/partial` 및 `reason`으로 반환해 누락된 작업을 0건이라고 오인하지 않도록 한다.
7. 새 커밋 비교가 실패해도 PR 목록 조회 결과를 유지하며, 커밋 분석 오류를 별도로 반환한다.
8. 기존 Owner 인증과 GitHub 변경사항의 수동 불변 버전 생성·배포 구조는 유지한다. 이 단계는 변경된 PR 목록을 DB에 영구 보관하지 않으며 **시스템 상태를 실시간으로 조회**한다.

## 테스트

`node --test tests/release-github-work-inbox.mjs` 또는 기존 `site-release-center.mjs`에서 신규 테스트 포함.

검증 대상: PR 종류 판별, 다른 base 브랜치 병합 구분, 위조 URL/SHA 필터, 페이지네이션, 중복 제거, 최초 API 실패 및 중간 페이지 실패, 조회 상한 초과(부분 결과), 서버·UI 배선.

## 아직 구현하지 않은 사항

- 6단계: 작업 진척도의 '기획/개발/검증/병합/버전 포함/시험 적용' 상태 구분
- 7단계: 파일 변경·검증 증빙·설명 집계 및 요약의 자동 생성
- 8단계: 관리자가 실제로 선택하고 검색할 수 있는 개발 작업함 고도화
- 9~12단계: 원하는 PR만 선택해 통합한 뒤 **해당 커밋 SHA**를 불변 버전으로 만드는 기능
- 14~16·18단계: 시험 웹 적용/되돌리기 버튼을 누르면 진행 단계와 실패 원인을 실제 상태 기준으로 보여주는 **가로 에너지 진행 막대기**, 최종 성공 시 '적용 완료'
- 16단계: 첫 시험 배포처럼 `from_sha=null`인 이력은 '전 버전으로 되돌리기'를 비활성화하고 '시험 웹 배포 해제'로 별도 취급
- 18단계: 요청별 진행률은 임의 시간 퍼센트가 아닌 `queued → running → deployed / failed`로 표시하고 GitHub Actions job/step 정보는 접근·증빙이 있을 때만 보강

## 운영 제약

- 이 PR은 #193에 기반한 **stacked Draft PR**이다. #193와 동시 작업 중인 #198/#199/#195/#200을 병합했다고 주장하지 않는다.
- 현재 운영 Supabase에는 #193의 `beagu_site_release_versions_v1` 카탈로그가 아직 없어 이 기능을 운영 페이지에 즉시 활성화할 수 없다.
- 운영 웹 `baeguindex.com`, 시험 웹 `/_preview/`, 운영 Supabase는 이 단계에서 변경하지 않는다.
- 조회 실패 시 결과가 일부 또는 전부 누락될 수 있고, 가장 최근 300개 PR까지만 조회할 수 있다. 상태 화면에 해당 사실을 드러낸다.
