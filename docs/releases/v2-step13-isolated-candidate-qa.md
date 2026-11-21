# 배구지수 통합 업데이트 시스템 v2.0 — 13단계 독립 통합 후보 검증 경로

2026-11-22 (KST) · **운영/시험 배포 없음 · Supabase 운영/시험 DB 변경 없음 · 릴리스 버전 생성 없음**

## 이번 단계에서 실제로 수행한 작업

1. 운영 Supabase 릴리스 상태를 **읽기 전용 조회**해 운영 버전은 `관리자 배포 시스템 1.0`, 시험 버전은 `1.1.0-qa.20261122`임을 확인했다.
2. 새로운 시험 버전 `1.1.0-qa.20261122`는 다른 작업 흐름에서 이미 `deployed`로 기록됐으며 **이번 단계가 배포한 것이 아니다**.
3. 12단계 Draft PR #237의 고정된 HEAD를 기준으로 독립 개발 브랜치를 생성했다. `main`이나 기존 `/_preview/`를 변경하지 않았다.
4. `scripts/release-manager/build-isolated-candidate.py`를 추가했다.
   - 정확한 40자 Git SHA가 현재 체크아웃 HEAD와 일치하는지 확인
   - **Git 커밋 객체**의 웹 파일만 복원하고 작업 폴더의 미커밋 파일은 사용하지 않음
   - `.github`, `scripts`, `supabase`, `docs`, `README.md`, `CNAME`, `release-candidate.json` 등 배포 비대상 파일은 패키징하지 않음
   - JS/HTML에 포함된 운영 Supabase URL과 공개키를 기존 10단계 검증된 **시험 Supabase** 값으로 치환
   - 모든 HTML에 QA 표시 배너·noindex·CSP(`connect-src 'self' https://ycwuugggqbunlbwuzvbx.supabase.co`, `form-action 'none'`) 삽입
   - 작업 후보의 SHA, 파일 수, 검증 범위, `blocked` 상태를 로컬 `.qa-candidate-manifest.json`으로 기록
   - 출력 폴더는 저장소 바깥에 두고 기존 출력 폴더 덮어쓰기를 금지
5. `tests/release-step13-isolated-preview.py`에서 SHA 잠금, 공개/비공개 경로 구분, 로컬 HTTP 200, 상대 JS/CSS URL 존재, 운영 API 문자열 누출 검사, 무권한 배포 방지 상태를 검증한다.
6. `.github/workflows/release-v2-isolated-candidate-qa.yml`에 **읽기 전용 Actions 워크플로**를 추가했다.
   - `permissions: contents: read`만 부여
   - 명시적 PR HEAD SHA를 체크아웃하고 정확한 SHA를 재검증
   - runner 내부에서만 후보를 빌드하고 HTTP 검사
   - GitHub Pages 배포·Vercel 배포·Supabase API/DB 변경 명령은 전혀 실행하지 않음
   - **전체 웹 파일이나 학교 자료는 업로드하지 않고, 사소한 검사 증빙 JSON 한 개만** 1일간 보관
7. 기존 `Site release manager checks` CI에도 13단계 검사를 추가한다.

## 의도적인 한계

**이번 단계의 '독립'은 배포 환경을 분리한다는 뜻이 아니라, 통합 후보 패키징 및 로컬 검증을
운영/시험 웹 배포 파이프라인과 분리한다는 뜻이다.** 아직 외부 접속 가능한 별도 검증 URL을 발급하지 않는다.

로컬 HTTP 확인은 **실제 브라우저를 띄운 E2E 테스트가 아니며**, HTML CSP에서 요청을 제한한 상태다.
시험 Supabase의 업무 테이블·Auth·RLS·Edge Functions는 아직 준비되지 않았으므로,
로그인/권한별 자료 공개/교사 인증·설문쓰기 등 사용자 기능을 완료 판정하지 않는다.
시험 프로젝트의 공개키는 인증 우회 권한이 아니며, API 호출은 실제 시험 환경을 준비한 뒤에야 검증할 수 있다.

### 확정된 안전 규칙

- 운영/시험 Supabase 데이터 쓰기 없음
- 운영/시험 Pages 또는 Vercel 배포 없음
- GitHub `main` 병합 없음
- `release_version` 생성 없음
- 현재 `main`이 계속 움직이므로, 임시 후보 SHA는 최신 `main` 포함 검증을 통과하지 않으면 릴리스 버전으로 확정 불가
- PR HEAD와 최종 Actions의 고정 SHA가 일치하는 경우에만 해당 검증 결과를 인정
- 실제 런타임 권한·브라우저 E2E가 없는 결과는 **`blocked`**, `ready_for_snapshot` 아님

## 직접 실행

저장소 체크아웃의 정확한 Git HEAD를 확인한 후 **저장소 바깥의 비어 있지 않은 경로가 아닌 새 경로**에만 실행한다.

```bash
python3 tests/release-step13-isolated-preview.py
sha="$(git rev-parse HEAD)"
python3 scripts/release-manager/build-isolated-candidate.py \
  --sha "$sha" --output "/tmp/beagu-candidate-$sha"
```

이 스크립트는 서버 배포 버튼이나 DB 변경에 연결되지 않는다. 산출물을 별도의 웹 서버에 호스팅하는
기능은 **이번 단계에 포함되지 않는다**.

## 후속 14단계

독립 시험 호스팅/스테이징 배포 경로를 별도 승인 아래 준비하고, 실제 브라우저의 네트워크
접속·Auth·RLS/DB 검증이 가능하도록 보완한다. 운영 웹 재게시가 수반되는 기존 `/_preview/` 방식으로
시험 배포를 대체하거나 자동 진행하지 않는다.
