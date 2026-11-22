-- Stage 38 isolated staging-only regression. Synthetic fixtures are rolled back.
BEGIN;
INSERT INTO public.schools(school_id,school_name,sido,status) VALUES
('STG0038_A','SYNTHETIC_A','TEST','운영'),('STG0038_B','SYNTHETIC_B','TEST','폐교');
INSERT INTO public.beagu_2025_empirical_percentiles(school_id,national_percentile,reference_school_count,publication_status)
VALUES('STG0038_A',42,10,'PUBLISHED'),('STG0038_B',91,10,'PUBLISHED');
INSERT INTO public.beagu_school_report_official_facts(school_id,survey_year,fact_key,label,fact_value,source_ref,review_status,source_year)
VALUES('STG0038_A',2025,'students','Synthetic student count',111,'STAGING_ONLY','APPROVED',2025),
('STG0038_A',2025,'junior_teacher_ratio','Synthetic teacher ratio',32,'STAGING_ONLY','PENDING',2025),
('STG0038_A',2025,'male_teacher_ratio','Synthetic male teacher ratio',25,'STAGING_ONLY','APPROVED',2025);
INSERT INTO public.beagu_school_view_totals(school_id,views) VALUES('STG0038_A',7);
DO $check$
BEGIN
 IF (SELECT count(*) FROM public.beagu_lv1_school_sort_index WHERE school_id LIKE 'STG0038_%')<>1 THEN RAISE EXCEPTION 'Closed school leaked'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.beagu_lv1_school_sort_index WHERE school_id='STG0038_A' AND beagu_percentile_2025=42 AND student_count=111 AND junior_teacher_ratio IS NULL AND male_teacher_ratio=25 AND view_count=7) THEN RAISE EXCEPTION 'Approved/pending read model mismatch'; END IF;
 IF has_table_privilege('anon','public.beagu_lv1_school_sort_index','SELECT') OR has_table_privilege('authenticated','public.beagu_lv1_school_sort_index','SELECT') THEN RAISE EXCEPTION 'Direct client read privilege leaked'; END IF;
END $check$;
SELECT 'PASS_CLOSED_SCHOOL_HIDDEN_PENDING_FACT_HIDDEN_APPROVED_FACT_VISIBLE_VIEWS' AS result;
ROLLBACK;