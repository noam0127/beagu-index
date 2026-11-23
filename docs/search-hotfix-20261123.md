# 학교검색 화면 긴급 수정 · Lv.0~2 (2026-11-23)

## 사용자 요청 / 코드 상태
- 잠긴 공시가격 미리보기의 '🔒 Lv.2 잠금 · 레벨2에 도전하세요!'를 `challenge.html`로 연결.
- 정렬 기준에 따라 카드의 첫 대표정보가 학교명 바로 다음에 표시됨. Lv.0은 공개된 학교명·주소 정렬만 가능; Lv.1은 학생수·배구지수·조회수·교사비율, Lv.2는 공시가격까지 표시.
- 데이터 없음은 '자료 없음'으로 표시. 서버 인증/권한 및 DB 정책 미수정.
- Lv.2 독립 검색 경로 `search-lv2.html`는 통합 `search-lv1.html`로 이동하므로 동일 코드를 공유.

## 충돌 예방·업데이트 관리
- 변경 대상: `js/school-search-card-v1.js`, `js/level-search.js`, `search.html`, `search-lv1.html`, `styles/school-search-card-v1.css`, `release-candidate.json`.
- 검색 결과 그리드, 집계 API, 관리자 인증 함수, 기존 Lv.3·게임 소스는 변경하지 않음.
- `release-candidate.json` 기존 요약에 이 수정 내용을 **추가**해 기존 미배포 변경사항을 누락하지 않음.
- `main` 갱신은 현재 헤드 SHA와 일치할 때만 진행(낙관적 잠금). 불일치 시 새 헤드를 검토한 뒤 재작성.
- 운영 웹 배포는 GitHub main 푸시만으로 수행되지 않음. 관리자 업데이트관리의 시험→승인→운영 워크플로를 따름.
- 회귀 테스트: `node --test tests/search-sort-primary-20261123.mjs`; Lv.0 학교명/주소, Lv.1 학생수·조회수·비율, Lv.2 공시가격·잠금 버튼, PC/모바일을 실제 웹에서 추가 확인.
