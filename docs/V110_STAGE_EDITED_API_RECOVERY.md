# 시험용 beagu-edited-api-v1 소스 복구 및 검증

2026-11-23 (KST). **운영 환경은 변경하지 않았습니다.**

## 실제 수행 및 검증 완료

- 운영 Supabase `beagu-edited-api-v1` v16 **코드만 읽기 전용 조회**하여 계약을 확인. 운영 정보·원자료·비밀 키를 복제하지 않음.
- 운영 자동 배포 디렉터리가 아닌 `scripts/staging/recovered-beagu-edited-api-v1/index.ts`에 **시험 전용 복구 소스** 추가.
- 시험 Supabase `ycwuugggqbunlbwuzvbx`에만 `beagu-edited-api-v1` **v1 ACTIVE 배포** 확인. 운영 Supabase의 동일 함수는 여전히 v16.
- 운영 Supabase URL에서 실행하면 `STAGING_PROJECT_ONLY` 응답. 로컬 origin 또는 정확히 지정된 Render origin만 허용하고 운영 origin은 CORS 거부. Render origin은 아직 미설정이므로 **실제 Render 방문 테스트는 못 함**.
- 시험 DB에 `beagu_school_report_official_categories` **빈 테이블 생성**. 10개 칼럼, RLS 활성, `anon`/`authenticated` SELECT 권한 없음, 행 0 확인. 운영 DB에서 단 1건의 행도 복사하지 않음.
- Lv2 세션 SHA-256 조회·만료 확인 및 공식 승인 사실만 반환; 과거 백분위는 추가 개인정보 보호·수동 승인 플래그 전부 요구.
- [실제 GitHub Actions #45085336841](https://github.com/noam0127/beagu-index/actions/runs/45085336841): 소스 정적 보안 계약 PASS.
- [실제 GitHub Actions #45085533181](https://github.com/noam0127/beagu-index/actions/runs/45085533181): **시험 서버 실제 HTTP 부정 검사 PASS**. 로컬 CORS preflight 204, 운영 출처 CORS 403, 무인증 POST 401, GET 405, Origin 없는 POST 403.

## 확인된 미완료

1. 이 API의 **정상 Lv2 세션·학교 공식 정보 양성 HTTP 검증**, 브라우저·Render 호스팅 테스트는 미실행.
2. 시험 DB의 분류 테이블은 아직 **비어 있음**. 운영의 실자료를 이관해서 검증하지 않음.
3. 시험 웹 호출 16개 중 아직 **3개 API가 미배포**. 각 SQL·비밀 설정·비용·개인정보 보안 검증이 선행되어야 함.
4. 실제 이메일 수신 링크 확인→추천·코드→Lv3, 관리자 MFA, 시험 실제 배포/복구, PC/모바일 전체 E2E 미완료.
5. 엄격 E2E / 운영 출시는 **NO-GO**. 운영 GitHub `main` / 운영 DB / 운영 웹 / 운영 설문은 계속 변경 금지.

검증할 코드: `tests/staging-edited-api-contract.test.py`, `tests/staging-edited-api-http-negative.test.py`, `scripts/staging/schema-edited-categories-qa-only.sql`.
