-- STAGE38 REAL STAGING SQL REGRESSION
-- Isolated test project ycwuugggqbunlbwuzvbx only.
-- NEVER execute against production snvzwrexuqavnfvzgxqj.
-- All hashes, users, school visits and scores below are fictional, rolled back.
-- Existing staging level sessions are not deleted, modified, or assumed absent;
-- assert the baseline active-Lv1 count plus exactly one synthetic session.
BEGIN;
DO $guard$
DECLARE baseline jsonb;
BEGIN
 IF (SELECT count(*) FROM beagu_private.participants)<>0
   OR (SELECT count(*) FROM beagu_private.school_view_daily)<>0
   OR (SELECT count(*) FROM beagu_private.school_view_admin_exclusions)<>0
   OR (SELECT count(*) FROM public.school_search_events)<>0
   OR (SELECT count(*) FROM public.arcade_game_sessions)<>0
   OR (SELECT count(*) FROM public.arcade_game_scores)<>0
   OR (SELECT count(*) FROM beagu_private.visits)<>0
 THEN RAISE EXCEPTION 'Refuse synthetic test against nonempty staging baseline'; END IF;
 IF has_function_privilege('anon','public.beagu_admin_dashboard_v1(text)','EXECUTE')
   OR has_function_privilege('authenticated','public.beagu_admin_dashboard_v1(text)','EXECUTE')
   OR NOT has_function_privilege('service_role','public.beagu_admin_dashboard_v1(text)','EXECUTE')
 THEN RAISE EXCEPTION 'Dashboard RPC access privilege regression'; END IF;
 PERFORM set_config('stage38.level1_baseline', (SELECT count(*) FROM public.beagu_level_sessions WHERE access_level=1 AND expires_at>now())::text, true);
 FOR baseline IN SELECT public.beagu_admin_dashboard_v1('7d') LOOP
   IF (baseline->'site'->>'page_views')::int<>0
     OR (baseline->'search'->>'searches')::int<>0
     OR (baseline->'school_views'->>'total')::int<>0
     OR jsonb_array_length(baseline->'games')<>0
   THEN RAISE EXCEPTION 'Empty staging unexpectedly has dashboard traffic'; END IF;
 END LOOP;
END $guard$;

INSERT INTO beagu_private.visits(event_id,visitor_id,page)
VALUES ('00000000-0000-4000-8000-000000000181','00000000-0000-4000-8000-000000000038','index'),
       ('00000000-0000-4000-8000-000000000182','00000000-0000-4000-8000-000000000039','result');
INSERT INTO public.school_search_events(action_id,school_id,event_type,viewer_level,source_page)
VALUES
 ('00000000-0000-4000-8000-000000000201','STAGE38-FICTIONAL-001','search_confirmed',1,'search-lv1'),
 ('00000000-0000-4000-8000-000000000202','STAGE38-FICTIONAL-001','school_selected',1,'result'),
 ('00000000-0000-4000-8000-000000000203','STAGE38-FICTIONAL-001','detail_viewed',1,'school-report');

INSERT INTO beagu_private.school_view_admin_exclusions(visitor_digest)
VALUES (repeat('a',64));
INSERT INTO beagu_private.school_view_daily(school_id,visitor_digest,view_day)
VALUES ('STAGE38-FICTIONAL-001',repeat('a',64),(now() at time zone 'Asia/Seoul')::date),
       ('STAGE38-FICTIONAL-001',repeat('b',64),(now() at time zone 'Asia/Seoul')::date);

INSERT INTO public.arcade_game_sessions
  (id,game,ip_hash,school_id,school_name,difficulty,started_at,submitted_at)
VALUES
 ('00000000-0000-4000-8000-000000000301','volleyball',repeat('f',64),
  'STAGE38-FICTIONAL-001','가상시험초등학교','normal',now()-interval '2 minutes',now()),
 ('00000000-0000-4000-8000-000000000302','teacher_run',repeat('e',64),
  'STAGE38-FICTIONAL-001','가상시험초등학교','hard',now()-interval '1 minute',NULL);
INSERT INTO public.arcade_game_scores(session_id,game,score,school_id,school_name,difficulty)
VALUES ('00000000-0000-4000-8000-000000000301','volleyball',275,
'STAGE38-FICTIONAL-001','가상시험초등학교','normal');

INSERT INTO beagu_private.participants(campaign,visitor_id,participant_no)
VALUES ('2026','00000000-0000-4000-8000-000000000038',3801);
INSERT INTO public.beagu_level_sessions(token_sha256,access_level,expires_at)
VALUES (repeat('d',64),1,now()+interval '1 day');

SET LOCAL ROLE service_role;
DO $test$
DECLARE d jsonb; all_d jsonb;
BEGIN
 d:=public.beagu_admin_dashboard_v1('7d');
 IF (d->'site'->>'page_views')::int<>2
   OR (d->'site'->>'estimated_unique_visitors')::int<>2
   OR (d->'search'->>'all_events')::int<>3
   OR (d->'search'->>'searches')::int<>1
   OR (d->'search'->>'school_selections')::int<>1
   OR (d->'search'->>'detail_entries')::int<>1
   OR (d->'search'->>'conversion_rate')::numeric<>100.0
   OR (d->'school_views'->>'total')::int<>1
   OR (d->'challenge'->>'participants')::int<>1
   OR (d->'levels'->>'level_1_sessions')::int<>(current_setting('stage38.level1_baseline'))::int+1
 THEN RAISE EXCEPTION 'Dashboard aggregate counts failed: %',d; END IF;
 IF jsonb_array_length(d->'games')<>2
   OR jsonb_array_length(d->'game_trend')<>1
   OR jsonb_array_length(d->'game_difficulty')<>2
   OR jsonb_array_length(d->'top_searched')<>1
   OR jsonb_array_length(d->'top_selected')<>1
   OR jsonb_array_length(d->'top_detailed')<>1
 THEN RAISE EXCEPTION 'Dashboard game/search distribution failed: %',d; END IF;
 IF (SELECT count(*) FROM public.arcade_game_scores)<>1
 THEN RAISE EXCEPTION 'Isolated game score aggregate source not populated'; END IF;
 IF d::text LIKE '%'||repeat('f',64)||'%'
   OR d::text LIKE '%'||repeat('a',64)||'%'
   OR d::text LIKE '%00000000-0000-4000%'
 THEN RAISE EXCEPTION 'Dashboard leaked internal session or visitor ID'; END IF;
 IF (d->'visual_novel'->'plays') IS DISTINCT FROM 'null'::jsonb
   OR (d->'site'->'active_registered_users') IS DISTINCT FROM 'null'::jsonb
 THEN RAISE EXCEPTION 'Uncollected metrics not represented as null'; END IF;
 all_d:=public.beagu_admin_dashboard_v1('all');
 IF (all_d->'site'->>'page_views')::int<>2
 THEN RAISE EXCEPTION 'All-period aggregate wrong'; END IF;
 BEGIN
   PERFORM public.beagu_admin_dashboard_v1('invalid');
   RAISE EXCEPTION 'Invalid period accepted';
 EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
 END;
END $test$;
RESET ROLE;

SET LOCAL ROLE anon;
DO $denied$
BEGIN
 BEGIN
   PERFORM public.beagu_admin_dashboard_v1('7d');
   RAISE EXCEPTION 'Anonymous caller reached administrator dashboard';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
   PERFORM 1 FROM public.arcade_game_scores LIMIT 1;
   RAISE EXCEPTION 'Anonymous caller could read game scores';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $denied$;
RESET ROLE;
ROLLBACK;
-- A clean run has no exception and leaves no synthetic telemetry or game data.
