# 『나의 OO한 학급일지』 투명 컷아웃 V2 육안 검수

2026-11-21 · PR #156 · [GitHub Actions 실행](https://github.com/noam0127/beagu-index/actions/runs/44763347003)

## 요약

- 원본 확인: 3인×8포즈 + 서지윤 원본 1컷 = 25컷.
- V1 GrabCut은 차도겸/백태오의 상체 대부분을 오검출해서 폐기.
- V2 `isnet-general-use` 마스크는 상당히 개선됐으나, **원본 프레임 경계에서 이미 잘린 몸은 복원하지 못함**.
- 기술 검수: **사용 후보 5, 보정 필요 13, 현 상태 사용 제외 7**.
- 전 항목 사용자 시각적 최종 승인 전까지 `ready` 표시 금지; **main/운영 변경 없음**.

| 인물 | 사용 후보 | 보정 필요 | 사용 제외 |
| --- | --- | --- | --- |
| 한현우 | neutral, smile, shy, explaining, notebook | thinking (측면 프레임/의자), listening (앉은 자세·의자) | tired (책상·배경 잔존) |
| 차도겸 | 없음 | greeting, string-game, smiling, bashful | preparing, listening, thinking, demonstrating |
| 백태오 | 없음 | greeting, volleyball, explaining, clipboard, awkward, relaxed | thinking, listening |
| 서지윤 | 없음 | neutral_existing (기존 투명 마스크는 양호하나 최신 보라색 부분 염색 외형과 불일치) | 없음 |

## 핵심 문제
- 기존 `dogyeom-poses-v2.webp`와 `taeo-poses-v2.webp`는 8열×1행의 좁은 프레임. 여러 포즈는 양쪽 어깨·팔·소매가 애초에 프레임 밖에 있어 원본 픽셀이 없음.
- 실뜨기 실, 배구공 자체가 존재해도 소품을 잡는 팔이 잘렸으면 독립 게임용 투명 PNG 기준에는 미달.
- `hyunwoo/tired`, `dogyeom/preparing`, `taeo/listening` 등은 책상/다른 사람의 일부가 이미지에 남음.
- 원본 프레임의 작은 해상도(특히 8열 사진)는 1536×2048로 확대해도 네이티브 고해상도와 동일하지 않음.
- `female-jiyoon-thigh-v4.webp`는 실사용 원본이지만 부분 염색 설정은 최신 캐릭터 소개 이미지와 일치시켜야 함.

## 완료한 작업
1. 원본 Git Blob SHA 검증
2. 25컷 모델 기반 알파 이미지 및 4장 원본 시트 포함 검수 아티팩트 생성
3. 시각적 컨택트 시트에서 화면 경계와 소품 검수
4. 전환해 볼 수 있는 한현우 5컷 검수용 후보 분리

## 다음 작업
1. 한현우 5컷은 대사창과 320~1440px 화면에서 화면 잘림·배경 테두리 검증 후 인물 동일성 승인.
2. 차도겸과 백태오는 기존 사진을 얼굴 참조 기준으로 삼되 **양손과 양쪽 어깨가 프레임 안에 완전히 들어온 개별 새 원화** 제작 필요.
3. 서지윤은 기존 얼굴 참조와 보라색 부분 염색의 양립 확인.
4. 승인된 원화만 게임에 매핑하며 기존 사진 및 SVG fallback은 그대로 보존.
5. 36화 원고와 실제 감정·행동에 사용되는 포즈만 게임에 포함.

전체 이미지 아티팩트: Actions `class-diary-original-identity-cutouts-v2-DRAFT` (보관 기간 14일).
