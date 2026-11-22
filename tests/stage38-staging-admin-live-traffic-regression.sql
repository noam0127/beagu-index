-- Stage38 isolated staging: ycwuugggqbunlbwuzvbx ONLY.
-- Never execute against production snvzwrexuqavnfvzgxqj.
-- Synthetic visit and live-presence events are rolled back.
BEGIN;
DO $preflight$
BEGIN
 IF (SELECT count(*) FROM beagu_private.visits) <> 0 OR
    (SELECT count(*) FROM beagu_private.beagu_live_presence_v1) <> 0 THEN
    RAISE EXCEPTION 'Nonempty staging telemetry tables; refuse synthetic empty-baseline test';
 END IF;
 IF has_table_privilege('anon','beagu_private.visits','SELECT') OR
    has_table_privilege('anon','beagu_private.visits','INSERT') OR
    has_table_privilege('authenticated','beagu_private.visits','SELECT') OR
    has_table_privilege('authenticated','beagu_private.visits','INSERT') THEN
    RAISE EXCEPTION 'Private visits table exposed to public roles';
 END IF;
 IF has_function_privilege('anon','public.beagu_admin_live_traffic_v1(text)','EXECUTE') OR
    has_function_privilege('authenticated','public.beagu_admin_live_traffic_v1(text)','EXECUTE') OR
    NOT has_function_privilege('service_role','public.beagu_admin_live_traffic_v1(text)','EXECUTE') THEN
    RAISE EXCEPTION 'Live-traffic RPC permission regression';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='beagu_private.visits'::regclass
     AND tgname='beagu_skip_admin_visit' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'Original admin-visit exclusion trigger absent';
 END IF;
END $preflight$;
INSERT INTO beagu_private.visits(event_id,visitor_id,page)
VALUES
 ('00000000-0000-4000-8000-000000000181','00000000-0000-4000-8000-000000000038','index'),
 ('00000000-0000-4000-8000-000000000182','00000000-0000-4000-8000-000000000039','result'),
 ('00000000-0000-4000-8000-000000000183','00000000-0000-4000-8000-000000000039','challenge');
INSERT INTO beagu_private.visits(event_id,visitor_id,page,visited_at,visit_day)
VALUES
 ('00000000-0000-4000-8000-000000000184','00000000-0000-4000-8000-000000000040','index',
  now()-interval '9 days',(now() at time zone 'Asia/Seoul')::date-9);
SET LOCAL ROLE service_role;
SELECT public.beagu_presence_ping_v1('00000000-0000-4000-8000-000000000038','index');
SELECT public.beagu_presence_ping_v1('00000000-0000-4000-8000-000000000039','result');
RESET ROLE;
DO $regression$
DECLARE today jsonb; last_week jsonb; all_time jsonb;
 today_sum bigint; week_sum bigint; total_sum bigint; active bigint;
 BEGIN
  today:=public.beagu_admin_live_traffic_v1('today');
  last_week:=public.beagu_admin_live_traffic_v1('7d');
  all_time:=public.beagu_admin_live_traffic_v1('all');
  SELECT COALESCE(sum((e->>'views')::bigint),0) INTO today_sum
    FROM jsonb_array_elements(today->'hourly_visits') e;
  SELECT COALESCE(sum((e->>'views')::bigint),0) INTO week_sum
    FROM jsonb_array_elements(last_week->'hourly_visits') e;
  SELECT COALESCE(sum((e->>'views')::bigint),0) INTO total_sum
    FROM jsonb_array_elements(all_time->'hourly_visits') e;
  active:=(today->>'active_browsers_5m')::bigint;
  IF today_sum<>3 OR week_sum<>3 OR total_sum<>4
   THEN RAISE EXCEPTION 'Incorrect period aggregation: today=%,7d=%,all=%',today_sum,week_sum,total_sum; END IF;
  IF active<>2 OR jsonb_array_length(today->'active_by_page')<>2
   THEN RAISE EXCEPTION 'Active presence summary invalid: %',today; END IF;
  IF jsonb_array_length(today->'hourly_visits')<>24
   THEN RAISE EXCEPTION 'Hourly bar chart slots not exactly 24'; END IF;
  IF today ? 'visitor_id' OR today ? 'event_id'
   THEN RAISE EXCEPTION 'Identifiers exposed in live aggregate'; END IF;
  BEGIN
    PERFORM public.beagu_admin_live_traffic_v1('invalid-window');
    RAISE EXCEPTION 'Invalid period unexpectedly accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
END $regression$;
SET LOCAL ROLE anon;
DO $unauthorized$
BEGIN
 BEGIN
  PERFORM public.beagu_admin_live_traffic_v1('today');
  RAISE EXCEPTION 'Anonymous caller reached service-only live traffic aggregate';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $unauthorized$;
RESET ROLE;
ROLLBACK;
-- PASS when no exception; no lasting visit or presence rows.
