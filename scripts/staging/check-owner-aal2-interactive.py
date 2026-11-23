#!/usr/bin/env python3
"""Local ONLY: check a real staging Supabase AAL2 access JWT with no DB writes.

Never send a JWT to ChatGPT, GitHub, CI, screenshots, shell history or logs.
Run locally on a trusted machine AFTER manually completing staging Auth +
Supabase TOTP MFA. The access token is entered using hidden getpass input.
This checker never approves publishing or changes service configuration.
"""
from __future__ import annotations

import getpass
import json
import re
import sys
from urllib import request,error

STAGING="https://ycwuugggqbunlbwuzvbx.supabase.co"
ENDPOINT=STAGING+"/functions/v1/beagu-2026-review-admin?preflight=mfa"
TEST_ORIGIN="http://localhost:8000"
MAX_LENGTH=4096

def print_instructions() -> None:
    print("배구지수 v1.1.0 시험 관리자 AAL2 확인 (실제 MFA 로그인을 대체하지 않음)")
    print("1. 반드시 시험 Supabase 프로젝트에서만 이메일 사용자·TOTP 인증을 설정합니다.")
    print("2. 실제 MFA 확인이 끝난 시험 계정의 access_token만 로컬에서 사용합니다.")
    print("3. 토큰은 이 채팅, GitHub, CI 비밀변수, 화면 캡처에 붙여넣지 마세요.")
    print("4. 이 진단은 Auth 서명·활성 AAL2 세션 및 본인 관리자 권한만 조회합니다.")
    print("5. 모든 관리자 심사·공개 승인 기능은 여전히 잠겨 있습니다.")

def main() -> int:
    print_instructions()
    if "--instructions" in sys.argv:
        return 0
    if not sys.stdin.isatty():
        print("BLOCKED: trusted interactive terminal required; no CI token input.", file=sys.stderr)
        return 2
    token=getpass.getpass("시험 프로젝트의 실제 AAL2 access_token (표시 안 됨): ").strip()
    if len(token)>MAX_LENGTH or len(token.split("."))!=3 or not re.fullmatch(r"[A-Za-z0-9._-]+",token):
        print("BLOCKED: 잘못된 JWT 형식 또는 너무 긴 토큰. 전송하지 않았습니다.")
        return 2
    req=request.Request(
        ENDPOINT,
        data=b"{}",
        headers={
            "Authorization":"Bearer "+token,
            "Content-Type":"application/json",
            "Origin":TEST_ORIGIN,
            "Cache-Control":"no-store",
        },
        method="POST",
    )
    try:
        with request.urlopen(req,timeout=20) as response:
            status=response.status
            body=response.read(2048)
    except error.HTTPError as exc:
        status=exc.code
        body=exc.read(2048)
    except (error.URLError,TimeoutError):
        print("BLOCKED: 시험 서버에 연결되지 않았습니다. 데이터는 변경되지 않았습니다.")
        return 2
    # Discard raw JWT; never print the user ID, email or access token.
    token=""
    try:
        result=json.loads(body)
    except (TypeError,ValueError):
        print(f"BLOCKED: 진단 형식 오류 HTTP {status}.")
        return 2
    if status!=200:
        print(f"BLOCKED: HTTP {status}; 시험 Auth 토큰·MFA 세션을 다시 확인하세요.")
        return 2
    state=result.get("status")
    if result.get("review_enabled") is not False:
        print("BLOCKED: 출시 잠금 계약 위반 — 관리자 기능을 사용하지 마세요.")
        return 2
    if state=="verified_aal2_session" and result.get("owner") is True and result.get("active_mfa") is True:
        print("PASS: 실제 Auth JWT와 소유자/활성 AAL2 세션의 읽기 전용 확인 통과.")
        print("LIMITATION: 이 결과만으로 심사 결정·브라우저 전체 E2E·출시가 승인되지는 않습니다.")
        return 0
    messages={
        "admin_access_not_configured":"시험 계정에 관리자 권한이 배정되지 않았습니다.",
        "mfa_challenge_required":"시험 계정의 TOTP MFA 인증이 아직 완료되지 않았습니다.",
        "inactive_or_expired_mfa_session":"세션이 만료·종료되었거나 AAL2 상태가 아닙니다."
    }
    print("BLOCKED: "+messages.get(state,"관리자 소유자·MFA 요건 미충족."))
    return 1

if __name__=="__main__":
    raise SystemExit(main())
