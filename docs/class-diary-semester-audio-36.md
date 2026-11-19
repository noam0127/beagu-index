# 『나의 OO한 학급일지』 36화 사운드 큐시트

2026-11-20 · GitHub 기준 `js/class-diary-semester-v1.js`, `teacher-class-diary-play.html`

## 제작 원칙
- 기존 7일 체험판의 음악·효과음은 그대로 유지한다.
- 본편 36화는 **회차별 사건의 성격**으로 12개 기존 CC BY 4.0 BGM 중 하나를 배치한다. 일주일 7곡 반복은 사용하지 않는다.
- 두 현장음 원본은 Wikimedia Commons 퍼블릭 도메인 자료이다. 한국 학교의 실녹음으로 소개하지 않는다.
- 사고와 상담·갈등·오해가 이어지는 19~23화에서는 로맨틱 효과음을 금지하고, 긴장/침묵을 유지한다.
- 복도·교문·상담·주말·야간은 원본 환경음 자료와 맞지 않아 **환경음을 재생하지 않는다**. 교실과 연구실만 낮은 음량으로 환경음을 사용한다.
- 장면 도입 효과음은 1회만 재생하며, 회고 장면에는 새 효과음을 덧붙이지 않는다.
- 선택 결과(0·1·2)와 동료 경로(서지윤·한현우·윤민서)에 따라 회고곡을 일부 변경하되, **학생의 어려움을 연애 감정 보상음으로 표현하지 않는다**. 민서 경로는 우정 중심.
- 이전의 효과음 설정, 소리 끄기, 지원하지 않는 환경음 코덱의 무음 폴백, 본편 선택·진행 기록의 비저장을 유지한다.

## 회차별 큐시트
| 부 / 회차 | 제목 | 음악 ID | 배경 녹음 | 도입 소리 |
|---|---|---|---|---|
| 1부 1화 | 아직 낯선 이름 | quiet | classroom | paper |
| 1부 2화 | 복합기가 삼킨 오전 | daily | workroom | paper |
| 1부 3화 | 서아의 항의 | heartfelt | classroom | paper |
| 1부 4화 | 줄서기의 이유 | quiet | 없음 | step |
| 1부 5화 | 전원 동의 | tension | workroom | paper |
| 1부 6화 | 교문 밖 여섯 걸음 | tender | 없음 | step |
| 2부 7화 | 지우지 못한 약속 | reconcile | classroom | paper |
| 2부 8화 | 두 개의 의자 | quiet | workroom | paper |
| 2부 9화 | 다시 서는 줄 | tension | 없음 | step |
| 2부 10화 | 투표하기 전에 | heartfelt | classroom | paper |
| 2부 11화 | 복도에서 들린 울음 | tension | 없음 | door |
| 2부 12화 | 서점의 불빛 | restful | 없음 | paper |
| 3부 13화 | 겹친 기록 | tension | workroom | paper |
| 3부 14화 | 길어진 전화 | tension | 없음 | 없음 |
| 3부 15화 | 창가에 남은 아이 | heartfelt | classroom | paper |
| 3부 16화 | 운동장에 남은 한 사람 | heartfelt | 없음 | step |
| 3부 17화 | 웃지 않은 사람 | tension | workroom | paper |
| 3부 18화 | 마지막 봄날의 말 | intimate | 없음 | 없음 |
| 4부 19화 | 작은 사고, 긴 하루 | tension | 없음 | door |
| 4부 20화 | 누가 먼저 봤을까 | quiet | 없음 | 없음 |
| 4부 21화 | 서로 다른 걱정 | tension | 없음 | 없음 |
| 4부 22화 | 회의록의 한 줄 | reconcile | workroom | paper |
| 4부 23화 | 복도 끝의 말 | tension | 없음 | door |
| 4부 24화 | 우리가 지킬 수 있는 것 | reconcile | classroom | paper |
| 5부 25화 | 사과를 받지 않은 아이 | quiet | classroom | paper |
| 5부 26화 | 교실 뒤쪽의 어른들 | tension | classroom | 없음 |
| 5부 27화 | 비어 있는 옆자리 | restful | workroom | paper |
| 5부 28화 | 다른 속도의 퇴근길 | tender | 없음 | step |
| 5부 29화 | 누구의 편인가 | tension | workroom | paper |
| 5부 30화 | 다시 시작하는 연습 | reconcile | classroom | paper |
| 6부 31화 | 방학식까지 열흘 | bright | workroom | paper |
| 6부 32화 | 고쳐 쓴 약속 | reconcile | workroom | paper |
| 6부 33화 | 늦은 답장 | intimate | 없음 | 없음 |
| 6부 34화 | 조금만 더 걸을까요 | tender | 없음 | step |
| 6부 35화 | 서아와 도윤의 발표 | heartfelt | classroom | paper |
| 6부 36화 | 빈칸이 남은 학급일지 | intimate | 없음 | paper |

## 결말과 회고
- 6·12·18·28·33·34화: 성인 인물 경로와 선택에 따라 가까워지는 장면(연애) 또는 온기 있는 우정곡을 구분.
- 7·10·15·22·24·30·32·35화: 학생 자치·해결 과정은 관계 회복곡 `reconcile`을 사용하되 미완료/보류 선택에는 `quiet` 유지.
- 그 외 회고: 짧은 `quiet` 또는 `restful`, 환경음/도입 효과음 없음.
- 엔딩 5종: 기존 `ending` 곡을 유지하고 현장음 중단. 학생의 결과와 별도로 로맨틱 보상을 과장하지 않는다.

## 검증
`node scripts/test-class-diary-sound.cjs`는 36화 × 3선택 × 3인물 반응과 배경음 코드 및 사고·상담 무음 조건을 검사한다. `scripts/test-class-diary-browser.cjs`의 36화 모바일 완주, GitHub Actions `class-diary-production-smoke.yml`의 운영 파일 일치 검사로 배포 확인.
