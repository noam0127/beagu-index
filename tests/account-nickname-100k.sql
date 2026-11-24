\set ON_ERROR_STOP on
\timing on
-- Disposable DB only. No production users, data or credentials.
CREATE TEMP TABLE fixture_clock AS SELECT '2026-11-23 00:00:00+09'::timestamptz AS monday;
INSERT INTO beagu_private.beagu_account_nickname_members_v1(visitor_id)
 SELECT md5('synthetic-member-'||i)::uuid FROM generate_series(1,100000) i;
CREATE TEMP TABLE batch_measure(stage text, n integer, ms numeric);
CREATE FUNCTION pg_temp.measure_batch(p_stage text,p_at timestamptz) RETURNS void LANGUAGE plpgsql AS $$
DECLARE t timestamptz:=clock_timestamp(); n integer;
BEGIN
 n:=beagu_private.beagu_account_prepare_nicknames_v1(p_at,500);
 INSERT INTO batch_measure VALUES(p_stage,n,extract(epoch FROM clock_timestamp()-t)*1000);
 IF n<>500 THEN RAISE EXCEPTION 'unexpected batch %',n; END IF;
END $$;
-- Each generated statement is a separate transaction, just like the scheduled worker.
SELECT format('SELECT pg_temp.measure_batch(%L,%L::timestamptz);','initial',monday) FROM fixture_clock CROSS JOIN generate_series(1,200) \gexec
DO $$
DECLARE t timestamptz; b timestamptz; n bigint; missing bigint; same bigint;
BEGIN
 SELECT monday INTO b FROM fixture_clock;
 IF (SELECT count(*) FROM beagu_private.beagu_account_nickname_members_v1)<>100000 OR (SELECT count(*) FROM beagu_private.beagu_account_nicknames_v1)<>200000 THEN RAISE EXCEPTION 'population mismatch'; END IF;
 IF (SELECT count(DISTINCT nickname) FROM beagu_private.beagu_account_nicknames_v1)<>200000 THEN RAISE EXCEPTION 'collision'; END IF;
 t:=clock_timestamp();
 SELECT count(*),count(*) FILTER(WHERE a IS NULL OR z IS NULL),count(*) FILTER(WHERE a=z)
 INTO n,missing,same FROM (SELECT beagu_private.beagu_account_alias_at_v1(visitor_id,b+interval '7 days'-interval '1 microsecond') a,
 beagu_private.beagu_account_alias_at_v1(visitor_id,b+interval '7 days') z FROM beagu_private.beagu_account_nickname_members_v1) q;
 IF n<>100000 OR missing<>0 OR same<>0 THEN RAISE EXCEPTION 'boundary mismatch % % %',n,missing,same; END IF;
 RAISE NOTICE 'PASS 100000 member exact KST boundary (full two-week lookup ms=%)',round(extract(epoch FROM clock_timestamp()-t)*1000);
 IF beagu_private.beagu_account_prepare_nicknames_v1(b,500)<>0 THEN RAISE EXCEPTION 'repeat changed already prepared members'; END IF;
END $$;
SELECT format('SELECT pg_temp.measure_batch(%L,%L::timestamptz);','next',monday+interval '7 days') FROM fixture_clock CROSS JOIN generate_series(1,200) \gexec
DO $$
DECLARE b timestamptz;
BEGIN
 SELECT monday INTO b FROM fixture_clock;
 IF (SELECT count(*) FROM beagu_private.beagu_account_nicknames_v1)<>300000 OR (SELECT count(DISTINCT nickname) FROM beagu_private.beagu_account_nicknames_v1)<>300000 THEN RAISE EXCEPTION 'third week collision or incomplete'; END IF;
 IF beagu_private.beagu_account_prepare_nicknames_v1(b+interval '7 days',500)<>0 THEN RAISE EXCEPTION 'retry not idempotent'; END IF;
 IF has_table_privilege('anon','beagu_private.beagu_account_nicknames_v1','select') OR has_table_privilege('authenticated','beagu_private.beagu_account_nicknames_v1','select') OR has_function_privilege('authenticated','beagu_private.beagu_account_alias_at_v1(uuid,timestamptz)','execute') OR has_function_privilege('anon','public.beagu_account_postit_current_aliases_v1(jsonb)','execute') THEN RAISE EXCEPTION 'history exposed'; END IF;
END $$;
SELECT format('SELECT beagu_private.beagu_account_prune_nicknames_v1(%L::timestamptz,1000);',monday+interval '14 days') FROM fixture_clock CROSS JOIN generate_series(1,100) \gexec
DO $$
BEGIN
 IF (SELECT count(*) FROM beagu_private.beagu_account_nicknames_v1)<>200000 THEN RAISE EXCEPTION 'pruning failed'; END IF;
 RAISE NOTICE 'PASS 100000 offline members, simultaneous switch, three-week uniqueness, idempotence, private history and bounded pruning';
END $$;
SELECT stage,count(*) batches,sum(n) members,round(sum(ms),1) total_ms,round(max(ms),1) max_batch_ms,round(percentile_cont(.95) WITHIN GROUP (ORDER BY ms)::numeric,1) p95_batch_ms FROM batch_measure GROUP BY stage ORDER BY stage;
SELECT pg_size_pretty(pg_total_relation_size('beagu_private.beagu_account_nickname_members_v1')+pg_total_relation_size('beagu_private.beagu_account_nicknames_v1')) AS alias_storage_after_prune;
