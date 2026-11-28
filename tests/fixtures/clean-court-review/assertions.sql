\set ON_ERROR_STOP on
\ir review-write-baseline.sql
DO $$ BEGIN IF beagu_private.review_2026_staged_aggregates()<>3 THEN RAISE EXCEPTION 'baseline count'; END IF; END $$;
CREATE TEMP TABLE expected AS SELECT * FROM beagu_private.beagu_2026_auto_review_status;
TRUNCATE beagu_private.beagu_2026_auto_review_status;
\ir review-write-candidate.sql
DO $$ BEGIN
 IF beagu_private.review_2026_staged_aggregates()<>3 THEN RAISE EXCEPTION 'candidate count'; END IF;
 IF EXISTS ((SELECT to_jsonb(t)-'checked_at' FROM expected t EXCEPT SELECT to_jsonb(t)-'checked_at' FROM beagu_private.beagu_2026_auto_review_status t) UNION ALL (SELECT to_jsonb(t)-'checked_at' FROM beagu_private.beagu_2026_auto_review_status t EXCEPT SELECT to_jsonb(t)-'checked_at' FROM expected t)) THEN RAISE EXCEPTION 'decision mismatch'; END IF;
END $$;
CREATE TEMP TABLE before_idle AS SELECT school_id,checked_at,ctid::text AS tuple_id FROM beagu_private.beagu_2026_auto_review_status;
SELECT pg_sleep(.02);
DO $$ BEGIN
 IF beagu_private.review_2026_staged_aggregates()<>3 THEN RAISE EXCEPTION 'idle return changed'; END IF;
 IF EXISTS(SELECT 1 FROM beagu_private.beagu_2026_auto_review_status a JOIN before_idle b USING(school_id) WHERE a.checked_at<>b.checked_at OR a.ctid::text<>b.tuple_id) THEN RAISE EXCEPTION 'idle write'; END IF;
END $$;
UPDATE public.beagu_2026_results_snapshot SET source_snapshot_at=now() WHERE school_id='A';
INSERT INTO beagu_private.beagu_2026_civic_publication_hold VALUES ('B',true,now());
UPDATE beagu_private.beagu_2026_question_coverage SET updated_at=now() WHERE school_id='C' AND question_id='Q01';
SELECT pg_sleep(.02);
DO $$ BEGIN
 IF beagu_private.review_2026_staged_aggregates()<>3 THEN RAISE EXCEPTION 'freshness count'; END IF;
 IF EXISTS(SELECT 1 FROM beagu_private.beagu_2026_auto_review_status a JOIN before_idle b USING(school_id) WHERE a.checked_at<=b.checked_at) THEN RAISE EXCEPTION 'required freshness not updated'; END IF;
 IF EXISTS(SELECT 1 FROM beagu_private.beagu_2026_auto_review_status a JOIN public.beagu_2026_results_snapshot r USING(school_id) WHERE a.checked_at<r.source_snapshot_at) THEN RAISE EXCEPTION 'snapshot gate changed'; END IF;
 IF EXISTS(SELECT 1 FROM beagu_private.beagu_2026_auto_review_status a JOIN beagu_private.beagu_2026_civic_publication_hold h USING(school_id) WHERE h.active AND a.checked_at<=h.updated_at) THEN RAISE EXCEPTION 'hold gate changed'; END IF;
END $$;
UPDATE beagu_private.beagu_2026_school_coverage SET school_match_status='UNMATCHED',updated_at=now() WHERE school_id='A';
UPDATE beagu_private.beagu_2026_auto_review_status SET publication_status='APPROVED' WHERE school_id='B';
UPDATE public.beagu_2026_results_snapshot SET questions=jsonb_set(questions,'{0,invalid}','1') WHERE school_id='C';
DO $$ BEGIN
 IF beagu_private.review_2026_staged_aggregates()<>3 THEN RAISE EXCEPTION 'changed count'; END IF;
 IF NOT EXISTS(SELECT 1 FROM beagu_private.beagu_2026_auto_review_status WHERE school_id='A' AND technical_status='NEEDS_SCHOOL_CHECK') THEN RAISE EXCEPTION 'decision not updated'; END IF;
 IF EXISTS(SELECT 1 FROM beagu_private.beagu_2026_auto_review_status WHERE publication_status<>'WITHHELD') THEN RAISE EXCEPTION 'publication reset changed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM beagu_private.beagu_2026_auto_review_status WHERE school_id='C' AND 'UNRECOGNIZED_MANDATORY_ANSWER'=ANY(reasons)) THEN RAISE EXCEPTION 'invalid answer missed'; END IF;
END $$;
CREATE TEMP TABLE changed_expected AS SELECT to_jsonb(t)-'checked_at' AS v FROM beagu_private.beagu_2026_auto_review_status t;
\ir review-write-baseline.sql
DO $$ BEGIN
 IF beagu_private.review_2026_staged_aggregates()<>3 THEN RAISE EXCEPTION 'baseline changed count'; END IF;
 IF EXISTS((SELECT v FROM changed_expected EXCEPT SELECT to_jsonb(t)-'checked_at' FROM beagu_private.beagu_2026_auto_review_status t) UNION ALL (SELECT to_jsonb(t)-'checked_at' FROM beagu_private.beagu_2026_auto_review_status t EXCEPT SELECT v FROM changed_expected)) THEN RAISE EXCEPTION 'changed decision mismatch'; END IF;
END $$;
\echo PASS legacy decisions, count, no idle writes, required freshness, and publication invariants
