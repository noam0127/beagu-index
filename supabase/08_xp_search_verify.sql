-- READ-ONLY checks after running 08_xp_search_install.sql.
SELECT public.beagu_get_challenge_progress() AS issued_challenge_max_for_2026;
SELECT count(*) AS events_total,
       count(DISTINCT action_id) AS unique_actions,
       min(searched_at) AS first_event_at, max(searched_at) AS latest_event_at
FROM public.school_search_events;
SELECT event_type,viewer_level,source_page,count(*) AS event_count
FROM public.school_search_events
GROUP BY event_type,viewer_level,source_page
ORDER BY event_type,viewer_level,source_page;
SELECT c.relname,c.relrowsecurity
FROM pg_catalog.pg_class c
WHERE c.oid IN ('public.school_search_events'::regclass,
  'beagu_private.school_search_limits'::regclass,
  'beagu_private.school_search_settings'::regclass);
SELECT has_table_privilege('anon','public.school_search_events','SELECT') AS anon_can_read_logs,
       has_table_privilege('anon','public.school_search_events','INSERT') AS anon_can_insert_directly,
       has_function_privilege('anon','public.beagu_log_school_search(text,text,smallint,text,uuid,uuid)','EXECUTE') AS anon_can_call_limited_rpc;
-- Expect: anon_can_read_logs=false, anon_can_insert_directly=false, anon_can_call_limited_rpc=true.
-- Manual: type into a search box -> no new rows. Press Enter with exactly 1
-- result -> search_confirmed. Click a card -> school_selected; Lv1/2 approved
-- render / Lv0 current report -> detail_viewed. All other cases remain absent.
