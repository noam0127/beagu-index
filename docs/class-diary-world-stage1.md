# 『나의 OO한 학급일지』 1단계 — 학교 세계 생성기 (2026-11-19)

## 실제 생성·배포한 자산
- js/class-diary-world-v1.js — 승인된 학교 데이터 정규화, 자료 충돌·결측 감사, 지리 태그와 장면 입력 조건 생성
- supabase/functions/class-diary-world-v1/index.ts — 신규 읽기 전용 레벨2 승인 학교자료 API
- teacher-class-diary.html — 학교 검색 및 세계 설정 확인용 개발 미리보기 (7일 시나리오 미구현)
- scripts/test-class-diary-world.cjs — 회귀 검사
- Supabase Edge Function class-diary-world-v1 v2 ACTIVE
- **기존 두 게임·기존 Edge Function·DB 스키마·트리거·설문 집계는 변경하지 않음**

## 운영 환경 재확인
- GitHub: noam0127/beagu-index (main)
- Supabase: snvzwrexuqavnfvzgxqj (PostgreSQL 17.6, Seoul)
- public.schools: 학교 레코드 6,369건, 운영 중인 초등학교 6,334건, 전체 주소 존재 6,364건, 운영 초등학교 주소 존재 6,329건
- 학교 식별: school_id, school_code, school_name, sido, sido_standard, education_office, education_office_code, support_office, address, establishment, school_kind, status, homepage, source, last_synced_at, updated_at
- 학교 지표는 public.schools의 직접 열이 아니라 검토된 공식 수치·범주형 테이블에 분리 저장됨

## 공식 수치 (public.beagu_school_report_official_facts)
| fact_key | 의미 | 학교 수 | 원천 기준연도 |
|---|---|---:|---|
| admin_employees | 행정직원 수 | 3283 | 2024 |
| cafeterias | 학생식당 수 | 1201 | 2024 |
| classes | 학급 수 | 3284 | 2024 |
| classrooms | 일반교실 수 | 1435 | 2024 |
| district_housing_price_mean | 행정구역 공동주택 평균 공시가격 (원) | 1303 | 2025 |
| gym_spaces | 체육집회공간 수 | 1363 | 2024 |
| junior_teacher_ratio | 2급 정교사 비율 (%) | 1441 | 2024 |
| land_area | 교사대지 면적 | 1438 | 2024 |
| lead_teachers | 수석교사 수 | 1438 | 2024 |
| male_teacher_ratio | 남교사 비율 (%) | 1441 | 2024 |
| playground_area | 운동장 면적 | 1438 | 2024 |
| school_employees | 공무직원 수 | 3283 | 2024 |
| september_participation_rate | 2023년 9·4 참여율 (%) | 877 | 2023 |
| students | 학생 수 | 3350 | 2024 |
| students_per_class | 학급당 학생 수 | 3284 | 2024 |
| teacher_support_spaces | 교원지원공간 수 | 1356 | 2024 |
| teachers | 교원 수 | 3350 | 2024 |
| vice_principals | 교감 수 | 1438 | 2024 |

## 공식 범주형 (public.beagu_school_report_official_categories)
establishment_type (설립구분, 4476행), meal_place (급식장소, 4717행), milk_lunch (우유급식, 2047행). 기준은 2024년이며 2024·2025 조사 영역에 중복 저장된 학교가 존재함.

## 연도별 활용 가능성
public.beagu_school_report_yearly 중 PUBLISHED + privacy_reviewed=true + 유효 백분위:
2023년 2595교, 2024년 2994교, 2025년 1294교 (학교 중복 있음).
public.beagu_2026_results_snapshot 10건은 모두 WITHHELD(9건 정확 매칭, 1건 재검토) — **게임 입력에서 제외**. 2026년에는 명시적 승인 확인을 추가 요구.

문항 자료원: public.beagu_school_question_aggregates_v2, public.beagu_school_question_modes_supplement_v1, public.beagu_school_checkbox_choices_v1, public.beagu_verified_school_question_distributions_v1, public.beagu_release_metrics_v2. 2026 학교 MBTI Q14–Q17은 기존 beagu-school-culture-v1의 승인 결과를 사용해야 함.
원전 경로: data/public-statistics-question-catalog-v1.json, js/2026-questionnaire-options-v1.2.js, js/school-mbti-v1.js, lv2-edited-column-schema.json.
이들 문항 자료와 MBTI는 2단계 이후 연결하며, 1단계에서는 조사 원문이나 비공개 분포를 브라우저에 내려주지 않음.

## 품질·공개 검증에서 드러난 예외
- 학생수·교원수 각각 1,116개교에서 동일 학교/키/기준연도의 중복 기록. 각각 8개교는 값이 서로 다름. 최신행 임의 선택 금지: 충돌값은 null과 CONFLICTING_APPROVED_VALUES 경고로 처리.
- 9·4 자료는 승인된 877개 학교에 한정. 공개값으로 개인의 실제 참여 여부를 추론하지 않음.
- 2급 정교사 비율은 초보교사 비율과 동의어가 아님. 남교사 비율로 업무 편중을 단정할 수 없음.
- 공동주택 공시가격은 행정구역 평균이며 학생의 가정형편이나 토지 개별공시지가로 해석하지 않음.
- 지역 환경은 공식 주소의 읍·면·동 및 특별시·광역시 관할만 우선 분류. 산골, 섬, 갯벌, 해안, 휴전선 등 GIS가 아직 확인되지 않은 태그는 미확인으로 남김. 추가 태그는 APPROVED + official_geospatial + source_ref일 때만 수용.
- 학생수 기반 150명 이하, 151–600명, 601명 이상 분류는 **임시 게임 규칙**임.

## 데이터 계약
POST /functions/v1/class-diary-world-v1
헤더: X-Beagu-Session = 기존 레벨2 세션 토큰
본문: {"schoolId":"7자리 학교 ID"}
응답: schemaVersion, school, facts, categories, publishedYears, verifiedRegionTags

서버는 세션 SHA-256 해시, 만료일, access_level >= 2를 검증. 서비스 역할 비밀키는 서버 내부에서만 보유. 수치·범주 데이터는 APPROVED만 사용. 활용 연도는 PUBLISHED + privacy_reviewed=true이며 2026년에는 manual_release_approved=true를 추가 확인. 고유번호 원문·응답수·개별 교사 응답·사생활 자료는 반환하지 않음.

브라우저의 BeaguClassDiaryWorld.generateWorld(승인 payload) 결과:
- basic: 학교 식별·주소·규모
- numbers / categories: 지표별 수치·단위·원천 기준연도·출처 테이블·승인 상태
- geography: 승인 지리 태그 및 미확인 태그
- publishedYears / eligible: 승인 연도와 플레이 가능 여부
- storyHooks: 월~일 시나리오의 **입력 조건** (실제 소설 본문은 아님)
- issues / coverage: 누락·상충·사용 가능한 정보 범위

## 검증 (2026-11-19)
- 저장된 JS 모듈을 V8 환경에서 파싱·평가하고 테스트 원문을 실행: 데이터 품질·검수·지리·메타데이터 검사를 통과하고, 공식 지표 21개 전부에 사건 입력 조건이 연결됨.
- 운영 DB에서 서로 다른 5개교를 읽어 실데이터로 생성 테스트: PASS. 서울 동산초(중), 부산 가남초(소), 강원 간성초(중, 읍), 경남 가고파초(대), 제주 귀덕초(소, 읍). 승인된 교원비율과 9·4 값은 값이 있을 때만 조건으로 사용됨.
- Supabase Edge Function v2 ACTIVE 확인. GitHub Actions에서 실제 운영 API에 인증 없는 POST를 전송해 401 LEVEL2_REQUIRED를 확인함. **유효한 레벨2 계정의 실제 브라우저 POST 및 GitHub Pages 반영 확인은 아직 미완료**.

## 후속 과제
1. GIS 등 공식 근거를 통해 지역 복합 태그 검증·적용.
2. 학교 MBTI의 공개 승인 API 결과를 세계 데이터에 통합.
3. 연도×문항×세부 항목×보기별 공개 기준 검토 후 2단계 서사 매핑 100% 검사.
4. 실제 소설 장면·호감도·엔딩·저장·점수는 3~5단계에서 구현. 이 시점에서는 플레이 가능 게임이라고 홍보하지 않음.

## 2024년 학생수 분포 검증과 남은 공식정보
학생수의 같은 기준연도에 값이 상충하는 8개교를 제외한 3,342개교 중 150명 이하 511개교(15.3%), 151~600명 1,511개교(45.2%), 601명 이상 1,320개교(39.5%). 세 구간을 임시 규칙으로 유지하되 추후 게임 밸런스에서 조정할 수 있음.
운영 학교 명부에는 개교일, 전입·전출 추이, 지리 좌표, 지리 검증 태그의 정규화 열이 확인되지 않았으므로 현재 세계 생성기에서 해당 항목은 명시적으로 null 처리. 교육청명/교육청 코드/홈페이지/원자료 출처/동기화 시각은 v2 서버 응답과 최신 생성기 basic 객체에 포함.
GitHub Actions class-diary-world-validation.yml에서 Node 내장 assert 기반 자동 검사와 운영 API의 무인증 접근 차단 검사를 실행한다.
