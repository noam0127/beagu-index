# 배구지수 통합 업데이트 시스템 v2.0 — 11단계 통합 QA

2026-11-22 (Asia/Seoul) · **운영/시험 웹과 운영/시험 Supabase에 대한 배포·변경 작업 금지**

## 검증 범위와 결과의 의미

10단계에서 조정한 PR #198·#199·#195의 관리자 UI, Supabase 릴리스 관리자,
GitHub Actions 워커 및 시험 Supabase 연결 분리를 **같은 개발 트리**에서 검사한다.
통합 GitHub PR은 #193→#201→#205→#208→#211→#216→#219의 개발 이력 위에 쌓인다.

이번 단계에서 추가한 검사:

- Deno `deno check supabase/functions/beagu-release-manager-v1/index.ts`:
  코드의 TypeScript 및 종속 모듈 정합성 검증. **실제 API 실행 검사가 아니다.**
- `tests/release-step11-offline-integration.py`:
  GitHub CI 로컬 임시 폴더에서 승인 작업을 시뮬레이션하여 웹 루트 파일 불변,
  시험 HTML·JS의 운영 Supabase 주소·공개키 부재, 시험 공개키 적용,
  로컬 CSS/JS 경로, 승인된 공개 JSON 바이트 일치, 운영 타깃 및 SHA 없는 롤백 거절을 확인한다.
  실제 배포나 운영 DB 수정은 없다.
- `tests/release-step11-readiness.mjs`:
  확인되지 않은 DB·RLS·회원가입·Auth·배포 E2E를 성공으로 표시하지 않도록
  읽기 전용 관찰 증빙에 대한 회귀 검사 추가.
- `tests/staging-http-smoke.py`:
  현재 게시된 운영 `/`와 시험 `/_preview/`의 읽기 전용 GET 검사를 수행한다.
  **현재 게시된 기존 1.0.1 시험판**을 검사할 뿐 이번 통합 후보는 아직 배포하지 않았다.
- 기존 9·10단계 Git 두 부모/스택/보안 불변/온라인 무인 접근 거부/패키징 회귀 검사 유지.

## 읽기 전용 Supabase 실태 확인

2026-11-22 연결된 시험 Supabase 프로젝트 `ycwuugggqbunlbwuzvbx`에서 조회한 결과:

| 확인 내용 | 관찰 |
|---|---|
| `public` 업무 테이블 | **0개** |
| `auth` 스키마 기본 테이블 | 27개 |
| `storage` 스키마 테이블 | 10개 |
| 활성 시험 Edge Functions | `beagu-test-v1`, `beagu-stage-preview` |
| `beagu-release-manager-v1` 시험 API | 미배포 |

따라서 **시험 DB 마이그레이션·RLS 검증, 사용자 로그인/회원가입·메일 인증,
릴리스 API를 포함한 전체 브라우저 E2E 검사는 실행 불가**다.
위 확인은 읽기 전용 메타데이터 조회이며 어떤 SQL/스키마/회원 레코드도 바꾸지 않았다.

데이터: `docs/releases/v2-step11-readiness-observation.json`은 **관찰 시점의 참고 스냅샷**이며,
이를 릴리스 승인 권한이나 배포 가능 인증서로 사용해서는 안 된다.

## 남은 차단 조건

1. 회원가입·Lv3 등 필요한 테스트 업무 테이블을 **운영과 분리된 환경**에 준비.
2. RLS·권한 부여·릴리스 관리자 Edge API를 시험용으로만 구성하고,
   비인가/일반 교사/Owner+AAL2/서명된 worker 요청의 **실제 런타임 응답**을 검증.
3. 시험 웹 인프라를 운영 배포와 분리하고, 이번 후보 SHA를 실제 시험 웹에 배포하는 작업은 별도 사용자 승인 후 시행.
4. 실제 브라우저 PC·모바일 동작 및 외부 네트워크 요청에서 운영 DB 연결이 없는지 확인.
5. 운영 배포는 사용자 별도 명시적 승인 전까지 계속 잠금.
6. 기존 `stage_rollback` 대기 작업의 `to_sha=null` 상태는 운영 DB에 남아 있으므로, 운영 데이터 변경 승인 없이 작업을 수정하거나 제거하지 않음.

## 단계 완료 기준

본 단계는 **통합 코드의 정적·패키징·배포 전 회귀 검사 확충**을 목표로 한다.
CI 성공은 이 개발 작업의 구현과 비운영 검증 성공을 의미하지만,
전체 릴리스 후보에 대한 'QA 통과'나 v2.0 출시 준비 완료는 의미하지 않는다.
종합 릴리스 판정은 현재 **BLOCKED**이며,
11단계에서 새롭게 확인된 결함은 발견한 뒤 해당 개발 브랜치에서 수정한다.

## 직접 실행 가능 명령

- `node --test tests/site-release-center.mjs`
- `node --test tests/release-step10-security-invariants.mjs`
- `node --test tests/release-step11-readiness.mjs`
- `deno check supabase/functions/beagu-release-manager-v1/index.ts`
- `python3 tests/site-release-packaging.py`
- `python3 tests/release-step11-offline-integration.py`
- `python3 tests/staging-http-smoke.py` (현재 게시된 사이트 HTTP GET, 비후보 버전)
