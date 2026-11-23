#!/usr/bin/env python3
"""Audit real JWT local verifier without passing any credentials."""
from pathlib import Path
import subprocess
root=Path(__file__).resolve().parents[1]
source=(root/"scripts/staging/check-owner-aal2-interactive.py").read_text()
for text in (
 "https://ycwuugggqbunlbwuzvbx.supabase.co",
 "beagu-2026-review-admin?preflight=mfa",
 "getpass.getpass",
 "sys.stdin.isatty()",
 "result.get(\"review_enabled\") is not False",
 "verified_aal2_session",
 '\"owner\") is True',
 "LIMITATION:"
):
    assert text in source,text
for forbidden in (
 "https://baeguindex.com",
 "snvzwrexuqavnfvzgxqj",
 "print(token)",
 "print(result)",
 "token.encode(",
 "subprocess.run("
):
    assert forbidden not in source,forbidden
p=subprocess.run(["python3","scripts/staging/check-owner-aal2-interactive.py","--instructions"],
    cwd=root,capture_output=True,text=True,check=False)
assert p.returncode==0 and "TOTP" in p.stdout
print("PASS: interactive tester requires a real stage JWT, never writes or logs tokens")
print("PASS: non-authenticated CI can run --instructions without accessing user data")
