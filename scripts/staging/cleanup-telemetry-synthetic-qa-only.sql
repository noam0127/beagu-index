-- QA ONLY, scoped cleanup after synthetic HTTP telemetry E2E.
-- This is for isolated staging ycwuugggqbunlbwuzvbx, never production.
-- Refuse to touch anything if other visitor activity occurred.
DO $qa$
DECLARE
  qa_visitor CONSTANT uuid := 'a0000000-0000-4000-8000-000000000001';
  qa_event CONSTANT uuid := 'a0000000-0000-4000-8000-000000000002';
BEGIN
  IF (SELECT count(*) FROM beagu_private.visits) <> 1
     OR (SELECT count(*) FROM beagu_private.visits
         WHERE visitor_id=qa_visitor AND event_id=qa_event AND page='index') <> 1
     OR (SELECT count(*) FROM beagu_private.beagu_live_presence_v1) <> 1
     OR (SELECT count(*) FROM beagu_private.beagu_live_presence_v1
         WHERE visitor_id=qa_visitor) <> 1
     OR (SELECT count(*) FROM beagu_private.beagu_telemetry_source_visitors_v2) <> 1
     OR (SELECT count(*) FROM beagu_private.beagu_telemetry_source_visitors_v2
         WHERE visitor_id=qa_visitor) <> 1
     OR (SELECT count(*) FROM beagu_private.beagu_telemetry_source_windows_v2) <> 4
     OR (SELECT count(*) FROM beagu_private.beagu_telemetry_guard_decisions_v2) <> 2
  THEN
    RAISE EXCEPTION 'ABORT: staging telemetry has unexpected non-test traffic';
  END IF;
  DELETE FROM beagu_private.visits WHERE visitor_id=qa_visitor AND event_id=qa_event;
  DELETE FROM beagu_private.beagu_live_presence_v1 WHERE visitor_id=qa_visitor;
  DELETE FROM beagu_private.beagu_telemetry_source_visitors_v2 WHERE visitor_id=qa_visitor;
  -- Precisely one synthetic source, no other visitor or traffic at inspection.
  DELETE FROM beagu_private.beagu_telemetry_source_windows_v2;
  DELETE FROM beagu_private.beagu_telemetry_guard_decisions_v2;
END;
$qa$;
