# 남성 캐릭터 한국 드라마 실사풍 복원

기준 화면: 프롤로그 '함께할 동료'에서 서지윤·한현우·윤민서의 자연스러운 드라마풍 인물 사진이 나란히 표시되는 버전.

이전 웹툰풍 5인 합성 이미지 업데이트만 취소하고, 36화 시나리오·선택지·화면 레이아웃·여성 캐릭터·로그인·인증·다른 기능은 보존한다.

복구된 원본:
- 한현우: `assets/class-diary/characters/hyunwoo-six-expressions.webp` (3열×2행, 표정 6종)
- 이준서·최도현·장태식: `assets/class-diary/characters/male-supporting-strip.webp` (3인)
- 도윤: `assets/class-diary/characters/doyun-four-expressions.webp` (2열×2행, 표정 4종)

세 이미지의 `SPRITE` 참조 및 CSS background-size/position을 원래대로 복원했다. 웹툰 스타일시트는 HTML에서 제외했다. 기존 웹툰 파일은 자산 보존을 위해 그대로 두되 화면에서는 참조하지 않는다.

프롤로그 선택 카드의 한현우 사진은 기존 여성 실사풍 카드들과 일관되게 유지한다. API 호출이나 개인정보 저장 기능은 추가하지 않는다.
