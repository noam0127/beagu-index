# 회원관리 v2 통합 검증 실행 절차

## 실행 대상
- 기준: `integration/admin-v2-current-main-20261122`
- 본 브랜치는 시험 전용 점검 문서/스크립트만 추가하며 운영 배포·DB 변경·PR 병합을 하지 않는다.

## 1. 자동 검사 (로컬 또는 격리된 CI에서 실행)
```bash
node tests/admin-member-challenge-level-matrix.test.cjs
node tests/admin-member-scale-10001.test.cjs
node tests/admin-member-statistics-static.cjs
node tests/admin-member-security-audit-static.cjs
node tests/admin-member-ux-clarity-static.cjs
node tests/admin-member-directory-validation-static.cjs
node tests/admin-member-pagination-regression.cjs
node tests/admin-member-challenge-static.cjs
node tests/admin-member-challenge-ui-static.cjs
node tests/admin-member-db-pagination-static.cjs
node tests/admin-member-directory-filters-static.cjs
node tests/admin-member-integrated-privacy-static.cjs
```
모든 검사에 대해 실행 환경, 종료 코드, 로그, 커밋 SHA를 남긴다. 정적 검사 통과는 DB·브라우저·MFA E2E 검증의 대체가 아니다.

## 2. 스테이징 배포 담당자에게 전달할 검증 항목
1. 격리된 시험 Supabase에 마이그레이션 순서대로 적용 후 SQL RPC 응답 필드 확인
2. 관리자 계정의 AAL2 MFA·활성 세션 통과, 일반 계정 및 AAL1 거부
3. 회원 0명, 1명, 4,001명, 10,001명 페이지 이동·정렬·검색 테스트
4. 회원 목록과 상세에서 이메일 원문, 휴대폰, 참여코드, 방문자 ID 노출 여부 확인
5. Lv1과 Lv2 추천 자격 및 Lv3 회원 계정 상태를 혼동하지 않는지 확인
6. Auth 계정, 챌린지 코드, 추천 프로필 집계 단위와 실제 SQL 결과 대조
7. Owner만 회원 정지/복구 가능, 관리자 및 자기 계정 조치 거부
8. 감사 로그 기록 실패 시 화면 경고와 운영자 조정 절차 확인
9. 스테이징 URL 직접 열기, 콘솔·네트워크 오류 및 모바일 화면 확인
10. 운영 웹·운영 DB 무변경 확인

## 검증 상태
- GitHub 통합 브랜치 생성 및 main 대비 ahead/behind 비교: 완료 (20/0, 확인 당시)
- 코드 파일 및 테스트 파일 존재 확인: 완료
- 로컬 Node 테스트 실행: 미실행 (작업 환경에서 GitHub clone DNS 실패)
- CI 통과: 미확인
- 시험 웹 배포 및 직접 확인: 미실행
- 운영 DB 쓰기 및 운영 배포: 수행하지 않음

**배포 담당 채팅에서 시험 웹 배포 및 실제 E2E 검증을 수행한 뒤, 실행 로그와 시험 URL을 이 PR에 연결해야 한다.**
