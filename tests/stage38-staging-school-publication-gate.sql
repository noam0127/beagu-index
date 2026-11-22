-- Stage38 isolated staging school visibility regression; no persistent rows.
-- Never run on production. All fixture records are synthetic and rolled back.
BEGIN;
INSERT INTO public.schools(school_id,school_name,sido,status)
VALUES('STG0038','STAGE38_SYNTHETIC_SCHOOL','TEST','운영');
INSERT INTO public.beagu_2025_empirical_percentiles(school_id,national_percentile,reference_school_count,publication_status)
VALUES('STG0038',73,10,'PENDING');
INSERT INTO public.beagu_school_report_official_facts(school_id,survey_year,fact_key,label,fact_value,source_ref,review_status,source_year)
VALUES('STG0038',2025,'students','Synthetic students',123,'STAGING_ONLY','PENDING',2025);
DO $check$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.beagu_lv1_school_sort_index
 WHERE school_id='STG0038' AND beagu_percentile_2025 IS NULL AND student_count IS NULL)
 THEN RAISE EXCEPTION 'Unapproved data leaked'; END IF;
END $check$;
UPDATE public.beagu_2025_empirical_percentiles SET publication_status='PUBLISHED' WHERE school_id='STG0038';
UPDATE public.beagu_school_report_official_facts SET review_status='APPROVED' WHERE school_id='STG0038';
DO $check$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.beagu_lv1_school_sort_index
 WHERE school_id='STG0038' AND beagu_percentile_2025=73 AND student_count=123 AND view_count=0)
 THEN RAISE EXCEPTION 'Approved school view not working'; END IF;
END $check$;
SELECT 'PASS_PENDING_HIDDEN_APPROVED_VISIBLE' AS result;
ROLLBACK;
