# 『난감한 스쿨밴드』 013/030 — 창작 교가와 표준 음악 이벤트·MIDI/MusicXML

**기준:** 2026-11-22 KST. 사용자 제공 `nangam-schoolband_30-step_master_prompt_v1.md`의 **013/030(원본 051~053)**에 따라, 「빛나는 우리 학교」 원본 멜로디 28음의 음높이·시작 시각·음길이·곡 박자·코드·악기별 이벤트를 재사용 가능한 버전 형식으로 만들고 **권리 범위를 확인한 입력**의 MIDI/MusicXML 파싱·변환을 검증한다.

**배포 범위:** `noam0127/beagu-index`의 `schoolband-playtest` 시험 브랜치만 수정. 운영 `main`, `baeguindex.com`, 운영 Supabase 데이터베이스·Edge Functions 또는 실제 학교 교가 자산을 수정하지 않는다.

## 1. 실제 구현한 규격

### JSON 음악 이벤트 규격 v1

`games/nangam-schoolband-v08/charts/original-anthem.music-events.v1.json`을 추가했다. 이전 009단계의 **게임용 레인 차트**와 별개인, 음악 표준 이벤트·편곡의 재현 가능한 **마스터 이벤트 데이터**다. 두 자료를 혼동하지 않는다.

- `schemaVersion:1`, `standard:"schoolband-music-events-v1"`, `arrangementVersion:"creative-anthem-events-v1.0.0"`, `songId`, 원곡 제목, 입력 출처/권리 상태.
- 기준 템포 **108 BPM**, 박자 **4/4**, **8마디**, MIDI-style PPQ(1박=480ticks), 1/16박 단위 120ticks, 총 길이 **15,360ticks=17.77777778초**. 초 단위는 변환 후에도 tick/PPQ/BPM으로 다시 계산해 drift를 방지.
- 음악 파트 5개: 멜로디 28음, 자동 드럼 64이벤트, 자동 베이스 32이벤트, 자동 기타 16이벤트, 자동 키보드 16이벤트, **총 156개**. 파트마다 `step`, `pitch`(MIDI 음높이), `duration`, `startTick`, `durationTicks`, `startSeconds`, `durationSeconds`, `velocity`를 기록한다. 간단한 신시사이저 연주의 길이/파형은 음악 악보 길이와 별도이며, 이 JSON은 녹음 WAV나 실제 교가 음원 파일이 아니다.
- 코드 진행 `C–C–G–G–Am–Am–F–C`, 각 마디의 근음 MIDI 피치·단조 여부. 마디 4·5(0부터 계산)의 Am은 C자연음을 사용하며, 곡/파트 시간축은 기존 게임 `MELODY`와 `CHORD_ROOTS`를 기준으로 생성·검증한다.
- 권리 표기: `status:"demo_original"`, `sourceId:"original-shining-our-school"`, `scopes:["convert_to_game","internal_playtest"]`, `publicRelease:false`. 프로젝트 내부에서 생성된 직접 창작 *시범 곡*이라는 표시이며, **실제 학교 교가의 권리자 허가를 확인했다는 의미가 아니다**.

### 두 가지 입력용 변환기

`scripts/schoolband-music-events-v1.cjs`에 import용 함수와 CLI를 구현했다.

**MIDI / Standard MIDI File:** `MThd/MTrk` 헤더·단일/복수 트랙, 4바이트 이하 VLQ 델타 틱, MIDI 노트 On/Off(velocity 0 해제 포함), running status, 템포 메타 `0xFF51`, 박자 `0xFF58`, MIDI 고유 PPQ를 검사하고 연주 시각·음길이를 공통 480PPQ로 변환한다. 여러 트랙의 노트를 시간순으로 합치되 종료되지 않은 노트·맞지 않는 note-off·중복 피치 온·잘못된 헤더·과도한 파일 크기 등을 거절한다.

**MusicXML:** 검증된 `fast-xml-parser` 라이브러리로 `score-partwise` / `part` / `measure` / `attributes`(divisions, beats/beat-type) / `direction/sound tempo` / `note/pitch/duration`을 파싱한다. 음이름 C..B, 반음 임시표, 옥타브를 MIDI 음높이로 변환하며 모든 마디의 실제 길이와 음표 길이가 정확한지 검사한다. **외부 DTD·ENTITY/스타일시트는 거절**하고, 자동 외부 데이터 다운로드·오디오 추출은 하지 않는다.

**안전한 v1 지원 범위:** 4/4 박자, 8마디, 일정한 BPM, 16분 그리드에 맞는 음표, 단일 성부 멜로디. 템포/박자 변화, MusicXML 복수 성부·chord·grace·tie, MIDI SMPTE 타임베이스 등은 **실수로 지원한다고 주장하지 않고** 오류 코드로 차단하며, 일반화는 014단계의 과제다.

**명령행 사용:** `node scripts/schoolband-music-events-v1.cjs --format midi|musicxml --input <승인된 파일> --rights <권리 JSON> --output <이벤트 JSON>` 형태. `rightsGate()`를 반드시 통과해야 하며, `demo_original`은 지정된 원본 시범곡 ID에서만 수락한다. 실제 곡 `approved` 상태는 출처 식별자·변환 용도 동의·허가 증빙 ID·미만료 날짜를 요구한다. **허가 증빙의 진위 자체는 이 코드가 판단할 수 없으므로** 022~023단계에 사람의 권리 확인과 등록/회수 제어를 별도로 남긴다. 변환 성공과 실제 웹 공개 승인은 **전혀 별개**다.

## 2. 자동화 검증 프로토콜

`scripts/test-schoolband-stage013.cjs`는 게임의 기존 `MELODY` 28음과 위 JSON을 직접 대조하고, 코드 진행·5개 악기의 재생 시각·음높이·길이를 확인한다. 동일한 직접 창작 선율로 시험용 `.mid`와 `.musicxml` 두 파일을 자동 생성한다. 그 파일을 **각 파서에서 재수입**, 같은 공통 MIDI 피치와 480PPQ 정규화 결과가 나오는지 대조한다. MIDI 템포의 `µs/beat` 정수 반올림 오차는 숨기지 않고 **20µs 이내**로 검증하며, 초로 변환된 타임라인이 틀어지면 실패한다.

테스트가 쓰는 MIDI와 MusicXML은 **직접 생성한 시험 파일**이다. 실제 학교나 유튜브 교가를 내려받거나 음원을 추출하지 않는다. 변환용 권리 JSON을 같이 만들며, CLI로 두 번 실제 출력 파일 `converted-midi.json`, `converted-musicxml.json`까지 생성·검증한다.

의도적으로 손상시킨 파일과 권리 상태(음악 허가 철회·만료·미기재, 부적절한 공개 허용, MIDI 미완성/잘못된 박자/헤더/NoteOff, 외부 XML ENTITY·틀린 피치·미완성 마디·지원하지 않는 복수 성부 등)는 모두 거부되어야 한다.

PC·320px 모바일 Chromium에서 기존 게임의 `getMelody()` 28음·음정·박자와 마스터 JSON이 맞는지 확인하고, 진짜 `AudioContext.currentTime`으로 자동 예약된 창작곡 멜로디의 처음 8개 이벤트의 상대 시작 시각이 JSON과 일치하는지 확인한 뒤 연주를 중단한다. 이 브라우저 검증은 스피커 청감·iOS 권한/실기 평가가 아니다.

CI `.github/workflows/schoolband-stage013.yml`에서 MIDI/MusicXML 순수+CLI 검증, Chromium 브라우저, Stage012 오디오 중단, Stage010 음색, Stage005 타이밍 경계 회귀를 실행한다. 결과 아티팩트는 `artifacts/schoolband-stage013/` 안에 내부 시범곡 MIDI/MusicXML 원본 예제와 변환 JSON·rights JSON·결과 기록을 포함한다.

## 3. 일곱 전문 역할의 독립 AI 검토

| 검토 역할 | 확인한 문제 | 개선 방향과 실제 작업 | 확인할 검증 | 남은 위험 |
|---|---|---|---|---|
| ① 리듬게임 | 곡이 달라져도 기존 108BPM 16분 step만 쓰면 시간축 오류 | 음표마다 정확한 MIDI 480PPQ 시작/길이와 16분 노트 그리드 정규화 | 28음·156개 파트 이벤트의 step/tick/seconds 일치 | 자유 템포/당김음/박자 변화는 014 |
| ② 오디오 엔진 | 밀리초 반올림을 반복하면 오디오 시계와 데이터가 드리프트 | tick을 정수로 보존하고 마지막 렌더 시 `currentTime`으로 초 변환 | 28음의 두 변환기 재구성 및 8개 실제 오디오 이벤트 차이 | MIDI µs/qn 반올림 잔차·물리 장치 지연 |
| ③ 연출·애니메이션 | 변환된 차트가 게임 표시를 임의로 바꾸면 레인과 음표 시각 불일치 | 현재 재생 게임 소스/레인 차트는 변경하지 않고 별도 이벤트 데이터로 표준화 | 현재 게임 28음과 이벤트 음높이/시간 대조 | 실제 MusicXML 동적 노트 연출은 후속 단계 |
| ④ 모바일 UI·접근성 | 파일 변환 화면이 현재 학교·악기 선택 UI를 복잡하게 만들 위험 | 관리자·제작용 오프라인 CLI로 격리, 사용자 게임 UI 무변경 | 320px Chromium 기존 자동 멜로디 재생 및 오류 0 | 모바일 실제 소리·입력 027 |
| ⑤ 학교 데이터·보안 | 권리 미확인 파일을 그대로 게시 가능한 경로에 쓰면 침해 위험 | 권리 범위 검사, 파일 크기 1MiB, DTD/ENTITY 거절, 공개/변환 권한 분리 | 거절 fixture·승인 범위·만료 등 부정 테스트 | 진짜 서명·저작권자 확인/철회는 022/023 |
| ⑥ 교가·저작권 | YouTube에서 교가를 따와 테스트하면 무단 전재가 된다 | 내부 직접 창작곡을 기준으로 시험 MIDI/MusicXML 자체 생성 | 실제 교가·오디오·영상 다운로드 0, 시범곡 원본 피치 검사 | 허락 받은 학교 교가 실증은 아직 없음 |
| ⑦ QA·배포 | 단순 파서 import 성공만으론 시간·음정 불일치를 놓침 | 단독 CLI 실행·28음 x 두 포맷 정합·손상 입력·실제 Chromium 시간축까지 검증 | 자동 CI/PASS 링크/재현 산출물/커밋 SHA | OS·실기 청음 027, 실제 학교 승인 체계 022~023 |

위 검토는 일곱 **AI 전문 역할의 독립 평가**이며 외부 인간 전문가의 실제 감수·오디오 청음 참여가 아니다.

## 4. 최종 결과

**PASS — 013/030의 구조화 이벤트 파일, 내부 창작곡 MIDI/MusicXML 파싱·변환, 시간·음높이, 권리 게이트 검증 완료.**

- **CI:** [GitHub Actions 45007172102](https://github.com/noam0127/beagu-index/actions/runs/45007172102), 상태 **completed/success**, 실제 검증 코드 커밋 **`2dcbb132f5159ea4400f467cb200866130b7d371`**. 013단계 순수 변환/CLI → PC·320px 실브라우저 Web Audio 예약 → 012·010·005단계 순수 회귀 전부 PASS.
- **원본·음악 이벤트:** `getMelody()`와 구조화 JSON의 멜로디 28개 모든 `step/pitch/duration` 일치. **156개 이벤트**(멜로디 28, 드럼 64, 베이스 32, 기타 16, 키보드 16)의 각 `startTick/durationTicks/startSeconds/durationSeconds` **312개 숫자 비교 PASS**. 8마디 진행 C–C–G–G–Am–Am–F–C, PPQ 480, 108 BPM, 전체 재생 17.77777778초.
- **MIDI/MusicXML 표준 포맷 실검사:** 내부 창작 연습곡 28음으로 MIDI binary `original-demo-28notes.mid`(293바이트)와 MusicXML `original-demo-28notes.musicxml`(3,698바이트) 생성. **각 변환기 28음×음높이·스텝·길이·ticks·velocity = 336개** 비교 PASS. MIDI의 µs/beat 정수화(555,556µs)로 인한 변환 시각 오차의 최대값 **0.00001333초 = 0.01333ms**, 허용 한계 0.02ms 이내. MusicXML 108 BPM도 원본과 일치.
- **실제 CLI 전환:** `--format midi`와 `--format musicxml`을 별도 Node 프로세스로 각각 실행해 `converted-midi.json`(6,990바이트), `converted-musicxml.json`(7,031바이트) **2개 변환 파일** 생성·재읽기 PASS. 권리 JSON을 지정하지 않거나 변환 범위 밖인 파일은 CLI에서 거부.
- **오염·무권리 입력 21종 차단:** 승인 거절·만료·증빙 없음·잘못된 원본 ID·공개 권한 오용, MIDI 헤더/SMTPE/Type2/4분의3 박자/NoteOff/Truncate/용량 초과, MusicXML 외부 ENTITY·잘못된 음이름·박자·불완전 마디·Chord·복수 성부·Tempo 변경·미완성 악보 모두 거부 PASS. 실제 권리자 서명을 검증하거나 허가받은 학교 교가를 등록했다고 주장하지 않음.
- **실제 Chromium 타이밍:** PC 1280px·모바일 320px 각각 게임의 전체 28음 MIDI 피치·시작 시각을 표준 이벤트 데이터와 대조하고, 실제 Web Audio로 자동 반주에 기록된 첫 **8개 멜로디 예약 시각**을 기준 곡 시계와 비교 PASS. 재생 중단 시 오디오 컨텍스트 해제, JS 예외 0건. 이는 실기 모바일 스피커 청감은 아님.
- **결과 아티팩트:** [GitHub Actions 아티팩트 `schoolband-stage013-music-interchange-proof`](https://github.com/noam0127/beagu-index/actions/runs/45007172102/artifacts/14748485389)를 직접 내려받아 ZIP 6개 파일(`results.json`, `original-demo-28notes.mid`, `original-demo-28notes.musicxml`, `original-demo-rights.json`, `converted-midi.json`, `converted-musicxml.json`)과 JSON `unit.passed=true`, 두 브라우저 `passed=true`, `failure` 부재를 대조했다.
- **7개 역할별 결과:** 리듬·오디오에서 tick/tempo 보존, 연출·접근성에서 기존 게임 화면 손상 방지, 학교정보 보안에서 외부 엔터티·용량·권리범위 거절, 저작권에서 실제 교가 무단 수집/편곡 배제, QA에서 실제 파일 변환/CLI/브라우저 재생 회귀가 성공. 외부 인간 전문가·학교 교가 권리자의 실제 승인 또는 사람 청음 검증은 없다.
- **단계별 한계 구분:** 013단계의 **허용된 예제**는 직접 창작한 시범곡이다. 제3자 학교 교가에 대한 `approved` 권리 게이트 코드는 형식상 구현했지만, 실제 권리 증빙의 진위 확인과 실학교 제출/공개 워크플로는 022~023단계 미완료·**BLOCKED(실자료 부재)**. 복수 박자/템포 변환 지원은 014단계, 자동 차트는 015단계 검증 예정. 운영 main/웹/Supabase는 변경하지 않았다.
