# 2026 배구지수 학교문화 16유형 — 비공개 집계·검수 운영

## 현재 상태 (2026-10-31)

- 운영 원본: [2026 본조사 응답 Google Sheet](https://docs.google.com/spreadsheets/d/1T_rEz1LqX97pC9gOv33SRmspK2IizTU3wFtxA8P1pC4/edit)
- 기존 비공개 MASTER: [2026 학교별 통계 집계 MASTER](https://docs.google.com/spreadsheets/d/1I9SXXmOCnyeWP3RjoBHW5Tfvg0RpgR4RjnEVoxZvpp8/edit)
- MASTER에 추가된 탭: `MBTI_학교별_검수대기`, `MBTI_학교매칭_보류`, `MBTI_실행로그`, `MBTI_운영안내`.
- GitHub에 집계기 `scripts/beagu-2026-mbti-review-sync.gs` 게시됨.
- 사이트 Lv.1/Lv.2는 `js/school-mbti-v1.js`로 인증 후 `beagu-school-culture-v1` Edge Function을 조회함.
- 원본 시트에서 2026-11-01 이후 공식 응답은 아직 확인되지 않았으며, 시범 입력은 집계에서 제외.
- **GitHub 파일 게시와 Apps Script 설치는 별개의 작업. 설치형 트리거는 이 저장소에서 자동 생성되지 않음.**
- **공개 승인 전 Google Sheet의 집계 후보가 자동으로 사이트에 나타나지 않음.**

## Apps Script 최초 설치 (응답 시트 소유자 작업)

1. [원본 Google Sheets](https://docs.google.com/spreadsheets/d/1T_rEz1LqX97pC9gOv33SRmspK2IizTU3wFtxA8P1pC4/edit)에서 **확장 프로그램 → Apps Script**를 연다.
2. 기존 `Code.gs`나 트리거가 있다면 그대로 보존한다. 새로운 `MBTI_Review.gs` 스크립트 파일을 **추가**한다.
3. GitHub [집계기 원문](https://github.com/noam0127/beagu-index/blob/main/scripts/beagu-2026-mbti-review-sync.gs)을 전부 복사하여 새 스크립트 파일에 붙여넣고 저장한다.
4. 프로젝트 **설정 → 스크립트 속성**에 `SUPABASE_PUBLISHABLE_KEY`가 이미 있는지 확인한다. 없으면 웹사이트 `js/supabase-config.js`의 **공개용 publishable 키만** 등록한다. 서비스 역할 비밀키를 쓰면 안 된다.
5. 함수 목록에서 `refreshBeagu2026SchoolCulture`를 선택하여 1회 실행하고, 시트 및 URL 요청 권한을 승인한다.
6. [비공개 MASTER](https://docs.google.com/spreadsheets/d/1I9SXXmOCnyeWP3RjoBHW5Tfvg0RpgR4RjnEVoxZvpp8/edit)의 `MBTI_실행로그`에서 SUCCESS와 제외된 사전 응답 수를 확인한다. 11월 1일 전이라면 `MBTI_학교별_검수대기`가 빈 상태인 것이 정상이다.
7. `setupBeagu26SchoolCultureTrigger`를 한 번 실행한다. Apps Script **트리거** 목록에 `refreshBeagu2026SchoolCulture`가 매일 정오 부근 실행으로 표시되는지 확인한다. 실행 시간은 Google에 의해 약간 달라질 수 있다.

## 문항과 판정

- Q14 관계: A 업무적 관계 = I, B 친교 확장 = E
- Q15 의사결정: A 구성원 합의 = F, B 관리자 위임 = T
- Q16 변화 도입: A 먼저 시도 = N, B 검토 후 도입 = S
- Q17 수업 운영: A 공동 운영 = J, B 교사별 운영 = P

응답 A매우=-2, A조금=-1, 비슷=0, B조금=1, B매우=2, 판단 어려움=결측.
네 개 문항의 평균이 모두 충분히 일방향(|평균|>=0.5)이면서 각 문항 유효 응답 행수와 네 문항 완성 행수가 각각 5 이상일 때만 **유형 후보**를 계산한다. 이 5는 단순 **응답 행수**이며 **고유 교사 5명이라고 추정해서는 안 된다**.

관계·의사결정·변화·운영의 네 차원은 개인 MBTI의 심리 측정 차원과 동일하지 않다. 사이트는 반드시 학교문화 유사유형이라고 안내한다.

## 검수 및 출판 경계

**비공개 집계 성공 ≠ 공개 승인.**

1. `MBTI_학교매칭_보류`에서 지역·지원청·학교명 중복이나 불일치를 해소하고 원본이 수정되면 다시 집계한다. 동명학교를 학교명만으로 합치지 않는다.
2. 학교별 제출 반복, 동일 교사 중복, 한 개인이 차지하는 응답 비중, 소표본, 전후 시점 차분 공개에 의한 재식별 가능성을 검토한다. 응답 시트만으로 실제 고유 교사를 증명할 수 없다면 **공개하지 않는다**.
3. 각 학교의 4축 방향을 검토하고 혼합형·보류형을 16유형에 억지 배정하지 않는다.
4. 검토자가 승인한 동일 집계버전의 Q14·Q15·Q16·Q17 네 개 지표만 `beagu_release_metrics_v2`의 **Lv.1 승인 절차**를 통해 정식 공개한다. 원자료·원문 응답·표본 수 등은 외부 API로 전달하지 않는다.
5. 공개용 Edge Function은 `approval_status=APPROVED`, `privacy_status=PASSED`, 4종의 검토 플래그, 승인자/시각/근거, `n_valid>=5`, `teacher_count>=5`를 요구한다. 학교의 실제 고유 교사 수를 검증하지 못하면 `teacher_count`를 임의로 채우지 않는다.
6. 이 집계 스크립트는 Supabase 공개 테이블을 수정하지 않는다. 승인 작업은 별도이며 수행 전 관리자 검토가 필요하다.

## UI 배열에 관한 2026-10-31 별도 점검 결과

기존 Lv.0·Lv.1·Lv.2는 지역→학교명→교육지원청·주소→백분위 및 그래프→버튼이라는 기본 카드 구성을 공유한다. 다만 웹 결과의 상세보기 흐름은 통일되지 않았다.

| 항목 | Lv.0 | Lv.1 | Lv.2 |
| --- | --- | --- | --- |
| 홈페이지 링크 | 기본정보 아래 | 별도 행 | 별도 행 |
| 학교 MBTI | 미노출 | 조회 후 표시 | 조회 후 표시 |
| 상세보기 | `school-report.html`로 이동 | 카드 내부 펼치기 | 카드 내부 펼치기 |
| 상세정보 | 통합 상세페이지 | 학교·규모→MBTI→2026→과거 | MBTI→과거→2026 |

**검색결과 UI와 항목 배열은 완전히 같지 않음.** 이 파일은 점검 결과를 기록하며 현행 검색 화면을 재설계하거나 바꾸지 않는다.

## 검증

GitHub Actions `2026 School MBTI Staging Validation`에서 선택지 채점, 정규화, 문항 열, 날짜, 유형 맵핑, 비공개 경계를 검사한다. 실제 Apps Script 권한 및 설치·실행 확인은 Google Apps Script에서 별도로 검증해야 한다.
