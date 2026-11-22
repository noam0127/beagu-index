# 배구지수 v1.1.0 — Vercel 없는 독립 시험 웹 실제 게시

> 범위: **개발 브랜치만**, **독립 Render 정적 사이트만**, **시험 Supabase만**.
> 이 작업에서 운영 웹 `baeguindex.com`, GitHub `main`, 운영 Supabase는 변경하지 않는다.

## 1. 한 번만 필요한 Render 계정 연결

아래 링크는 Render의 공식 **Deploy to Render** 방식으로, GitHub 저장소의
**개발 브랜치**에 있는 `render.yaml`을 불러온다.

[Render에서 독립 시험 사이트 만들기](https://render.com/deploy?repo=https%3A%2F%2Fgithub.com%2Fnoam0127%2Fbeagu-index%2Ftree%2Ffix%2Fv1.1.0-preview-isolation-gate-20261123)

1. Render 로그인 → GitHub 접근 승인(필요한 경우). **금전 결제/유료 요금제는 승인하지 않는다.**
2. 화면에 배포 대상이 `noam0127/beagu-index` **개발 브랜치**인지 확인한다.
3. 정적 사이트 `baegu-index-v110-sandbox`인지, **`autoDeployTrigger: off`**인지 확인한다.
4. Render에서 **본인이** 서비스 생성/초기 배포를 승인한다.
5. 실제 생성된 `https://<고유이름>.onrender.com` 주소를 보관한다.

배포 대상 브랜치: `fix/v1.1.0-preview-isolation-gate-20261123`.
기본 브랜치(`main`)를 잘못 선택한 경우 그대로 진행하지 않는다.
Render에 커스텀 도메인으로 `baeguindex.com`을 입력하지 않는다.

## 2. 연결 후 실제 HTTP 읽기 전용 검사

배포 기록의 전체 40자리 Git SHA를 확인한다. 소스 코드를 해당 버전으로
checkout한 뒤 다음 명령을 실행한다.

```bash
python3 scripts/verify-render-preview.py \
  --url https://YOUR-STAGING.onrender.com \
  --sha FULL_40_CHAR_DEPLOYED_COMMIT_SHA
```

검사 항목은 10개의 GET 요청이다. Git SHA, 시험 DB 식별자,
공개 상태 파일의 CORS, 보안 헤더(CSP, X-Robots-Tag), 홈·검색·챌린지·비교·
학교보고서·업데이트 화면 6개, 관리자 업데이트 화면의 읽기 전용 여부이다.
비밀번호/인증 코드/관리자 데이터는 검사하지 않으며 어떤 쓰기 요청도 하지 않는다.

실패하면 배포 성공으로 간주하지 않는다. `README`나 개발 브랜치를
수정하기 전 GitHub Actions 아티팩트와 배포된 버전의 SHA부터 대조한다.

## 3. 관리자 화면에서 독립 시험 웹 링크 표시

개발 코드의 `js/beagu-independent-preview-target-v1.js`에는 기본으로
`origin: ""`이 들어 있다. **실제 URL을 생성·검사하기 전에는 변경하지 않는다.**
개설 후 해당 Render origin만 개발 브랜치에서 지정하고 브라우저 검증을 거친다.
**운영 웹에 즉시 배포하거나 운영 배포 승인 버튼을 활성화해서는 안 된다.**

## 4. 그다음에야 가능한 실제 기능 E2E

- 시험 Supabase에서 이메일 로그인과 인증 리디렉션 설정을 확인한다.
- 시험용 관리자 계정·MFA를 통해 읽기 전용 관리자 화면 및 접근 통제를 점검한다.
- 테스트 사용자로 Lv1/Lv2/Lv3 권한을 검증한다. 운영 가입자 데이터는 사용하지 않는다.
- 독립 사이트의 녹색 검사와 운영 배포용 CI 증빙은 별개다. 운영 배포는 별도 승인까지 금지한다.

## 관련 공식 문서

- [Render Deploy to Render 버튼과 브랜치 선택](https://render.com/docs/deploy-to-render)
- [Render Blueprint 필드 · 정적 사이트 설정](https://render.com/docs/blueprint-spec)
