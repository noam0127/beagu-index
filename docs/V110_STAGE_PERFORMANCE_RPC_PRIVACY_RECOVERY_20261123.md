# 배구지수 v1.1.0 — 시험 성능 계측 PRIVILEGE 경고 제거 및 Edge 전환 (2026-11-23 KST)

**운영 웹·운영 DB·GitHub main 불변.** 변경 범위: 시험 Supabase `ycwuugggqbunlbwuzvbx` 및 시험 개발 브랜치 `fix/v110-staging-edited-api-recovery-20261123`.

## 원인

- 기존 `public.beagu_perf_record_v1(uuid,text,text,integer,boolean)`은 **SECURITY DEFINER** 함수인데 `anon`, `authenticated`에 직접 EXECUTE 권한이 있어 Supabase Security Advisor가 `anon_security_definer_function_executable` / `authenticated_security_definer_function_executable` 경고를 냈다.
- 기존 브라우저 `js/beagu-page-performance-v1.js`가 `supabaseClient.rpc('beagu_perf_record_v1',...)`로 직접 호출했으므로, 실행 권한만 철회하면 실제 성능 수집이 끊어졌다.
- 운영 DB의 함수는 별도 운영 정책 범위이므로 **수정하지 않았다**. 운영 함수는 유사 경고가 있을 수 있으나 이 검증은 **시험 보안 개선**에 한정된다.

## 실제 시험 변경

1. 새 `beagu-perf-ingest-v1` 시험 Edge v1 ACTIVE 배포. `SUPABASE_URL`이 정확히 시험 프로젝트와 일치해야 하고, 허용 출처는 `localhost:8000/8123`, `127.0.0.1:8000/8123`, 별도 환경변수로 지정한 검증 가능한 하나의 Render 도메인으로 한정. 운영 출처 `https://baeguindex.com`은 거부.
2. POST 메시지는 고정 카테고리 `page`, `operation`, 1~120000 정수 `duration_ms`, 성공 여부 `ok`, 랜덤 UUIDv4 `visitor`만 허용. 검색어·URL·IP·기기 세부정보·설문 응답·사용자 메타데이터·Auth 토큰은 받지 않는다. 몸체 최대 512자, 요청 시간 제한 5초.
3. Edge가 서버 환경변수의 서비스 키로 기존 `beagu_perf_record_v1` RPC에 전달한다. 서버의 전역 시간당 10,000건 제한과 방문자/페이지/작업별 20초 중복 방지가 그대로 작동한다. **출처 헤더나 UUID는 강한 인증 수단이 아니므로 실제 서비스 노출과 트래픽 남용 방지를 별도로 검토해야 한다.**
4. 개발 브랜치 `js/beagu-page-performance-v1.js`를 직접 DB RPC → `fetch(SUPABASE_URL+'/functions/v1/beagu-perf-ingest-v1')`로 수정. **SUPABASE_URL이 정확히 시험 주소가 아니면 전송 자체를 수행하지 않는다.** 실제 Render 브라우저에서 통합 실행하기 전에 시험 웹 구성의 `SUPABASE_URL`도 시험 프로젝트로 설정되어야 한다. 운영용 `js/supabase-config.js`를 임의로 변경하지 않았다.
5. [시험 전용 DB 권한 이행](https://github.com/noam0127/beagu-index/blob/fix/v110-staging-edited-api-recovery-20261123/scripts/staging/schema-page-performance-server-only-qa.sql): `anon`/`authenticated`/`PUBLIC`의 RPC 직접 EXECUTE 철회, `service_role` EXECUTE만 부여. 테이블 RLS 유지.

## 실제 검증 증거

- [반복 실행 가능한 비기록 회귀 #45092500046](https://github.com/noam0127/beagu-index/actions/runs/45092500046) PASS: 안전한 시험 전용 전송, 원본 9개 화면 연결·행동 Node 정적/VM 검사, 실제 HTTP CORS/GET/무효 샘플/인증 토큰 차단. **DB 쓰기 없음.**
- [한 번 실행한 실제 양성 HTTP #45092587758](https://github.com/noam0127/beagu-index/actions/runs/45092587758) PASS: `index/navigation` 가상 UUIDv4 샘플 1건이 실제 시험 DB에 저장됨 (`accepted:true`), 같은 샘플 즉시 재전송은 `accepted:false`.
- 이 양성 시험은 단 1건의 가상 성능 기록, 1건의 비공개 rate 항목, 1건의 global-budget 항목 (`used=2`)을 남겼다. [안전 범위 검증 SQL](https://github.com/noam0127/beagu-index/blob/fix/v110-staging-edited-api-recovery-20261123/scripts/staging/cleanup-perf-gateway-synthetic-qa-only.sql)으로 **정확한 1건 조건을 확인한 뒤** 세 종류의 가상 자료를 모두 삭제. 삭제 후 다시 조회해 **samples=0, rates=0, global_budget=0** 확인.
- Supabase 권한 재조회: `anon_exec=false`, `authenticated_exec=false`, `service_role_exec=true`.
- Supabase Security Advisor 실제 재조회: **WARN 0건**, `rls_enabled_no_policy` INFO 61건. 상당수는 비공개 테이블의 의도된 무정책 deny-all이지만 일괄 무시하지 않고 검토 필요.

## 운영 출시 차단

- 독립 시험 웹 실제 Render Origin을 사용한 PC·모바일 전체 브라우저 E2E, 고부하 계측 남용 방어, 서비스 계측 데이터 보존/고지, 관리자 제외의 실제 Auth 기반 검증은 미완료.
- 개발 브랜치에서 설정된 시험 URL이 아닌 운영 Supabase URL을 가리키는 화면에서는 성능 이벤트가 **의도적으로 전송되지 않는다**. 이는 실수로 운영 데이터에 시험 이벤트를 쓰지 않기 위한 보수적 보호 조치다.
- 2026 관리자 AAL2 MFA·추천 설문 실응답 검증·학급일지 PIN 및 기타 5개 기능 잠금이 유지되므로 **전체 v1.1.0 NO-GO**. 시험 API 16/16개 설치는 완성·출시 허용을 뜻하지 않는다.
