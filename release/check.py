import json
from pathlib import Path
import subprocess
import sys

checks = []
for name,test in [
    ("학교검색", "tests/school-search-unification.mjs"),
    ("Lv0 공개 학교 데이터", "tests/public-compare-directory-static.cjs"),
    ("Lv1·Lv2 참여코드", "tests/participation-code-unified.mjs"),
    ("2026 권한별 조회", "tests/2026-lv2-immediate.mjs"),
    ("추천 링크 및 검증", "scripts/test-challenge-referral-stage2.cjs"),
    ("포스트잇 권한", "tests/postit-member-auth.cjs"),
    ("포스트잇 상호작용", "tests/postit-stage4-mutations.mjs"),
    ("학교비교", "tests/search-compare-unity.mjs"),
    ("학급일지 게임", "scripts/test-class-diary-play-page.cjs"),
    ("관리자 인증·MFA", "tests/admin-auth-authorization-static.cjs"),
]:
    result=subprocess.run(["node",test])
    checks.append(dict(name=name,state="passed" if result.returncode==0 else "failed"))
Path("checks.json").write_text(json.dumps(checks,ensure_ascii=False))
sys.exit(any(c["state"]=="failed" for c in checks))
