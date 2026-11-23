# 배구지수 v1.1.0 — 시험 계측 API 실제 복구·검증 (2026-11-23 KST)

## 범위·운영 환경 보호

- **시험 Supabase만 수정:** `ycwuugggqbunlbwuzvbx`, 운영 Supabase `snvzwrexuqavnfvzgxqj`는 함수 정의/스키마 비교를 위한 읽기 전용 조회만 진행.
- 운영 웹 `https://baeguindex.com`, 운영 GitHub `main`, 운영 설문 응답, 실제 방문자/개인정보는 변경·이관하지 않음.
- 시험 Edge `beagu-telemetry-v2` v1 ACTIVE. 정적 시험 웹의 직접 참조 API 16개 중 10개 배포, 3개 미배포. 이는 전체 E2E 완료나 운영 배포 승인을 뜻하지 않음.

## 누락 의존성 복구

- 운영 함수 본문을 읽기 전용으로 확인한 뒤, 시험 DB에 `public.beagu_record_visit(uuid,uuid,text)`와 `public.beagu_telemetry_totals_v2()` 생성.
- 양쪽 함수 모두 `SECURITY DEFINER`이므로 즉시 `PUBLIC`, `anon`, `authenticated` EXECUTE를 철회하고 `service_role`에만 허용. 비공개 `beagu_private.visits` 테이블은 그대로 RLS 활성, 일반 역할의 직접 SQL 접근 금지.
- 기존 `beagu_telemetry_guard_v2` 및 `beagu_presence_ping_v1`, 비공개 소스·활동 테이블을 그대로 사용. `beagu_record_visit`는 UUIDv4 검증, 방문 페이지 제한, 이벤트 UUID 멱등성, 분/시간 호출 제한, 기존 관리자 제외 트리거를 유지.
- [시험 전용 SQL](https://github.com/noam0127/beagu-index/blob/fix/v110-staging-edited-api-recovery-20261123/scripts/staging/schema-telemetry-rpcs-qa-only.sql), [시험 전용 Edge 소스](https://github.com/noam0127/beagu-index/blob/fix/v110-staging-edited-api-recovery-20261123/scripts/staging/recovered-beagu-telemetry-v2/index.ts).

## 실제 증거

- [GitHub Actions #45088247300](https://github.com/noam0127/beagu-index/actions/runs/45088247300) **성공**. OPTIONS 허용 QA / 운영 출처 거부 / Origin 없는 요청 거부 / GET 준비 확인 / 잘못된 POST 차단 / 가상 방문자 `ping` 성공 / `visit` 성공 / 같은 이벤트 재요청 시 방문자 합계 중복 없음.
- QA 테스트에서만 고정 **가상 UUID** 1개·가상 이벤트 UUID 1개 사용. 서비스 키는 소스·CI에 저장하지 않음.
- [안전 확인 후 시험 데이터 정리 SQL](https://github.com/noam0127/beagu-index/blob/fix/v110-staging-edited-api-recovery-20261123/scripts/staging/cleanup-telemetry-synthetic-qa-only.sql)를 실제 실행. 방문 `visits`, 실시간 접속, 소스 방문자, 소스 시간창, 집계 결정 테이블 **5개 모두 0건** 검증.
- [API 목록·NO-GO 검사 #45088445807](https://github.com/noam0127/beagu-index/actions/runs/45088445807) **성공**. 아직 6개 함수 미배포이므로 전체 시험 준비 상태는 실패로 판정해야 한다.

## 개인정보·보안 위험과 미완료

- 운영에서는 IP 출처 헤더가 검증된 ingress에서 덮어쓰는지 증명되어야 함. **현재 QA 소스는 임의의 `CF-Connecting-IP`/`X-Forwarded-For` 값을 사용하지 않고 모든 QA 방문자를 하나의 공통 호출 제한 버킷으로 처리**하므로 소규모 시험은 가능하나 실제 서비스 확대에는 부적합. 신뢰 가능한 인입 IP 경계 확인 또는 대체율 제한 전략이 필수.
- 실제 관리자 브라우저 인증 시 방문/접속 제외, 허용된 Render 시험 호스트에서의 Origin, 장기간 동시 사용 부하, 장비별 PC·모바일 전체 E2E는 확인되지 않음.
- 2026-11-23 Supabase 보안 점검에서 `rls_enabled_no_policy` INFO 52건(여러 비공개 객체의 deny-all 설계 포함)과 **별개 기존 성능 함수** `public.beagu_perf_record_v1`의 익명/회원 `SECURITY DEFINER` 실행 허용 WARN 2종을 발견. 이 함수는 이번 계측 복구에서 수정하지 않았음. 운영 승격 전 권한 및 익명 입력 검증을 독립 심사해야 함. [Supabase Lint: anonymous definer execution](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable).
- 최종 사용자 가입·Lv1/Lv2/Lv3·관리자 MFA·추천/심사·전체 PC/모바일 E2E·2026 개인정보 독립 승인 전까지 **NO-GO**.

## 재실행 시 가상 기록 누적 방지 (후속 개선)

- 처음의 [양성 시험 #45088247300](https://github.com/noam0127/beagu-index/actions/runs/45088247300)은 가상 방문자 UUID로 실제 ping·visit을 기록했기 때문에 별도로 시험 흔적을 청소해야 했음.
- 이를 개선해 GitHub `.github/workflows/v110-staging-telemetry.yml`의 **일반 push/수동 자동검사 모두 무기록 테스트** `tests/staging-telemetry-http-denials.test.py`만 실행하도록 변경. [새 자동검사 #45088606539](https://github.com/noam0127/beagu-index/actions/runs/45088606539) 통과.
- 변경 직전 시작된 기존 양성 시험 #45088594084가 한 차례 더 실행되어 같은 가상 UUID가 재기록된 사실을 확인하고, 기록 개수 사전검증 후 같은 cleanup SQL로 다시 삭제.
- **최종 재확인:** visits, live_presence, source_visitors, source_windows, guard_decisions 테이블 5개 모두 0건, 일반 사용자 direct RPC 접근 불가, RLS enabled. 앞으로 양성 HTTP 테스트는 자동 실행하지 않음.
