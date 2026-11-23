#!/usr/bin/env python3
"""Staging interest source and SQL privacy contract; no data mutations."""
from pathlib import Path
root=Path(__file__).resolve().parents[1]
src=(root/"scripts/staging/recovered-beagu-school-interest-v1/index.ts").read_text()
sql=(root/"scripts/staging/schema-school-interest-qa-only.sql").read_text()
for n in ("STAGING_PROJECT_ONLY","beagu_school_interest_rankings",
          "beagu_level_sessions","ORIGIN_NOT_ALLOWED","Number(session.access_level)<1"):
    assert n in src,n
for n in ("SECURITY INVOKER","current_visitors >= 5","c.current_visitors - c.previous_visitors >= 3",
          "ENABLE ROW LEVEL SECURITY","REVOKE ALL ON FUNCTION","GRANT EXECUTE",
          "visitor_digest text NOT NULL CHECK","FROM PUBLIC, anon, authenticated"):
    assert n in sql,n
for n in ("https://baeguindex.com","snvzwrexuqavnfvzgxqj"):
    assert n not in src+sql,n
print("PASS: isolated source, no production hostname, 5-person privacy and ACL gating")
