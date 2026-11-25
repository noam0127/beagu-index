# v1.11.12 승리의 순간
Base: 8bc306ae6f4633937a84af6b56f0f000c286fa02
- 공유용 결과 카드 재구성 및 PNG 디자인 개선
- 선생님배구 모바일 버튼 제거·터치 자동 공격
- 험난한 교직생활 4.0 기본 전환·모바일 세로 화면과 보스·안내 가독성 개선
- 휴가권 필요 시 표시·플레이코트 검수판 링크 제거
- 챌린지 추천 문구 정리·Lv.2 혜택 카드 및 레벨별 안내 버튼
- 기존 3.0 공식 기록 보존·4.0 개인 기록 유지
4.0 score rules differ from 3.0; the existing official history remains readable, but do not write unverified 4.0 scores to legacy API. No production DB change. Candidate requires browser regression and signed admin release.

Mobile landscape automatically expands the active standalone court; rotation back restores normal layout unless fullscreen was explicitly selected. Scores only at top; exit control at bottom right. Landscape fills both axes with mapped input; portrait maintains aspect ratio (no clipping). Historical 3.0 preservation tested against exact predecessor, 4.0 canonical tested separately.

Minimal game UI: hide old external HUD (kept for existing internal state updates), show only scores or HP within court, central temporary information, preserve school picker and controls.
