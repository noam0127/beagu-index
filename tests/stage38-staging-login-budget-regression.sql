-- Stage38 staging-only: login rate-limit boundary test.
-- Run ONLY on ycwuugggqbunlbwuzvbx, never on production.
-- Entire test is rolled back, including any cleanup in the RPC.
BEGIN;
DO $stage38$
DECLARE i integer; accepted boolean; rejected boolean;
BEGIN
  IF current_database() IS NULL THEN RAISE EXCEPTION 'No database'; END IF;
  DELETE FROM public.beagu_login_budget WHERE bucket=date_trunc('minute',now());
  FOR i IN 1..60 LOOP
    SELECT public.beagu_consume_login_budget() INTO accepted;
    IF accepted IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Unexpected denial on attempt %',i;
    END IF;
  END LOOP;
  SELECT public.beagu_consume_login_budget() INTO rejected;
  IF rejected IS DISTINCT FROM false THEN
    RAISE EXCEPTION '61st login budget request should be denied';
  END IF;
END
$stage38$;
SELECT 'PASS_60_ALLOWED_61_DENIED_ROLLBACK_PENDING' AS result;
ROLLBACK;
