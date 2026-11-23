-- STAGING-only rollback transaction: never persist fictional preview saves.
BEGIN;
DO $qa$
DECLARE
  v_first jsonb;
  v_updated jsonb;
  v_read jsonb;
  v_conflict jsonb;
  v_budget boolean;
  i integer;
BEGIN
  IF (SELECT count(*) FROM beagu_private.class_diary_preview_progress)<>0
     OR (SELECT count(*) FROM beagu_private.class_diary_preview_attempts)<>0
  THEN RAISE EXCEPTION 'ABORT: preview tables must be empty'; END IF;
  SELECT public.beagu_class_diary_preview_progress_read() INTO v_read;
  IF v_read IS NOT NULL THEN RAISE EXCEPTION 'expected no initial progress'; END IF;
  SELECT public.beagu_class_diary_preview_progress_write(
      0,'{"version":"class-diary-semester/v1","episode":1}'::jsonb)
  INTO v_first;
  IF (v_first->>'revision')::bigint<>1
  THEN RAISE EXCEPTION 'first write failed %',v_first; END IF;
  SELECT public.beagu_class_diary_preview_progress_write(
      0,'{"version":"class-diary-semester/v1","episode":99}'::jsonb)
  INTO v_conflict;
  IF v_conflict IS NOT NULL THEN RAISE EXCEPTION 'stale revision accepted'; END IF;
  SELECT public.beagu_class_diary_preview_progress_write(
      1,'{"version":"class-diary-semester/v1","episode":2}'::jsonb)
  INTO v_updated;
  IF (v_updated->>'revision')::bigint<>2
  THEN RAISE EXCEPTION 'revision CAS failed %',v_updated; END IF;
  SELECT public.beagu_class_diary_preview_progress_read() INTO v_read;
  IF (v_read->'state'->>'episode')::integer<>2
     OR (v_read->>'revision')::integer<>2
  THEN RAISE EXCEPTION 'read after write incorrect %',v_read; END IF;
  SELECT public.beagu_class_diary_preview_progress_write(
    2,'[]'::jsonb) INTO v_conflict;
  IF v_conflict IS NOT NULL THEN RAISE EXCEPTION 'non-object accepted'; END IF;
  FOR i IN 1..81 LOOP
    SELECT public.beagu_consume_class_diary_preview_budget() INTO v_budget;
    IF (i<=80 AND v_budget IS DISTINCT FROM true)
       OR (i=81 AND v_budget IS DISTINCT FROM false)
    THEN RAISE EXCEPTION 'unexpected PIN attempt budget on request %',i;
    END IF;
  END LOOP;
  RAISE NOTICE 'QA PASS rollback-only: read/write rev1-rev2, stale CAS conflict, invalid state, rate cap 80';
END;
$qa$;
ROLLBACK;