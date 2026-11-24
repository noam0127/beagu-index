# 4.0 ranking preflight (not a migration)

The code-only candidate uses teacher_run_retirement_v4 and a separate localStorage key. It does not call the 3.0 ranking endpoint. The versioned score policy rejects malformed/extra fields, incorrect time/outcome/score, duplicate or prematurely achieved bosses, impossible leave totals and unreasonable counters. It is only plausibility checking, not a proof of real gameplay.

schema-draft.sql is deliberately outside the automatic migration directory. Review and execute ONLY in a disposable PostgreSQL 15+ fixture after creating anon/authenticated/service_role roles. The schema is new and isolated; it preserves legacy score records. A future server must verify Lv.1 eligibility, school difficulty, actor/session binding, rate limits, server elapsed time, and replay evidence; insert using the session primary key; publish only verified rows through an allowlisted response. No public write grants. No automatic approval based on client-supplied summaries. No production use or official ranking claim until authoritative verification, migration review, isolated SQL tests, and explicit administrator approval.

Current blocker: the real game is client-side and lacks a deterministic server-verifiable replay. The existing 3.0 API is not a substitute. This draft prepares separation but does not enable the new official board.
