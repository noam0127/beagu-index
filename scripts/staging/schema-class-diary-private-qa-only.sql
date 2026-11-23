-- ISOLATED TEST PROJECT ycwuugggqbunlbwuzvbx ONLY.
-- Preview is a fictional VN, not real classrooms, schools or Lv1/Lv2 identities.
-- Reconstruct *empty* PostgreSQL schema and function contracts; no user records copied.
CREATE TABLE IF NOT EXISTS beagu_private.class_diary_preview_attempts (
  bucket timestamptz PRIMARY KEY,
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0)
);
CREATE TABLE IF NOT EXISTS beagu_private.class_diary_preview_progress (
  id integer PRIMARY KEY CHECK(id=1),
  state jsonb NOT NULL CHECK(pg_catalog.jsonb_typeof(state)='object'),
  revision bigint NOT NULL CHECK(revision>0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE beagu_private.class_diary_preview_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE beagu_private.class_diary_preview_progress ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON beagu_private.class_diary_preview_attempts FROM PUBLIC,anon,authenticated;
REVOKE ALL ON beagu_private.class_diary_preview_progress FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.beagu_consume_class_diary_preview_budget()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE n integer;
BEGIN
  DELETE FROM beagu_private.class_diary_preview_attempts
    WHERE bucket < pg_catalog.date_trunc('hour',pg_catalog.now())-interval '2 day';
  INSERT INTO beagu_private.class_diary_preview_attempts(bucket,attempts)
  VALUES(pg_catalog.date_trunc('hour',pg_catalog.now()),1)
  ON CONFLICT(bucket) DO UPDATE
    SET attempts=beagu_private.class_diary_preview_attempts.attempts+1
  RETURNING attempts INTO n;
  RETURN n<=80;
END;
$fn$;
CREATE OR REPLACE FUNCTION public.beagu_class_diary_preview_progress_read()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $fn$
  SELECT pg_catalog.jsonb_build_object('state',p.state,'revision',p.revision,
   'updatedAt',p.updated_at)
  FROM beagu_private.class_diary_preview_progress p WHERE p.id=1;
$fn$;
CREATE OR REPLACE FUNCTION public.beagu_class_diary_preview_progress_write(
  p_expected_revision bigint, p_state jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE result jsonb;
BEGIN
  IF p_expected_revision IS NULL OR p_expected_revision<0 OR p_state IS NULL
     OR pg_catalog.jsonb_typeof(p_state)<>'object'
     OR pg_catalog.pg_column_size(p_state)>32768 THEN RETURN NULL; END IF;
  INSERT INTO beagu_private.class_diary_preview_progress AS p
    (id,state,revision,updated_at)
  VALUES(1,p_state,1,pg_catalog.now())
  ON CONFLICT(id) DO UPDATE
    SET state=excluded.state,revision=p.revision+1,updated_at=pg_catalog.now()
  WHERE p.revision=p_expected_revision
  RETURNING pg_catalog.jsonb_build_object('revision',revision,'updatedAt',updated_at)
    INTO result;
  RETURN result;
END;
$fn$;
-- All three functions are security definer: NO anonymous or member RPC execution.
REVOKE ALL ON FUNCTION public.beagu_consume_class_diary_preview_budget()
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.beagu_class_diary_preview_progress_read()
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.beagu_class_diary_preview_progress_write(bigint,jsonb)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.beagu_consume_class_diary_preview_budget() TO service_role;
GRANT EXECUTE ON FUNCTION public.beagu_class_diary_preview_progress_read() TO service_role;
GRANT EXECUTE ON FUNCTION public.beagu_class_diary_preview_progress_write(bigint,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';