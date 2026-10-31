# 배구지수 데이터 정리 감사기록 (2026-10-31)

## 이관·교정 완료
- 2023년 편집본 수치형 31,424셀 / 2,807개교(학교와 연결된 원본 2,828행).
- 2024년 편집본 수치형 181,513셀 / 3,284개교(학교와 연결된 원본 3,284행).
- 2024년 비율형 7개 열(V,W,X,AT,AU,AV,BH) 22,988셀은 원본 셀의 실제 소수 숫자로 재교정. `percent_unit_normalized=true` 22,988건, 미완료 0건.
- 2025년 상세 수치형 원본과 이관 개수 일치: 96,959셀.
- 2025년 공개 백분위 1,294개교: 8개 영역 평균값을 1,458개교 안에서 경험적 백분위로 재산출. 이전 평균은 `legacy_2025_eight_domain_mean`에 보존.
- 2023/2024 수치 이관 테이블: `beagu_private.beagu_legacy_sheet_numeric`.
- 2025 수치 이관 테이블: `beagu_private.beagu_edited_numeric_staging`.

## 품질관리 대기
- 학교 미연결: 2023년 3행, 2024년 7행, 2025년 4행.
- 학교-연도 중복 원본 그룹: 2023년 21, 2025년 3.
- 38개 품질 예외는 `beagu_private.beagu_edited_quality_issues`에 NEEDS_REVIEW로 보존.
- 2024년 비수치형 선택지와 기타 공개 미검수 설문지표는 자동 공개 대상이 아님.

## 2026년 본조사
- 구글 응답 시트: `1T_rEz1LqX97pC9gOv33SRmspK2IizTU3wFtxA8P1pC4`.
- 비공개 집계 MASTER: `1I9SXXmOCnyeWP3RjoBHW5Tfvg0RpgR4RjnEVoxZvpp8`.
- 10월 30일의 사전 제출 1건은 MASTER에서 PRELAUNCH_EXCLUDED로 표시.
- `scripts/beagu-2026-noon-sync.gs`는 2026-11-01 이전 응답 제외 및 재외한국학교 지역을 처리하도록 보완.
- Google Apps Script 수동 실행 승인과 정오 트리거 설치는 **미확인**. GitHub 코드 배포가 Google 트리거 설치를 뜻하지 않음.
- 비공개 MASTER에서 Supabase 승인자료로의 자동 제출 또한 미구현. 검수·승인 전 2026 공개 백분위 0건.
- 모든 연도 자유서술·주관식 답변은 공개 대상에서 제외. 2026 Q51 공개 금지.

## 다음 순서
1. Apps Script 소유자 권한 설치 및 본조사 응답으로 실제 정오 동기화 성공 확인.
2. 본조사 데이터의 학교 식별·중복 응답·소표본·재식별 위험 심사.
3. 비수치형 객관식 선택지 사전 정리, 검증된 항목만 승인 API로 옮기기.
4. 중복 학교-연도 24그룹과 미연결 14행을 수동 대조 후 확정.
