-- Disposable fixture only. No production connection.
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
CREATE TABLE public.beagu_lv1_school_sort_index (
 school_id text PRIMARY KEY,school_name text,sido text,sido_standard text,support_office text,address text,establishment text,school_kind text,status text,
 beagu_percentile_2025 numeric,student_count numeric,student_reference_year smallint,junior_teacher_ratio numeric,male_teacher_ratio numeric,view_count bigint,housing_price_won numeric
);
INSERT INTO public.beagu_lv1_school_sort_index(school_id,school_name,sido,sido_standard,support_office,status)
SELECT 'T'||lpad(i::text,6,'0'),'School '||lpad(i::text,3,'0'),'부산','부산','동부','운영' FROM generate_series(1,45)i;
CREATE TABLE public.beagu_school_report_yearly(school_id text,survey_year int,percentile numeric,publication_status text);
INSERT INTO public.beagu_school_report_yearly VALUES
 ('T000001',2023,100,'PUBLISHED'),('T000001',2025,0,'PUBLISHED'),('T000002',2025,90,'PUBLISHED'),
 ('T000003',2023,0,'PUBLISHED'),('T000006',2024,100,'REVIEW_PENDING');
CREATE TABLE public.beagu_edited_school_rows(school_id text,survey_year int,source_tab text,release_status text,tier int,percentile numeric);
INSERT INTO public.beagu_edited_school_rows VALUES
 ('T000001',2026,'2026 최종 편집본','APPROVED',1,100),('T000001',2026,'2026 최종 편집본','APPROVED',2,100),
 ('T000002',2026,'2026 최종 편집본','APPROVED',1,1),('T000002',2026,'2026 최종 편집본','APPROVED',2,2),
 ('T000005',2026,'2026 최종 편집본','APPROVED',1,80),('T000005',2026,'2026 최종 편집본','APPROVED',2,80),
 ('T000006',2026,'2026 최종 편집본','APPROVED',2,99);
CREATE FUNCTION public.beagu_2026_edited_read_v1(p_ids text[],p_level int) RETURNS jsonb
 LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object('active',true,'schools',coalesce(jsonb_object_agg(school_id,jsonb_build_object('percentile',percentile)),'{}'::jsonb))
 FROM public.beagu_edited_school_rows WHERE school_id=ANY(p_ids) AND tier=p_level AND cardinality(p_ids) BETWEEN 1 AND 20 AND release_status='APPROVED';
 $$;
GRANT SELECT ON public.beagu_lv1_school_sort_index,public.beagu_school_report_yearly,public.beagu_edited_school_rows TO service_role;
