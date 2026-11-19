# 『나의 OO한 학급일지』 실제 현장음 도입

2026-11-20. 배경음악 12곡은 유지하고, 녹음 기반 환경음 2개와 폴리 효과음 1개를 Wikimedia Commons 원본 파일에서 필요할 때만 재생한다.

## 출처 / 라이선스

| ID | 녹음 | 출처 | 규격 | 라이선스 |
|---|---|---|---|---|
| classroom | Ambient Classroom-Mono, rcrossley | https://commons.wikimedia.org/wiki/File:Ambient_classroom_mono.ogg | Ogg 65초, 약 864KiB | 제작자 퍼블릭 도메인 |
| workroom | Typing - Medium Speed, teto_yasha | https://commons.wikimedia.org/wiki/File:Typing_medium_speed.ogg | Ogg 48초, 약 759KiB | 제작자 퍼블릭 도메인 |
| pageTurn | Turning a page, planish | https://commons.wikimedia.org/wiki/File:Turning_a_page.ogg | Ogg 3.4초, 약 48KiB | 제작자 퍼블릭 도메인 |

이 소리들은 **한국 초등학교 현장에서 녹음한 것이 아니다**. 특히 교실 녹음은 해외 고등학교 컴퓨터 교실을 녹음한 것으로 명시되어 있다. 녹음에 드물게 식별 가능한 말소리가 있는지 실제 청취 검수 필요. 근거 없는 '한국 학교 실녹음' 주장은 금지.

## 재생 계약
- 교실: classroom, 연구실/교무실/회의: workroom. 복도/교문/집/카페/서점: 해당되는 음원이 없어서 환경음 없이 재생.
- 긴장 장면과 엔딩: 환경음 중단해 인물 독백과 BGM에 집중.
- 기존 BGM 버튼을 끄면 환경음도 함께 정지하며, 음악 볼륨의 27%, 최대 5.5%로 제한.
- 장면 이동에서 pageTurn은 한번 재생. 효과음 끄기와 연동. Ogg 미지원 또는 오디오 재생 실패 시 기존 합성 전환음 사용.
- 사전 로드나 사용자 데이터 전송 없음. 매 장면 필요한 파일만 Wikimedia Commons에서 스트리밍. 게임 데이터·취향·음량은 브라우저나 서버에 저장하지 않음.
- 파일에 녹음된 국가/학교 종류를 한국 학교의 실제 상태와 동일시하지 않음.

## 검증과 남은 작업
`scripts/test-class-diary-sound.cjs` 장면 매핑 및 출처, `scripts/test-class-diary-play-page.cjs` 페이지 정적 검사, `scripts/test-class-diary-browser.cjs` 시나리오/모바일 흐름을 각각 검증. 음원 청취 품질은 기기별 수동 테스트가 필요하다. 특히 원본 음성의 개인 식별 가능성, 타자음 반복 피로감, 65초 루프 이음새, iOS의 Ogg 지원 여부와 네트워크 장애 시 UX를 점검해야 한다.

상업 배포를 위해서는 음악 12곡 CC BY 4.0 표시를 그대로 유지한다.
