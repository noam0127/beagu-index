-- TRANSACTIONAL QA CHECK. ROLLBACK IS REQUIRED.
-- Never run against production. Creates 102 SYNTHETIC arcade sessions and
-- scores in one transaction to assert top-100/top-10 pruning and FK consistency.
BEGIN;
DO $$
DECLARE
  i integer;
  sid uuid;
  scores integer;
  fastest integer;
  low_t integer;
  high_t integer;
  duplicate_sessions integer;
BEGIN
  IF current_database() IS NULL THEN
    RAISE EXCEPTION 'Unexpected SQL context';
  END IF;
  IF (SELECT count(*) FROM public.arcade_game_scores) <> 0
     OR (SELECT count(*) FROM public.arcade_fastest25_records) <> 0
     OR (SELECT count(*) FROM public.arcade_game_sessions) <> 0 THEN
    RAISE EXCEPTION 'Expected empty isolated staging score tables for QA';
  END IF;
  FOR i IN 1..102 LOOP
    INSERT INTO public.arcade_game_sessions
      (game,ip_hash,school_name,difficulty)
    VALUES ('volleyball_25',repeat('a',64),'가상 시험학교','normal')
    RETURNING id INTO sid;
    INSERT INTO public.arcade_game_scores
      (session_id,game,score,school_name,difficulty,win_time_tenths,public_result)
    VALUES (sid,'volleyball_25',1000+i,'가상 시험학교','normal',100+i,'{}'::jsonb);
  END LOOP;
  SELECT count(*) INTO scores FROM public.arcade_game_scores;
  SELECT count(*),min(win_time_tenths),max(win_time_tenths)
    INTO fastest,low_t,high_t FROM public.arcade_fastest25_records;
  SELECT count(*) INTO duplicate_sessions FROM (
    SELECT session_id FROM public.arcade_fastest25_records
    GROUP BY session_id HAVING count(*)>1
  ) q;
  IF scores<>100 OR fastest<>10 OR low_t<>101 OR high_t<>110
     OR duplicate_sessions<>0 THEN
    RAISE EXCEPTION 'QA failed: scores %, fastest %, earliest %, latest %, duplicate %',
      scores,fastest,low_t,high_t,duplicate_sessions;
  END IF;
  RAISE NOTICE 'STAGING_ARCADE_SYNTHETIC_ROLLBACK_PASS scores=100 fastest=10 min=101 max=110';
END $$;
ROLLBACK;
