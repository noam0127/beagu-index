# 회원·2026 챌린지·레벨 연동 검증 (14단계)

## 2026-11-22 운영 DB 읽기 전용 스키마·집계 점검
- public.beagu_postit_member_accounts: 0행
- beagu_private.challenge_identity_codes (2026): 360행
- beagu_private.challenge_referral_profiles (2026): 46행
- 유효 추천 조건 (disabled=false, access_level>=2, valid_referrals>=1): 5행
- **주의**: 각 집계의 대상이 다르므로 360명/46명/5명을 실제 회원 수나 계정 전환율로 해석하지 않는다.
- 실제 회원 계정 연결 행이 0개이므로 Lv3 E2E 검증 및 실회원-추천 연결 검증은 수행 불가.

## 권한 상태 판정 매트릭스
| 상태 | 인증 근거 | 관리자 표시 기대 | 실제 검증 |
|---|---|---|---|
| Lv0 | 참여코드 인증 없음 | 비인증 | 미실시 |
| Lv1 | 2026 설문 참여 인증 또는 비활성 Lv2 참여코드 | Lv1 | 미실시 |
| Lv2 | 동일 코드에 유효 추천 1건 이상, disabled=false | Lv2 | 조건식 스키마 확인만 |
| Lv3 | 정식 계정 생성 및 로그인, Lv2 연동 정책 | 회원 계정 상태와 챌린지 권한 별도 표기 | 계정 연결 0행으로 미실시 |

**핵심**: auth.users의 계정 존재, beagu_postit_member_accounts의 연결, challenge_referral_profiles의 추천 레벨은 서로 다른 개념. 회원 계정 존재만으로 추천 실적이나 Lv2를 부여하지 않는다.

## 확인된 구현 한계
- `beagu_admin_member_challenge_summary_v1`은 active 회원 연결 + 유효 Lv2 추천이 있을 때만 `linked=true`를 반환한다. Lv1만 인증된 계정의 상태를 표현하지 못한다.
- `decorate`의 `lv2_account_linked`는 postit 계정 연결 상태만 검사한다. 추천 실적 검증 결과와 다르므로 이름이 오해를 유발할 수 있다.
- Lv3 정식 계정의 생성·로그인 자체를 이 관리자 API에서 별도 판정하지 않는다.
- 개인정보를 보호하기 위해 코드 원문, 방문자 UUID, 추천 토큰은 관리자 화면에 노출하지 않는다.

## 운영 적용 전 필수 시나리오
1. Lv1 인증(설문 참여), 비활성 Lv2 참여코드로 Lv1 인증
2. 추천 0건→1건 전환, 동일 참여코드로 Lv2 인증
3. 비활성/disabled 추천 상태의 권한 하향·차단
4. Lv2에서 계정 생성 및 로그인 후 Lv3, 세션 만료/재로그인
5. 계정 연결 해제·중복 연결 방지·추천 무효화
6. 일반 사용자 접근 차단, 관리자 AAL2, 감사 로그
7. 코드·이메일·방문자 ID 등의 개인정보 노출 여부

운영 DB 변경, 실제 계정 생성, 추천 실적 변경, 배포는 수행하지 않았다.
