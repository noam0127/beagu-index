#!/usr/bin/env python3
"""Offline QA-only arcade source audit; no real gameplay/writes."""
from pathlib import Path
p=Path(__file__).resolve().parents[1]/"scripts/staging/recovered-arcade-leaderboard/index.ts"
code=p.read_text(encoding="utf-8")
needed=[
  'https://ycwuugggqbunlbwuzvbx.supabase.co','IS_STAGE = SUPA_URL === STAGE_URL',
  'staging_project_only','origin_not_allowed','BEAGU_STAGING_ALLOWED_ORIGIN',
  'ALLOWED_ORIGINS','allowedOrigin(origin)','arcade_game_sessions','arcade_game_scores',
  'nickname_not_supported','too_many_plays','invalid_session',
  'ip_hash','started_at','submitted_at','percentile_source_year',
  'return error("invalid_game",400,origin);', 'survey_url:null'
]
for item in needed:assert item in code, "Missing safe arcade contract: "+item
assert 'https://baeguindex.com' not in code
assert 'snvzwrexuqavnfvzgxqj' not in code
assert 'forms.gle' not in code
print("PASS stage-only arcade function source and CORS/writes isolation")
print("NOT PROVEN: full game play, leaderboard persistence, browser E2E")
