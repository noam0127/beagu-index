# 운영·복구 기록

기준 main: 4ffb06b26d2b2f91d927a50492925196c08a4384. 원본 Git bundle과 운영 Edge 소스는 작업공간 work/backups 및 work/beagu-before.bundle에 보존한다.

## 공개 승인
2026 코드북의 문항 대조와 학교별 통계 공개 승인은 별개이다. 현재 백분위 산식은 미확정이며 카탈로그 verified=false다. 원본 답변은 비공개 MASTER에만 적재한다. 서비스키는 브라우저·Git·로그에 기록하지 않는다. 연도별 문항을 동일 개념으로 임의 합산하지 않는다.

## 실행
`node --test tests/release-policy.test.mjs tests/auth.test.mjs`

비공개 작업자에 GOOGLE_ACCESS_TOKEN과 SUPABASE_SERVICE_ROLE_KEY를 주입한 뒤 `node admin/sync-2026.mjs`를 실행한다. 현재 Google 토큰은 단기 토큰이므로 주기 실행 전 토큰 갱신 설정이 필요하다. 자동 스케줄이 설정되었다고 간주하면 안 된다. 원본 행 번호와 응답을 보존하고 내용 SHA256으로 동일 배치를 재수입하지 않는다. 공개 승인은 수행하지 않는다.

## migration 복구
추가 테이블을 삭제하면 새 원자료가 손실될 수 있으므로 DROP SCHEMA CASCADE를 사용하지 않는다. 장애 시 동기화 작업자를 중단하고 보존된 원본 Edge를 재배포한다. 신규 카탈로그는 서비스 전용이며 기존 프런트와 직접 연결되지 않는다.

변경 전 n_valid 제약:
```sql
CHECK (((survey_year >= 2023 AND survey_year <= 2025 AND n_valid >= 1) OR (survey_year >= 2026 AND n_valid >= 2)))
```
원상복구 전 현재 n_valid=1인 2026 후보를 별도 보존하고 기존 제약과 충돌 여부를 검사해야 한다. 승인·개인정보·teacher_count 제약은 유지한다. 기존 level_data, edited_school_rows, schools와 공개 백분위 파일은 변경하지 않는다.

## 미완료 운영 작업
Edge 배포/실인증 검증, 코드 해시 변경과 세션 정리, 동기화용 비밀정보·자동 갱신·스케줄, 0904·공시지가 출처 검수, UI 실제 브라우저 QA와 PR 상태는 WORK_PROGRESS.md를 기준으로 확인한다. 로그인 제한은 DB 기반 분당 60회 전체 제한으로 IP 위조를 막지만 다수 동시 이용 시 접근 지연이 생길 수 있다.
