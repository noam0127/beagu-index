# 시험용 beagu-edited-api-v1 소스 복구

- 기준: 운영 Supabase에 배포된 \`beagu-edited-api-v1\` v16 소스를 **읽기 전용**으로 확인(2026-11-23). 운영 데이터·권한·설정은 복사하지 않음.
- 코드는 \`scripts/staging/recovered-beagu-edited-api-v1/index.ts\`에만 있으며 **운영 자동배포 디렉터리에 넣지 않음**.
- 운영 Supabase URL을 만나면 \`STAGING_PROJECT_ONLY\`로 거부. CORS는 로컬 시험 origin 두 개와 \`BEAGU_STAGING_ALLOWED_ORIGIN\`에 정확히 지정한 HTTPS Render 호스트 한 개만 허용.
- Lv2 토큰 원문은 DB에서 조회하지 않고 SHA-256만 비교하며 권한과 만료를 서버에서 확인.
- 학교별 **공식 검토 자료만** 조회하며, 역사적 백분위는 모든 개인정보·수동승인 플래그가 참일 때에만 표시. 합의 없이 원자료·교사별 응답·N=1 결과를 노출하지 않음.
- **아직 미배포 / HTTP·Deno 실검증 미실시**. 정적 계약 검사만 존재함.

## 배포 차단 조건

1. 시험 DB \`beagu_school_report_official_categories\` **테이블이 아직 없음**. 운영 스키마 구조만 읽기 전용으로 확인했으며 테이블 또는 행을 복사하지 않음.
2. Render 실제 주소와 \`BEAGU_STAGING_ALLOWED_ORIGIN\` 설정을 확인해야 함. 도메인 추측·와일드카드 금지.
3. 테이블 RLS, 익명 권한 차단, SQL 의존성 및 검증 테스트 통과 후에 **시험 프로젝트에만** 명시적으로 배포.
4. \`tests/staging-edited-api-contract.test.py\` 통과는 실제 브라우저·이메일·MFA·레벨 E2E 성공을 의미하지 않음.

운영 \`main\`, \`baeguindex.com\`, 운영 Supabase에 일체 쓰지 않음.
