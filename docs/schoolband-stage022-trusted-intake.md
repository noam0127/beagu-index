# 난감한 스쿨밴드 022 — 교가 이용권한 요청 없는 비공개 자료 입구

2026-11-23 · 시험 브랜치 schoolband-playtest · **IMPLEMENTED / CI PENDING**

## 사용자가 지정한 제외 범위
1. 학교 교가의 편곡·배포를 위한 저작권 허락 요청, 연락, 증빙 확보 대행을 **하지 않는다**.
2. 유료 API 도입·구독·결제는 **하지 않는다**.
3. 직접 청음, 연주감 평가, 음향 확인은 **하지 않는다**.
4. 운영 main/baeguindex.com/운영 Supabase는 **변경하지 않는다**.

따라서 학교 웹사이트에 게시된 악보·음원만으로 게임에 사용하는 것은 금지한다. 현재 실제 학교 교가 플레이 기능은 비활성화, 기존 자체 창작 연습곡은 유지한다.

## 신뢰 모델
- `games/nangam-schoolband-v08/charts/song-intake-rights.v1.json`: 저장소에서 사전에 관리하는 등록부. 초기 등록은 기존 내부 창작 원본 2곡만이며 각각 원본 파일 경로·Git blob SHA-1·내부 사용 범위와 4개 구성요소(작곡, 가사, 편곡, 녹음)의 사용 권한 상태를 기록.
- `scripts/schoolband-rights-policy-v1.cjs`: 원본 경로, digest, 학교 ID, 상태, 만료·철회, 범위, 구성요소, 사전 등록 증빙을 모두 확인하는 fail-closed 정책. 승인·만료·철회 등 외부 권리 시나리오는 **합성 테스트 데이터**로만 검증한다. 실제 외부 교가의 증빙을 수집·요청하지 않는다.
- `scripts/schoolband-stage022-intake.cjs`: 정해진 저장소 경로의 실제 파일을 읽고 git blob 해시를 계산한다. 원본과 등록부가 맞을 때만 사설 변환 후보로 넘긴다. `events_json` 형식은 유효 JSON을 검사하고, `midi`, `musicxml`, `score_pdf`는 확장자와 헤더를 검사하되 후속 변환기 마련 전까지 격리 상태로 둔다.
- 이전 `scripts/schoolband-rock-arranger-v1.cjs`, `scripts/schoolband-music-events-v1.cjs`의 **자기신고형 approved 경로를 차단**했다. 이 도구들은 기존 내부 원본만 지원하며, 외부 학교 교가가 사칭한 permissionRecordId만으로 통과하지 못한다.
- `--generate-private`는 기존 내부 창작곡의 4악기×5난이도 데이터 처리만 메모리에서 수행하며 게임 공개·파일 배포·음향 재생을 수행하지 않는다.

## 로컬 테스트 명령
```bash
node scripts/test-schoolband-stage022.cjs
node scripts/schoolband-stage022-intake.cjs --song original-shining-our-school
node scripts/schoolband-stage022-intake.cjs --song original-meter-shift-exercise-014
node scripts/schoolband-stage022-intake.cjs --song original-shining-our-school --generate-private
```
유료 의존성이나 API 키는 없다. GitHub Actions 설정: `.github/workflows/schoolband-stage022.yml`.

## 실제 검증 상태
- 연결 도구 내에서 등록부와 실 정책 함수를 로드하여 **18개 권리 상태·해시/ID·범위·철회·만료 등 단언 통과**. Node 정책·인입 CLI·테스트 파일 구문 파싱 확인.
- Node의 파일 해시·비공개 차트 생성·신규 GitHub Actions CI 실제 실행 성공은 **확인 대기**, 아직 PASS라 기록하지 않는다.
- 실제 공개/비공개 학교 설문 DB를 수정하거나 확인할 필요가 없다.

## 7개 AI 전문가 검토
1. 리듬게임: 곡 선택 버튼과 출처 권리 검증을 분리, 승인 교가가 없으면 창작곡 경로 유지.
2. 음향: 음향 점검 요청을 수행하지 않고 악보 데이터 형식/변환 게이트만 적용.
3. 연출: 사용자가 해야 할 저작권 요청을 생성하지 않고 상태를 '교가 미등록'으로 표시.
4. 데이터: source ID·school ID·파일 해시 매칭, 관리 기록 없는 자료 차단.
5. UX/접근성: 기존 곡 선택 버튼 잠금 및 대체 곡 보존.
6. 보안/저작권: 사용자 스스로 기입한 승인 플래그는 신뢰하지 않음; 철회·만료·공개 금지 적용.
7. QA/운영: 실제 청음 없이 코드 검사만 하고 CI 결과 미확인 표시, 운영 변경 금지.

## 023 연계
다음 단계는 **기존 자체 창작곡을 오프라인 MIDI/차트 변환 구조에 연결하고, 실제 학교 교가의 무단 공개를 막는 기술 검사**가 중심이다. 외부 교가의 허락을 구하거나 음향을 평가하지 않는다. 이는 '모든 학교의 교가를 플레이한다'는 보장이 아니다.
