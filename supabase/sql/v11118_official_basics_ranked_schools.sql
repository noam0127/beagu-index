-- Reviewed candidate SQL; do not apply directly to production during development.
BEGIN;
CREATE OR REPLACE FUNCTION public.beagu_official_count_v1(v jsonb, ceiling integer)
RETURNS numeric LANGUAGE sql IMMUTABLE STRICT SECURITY INVOKER SET search_path='' AS $$
 SELECT CASE WHEN jsonb_typeof(v)='number' THEN
  CASE WHEN (v#>>'{}')::numeric BETWEEN 0 AND ceiling AND trunc((v#>>'{}')::numeric)=(v#>>'{}')::numeric
   THEN (v#>>'{}')::numeric END END;
$$;
REVOKE ALL ON FUNCTION public.beagu_official_count_v1(jsonb,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.beagu_official_count_v1(jsonb,integer) TO service_role;
CREATE OR REPLACE FUNCTION public.beagu_official_basics_ranked_schools_v1(
 p_keyword text,p_region text,p_office text,p_sort text,p_direction text,p_page integer
) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $fn$
WITH candidates AS MATERIALIZED (
 SELECT school_id,school_name,sido,sido_standard,support_office,address,establishment,school_kind,status,
 beagu_percentile_2025,student_count,student_reference_year,junior_teacher_ratio,male_teacher_ratio,view_count,housing_price_won
 FROM public.beagu_lv1_school_sort_index
 WHERE p_sort IN ('student_count','male_teacher_ratio','junior_teacher_ratio')
 AND p_direction IN ('asc','desc') AND p_page BETWEEN 0 AND 500
 AND (p_keyword<>'' OR p_region<>'') AND (p_region<>'' OR p_office='')
 AND (p_keyword='' OR school_name ILIKE '%'||translate(p_keyword,E'%_\\','')||'%')
 AND (p_region='' OR sido_standard=p_region) AND (p_office='' OR support_office=p_office)
), profiles AS (
 SELECT c.school_id,p.profile j,p.teacher_total staff,p.profile->'elementary_certified_counts' q
 FROM candidates c JOIN public.beagu_2026_official_school_profiles p USING(school_id)
 WHERE p.source_year=2026 AND p.disclosure_code ~ '^S[0-9]{9}$'
 AND p.profile->>'closed'='N' AND p.profile->>'suspended'='N'
 AND jsonb_typeof(p.profile->'school_name')='string' AND length(p.profile->>'school_name') BETWEEN 1 AND 1500
 AND p.profile->>'school_name' !~ '[<>[:cntrl:]]'
), counts AS (
 SELECT p.*,public.beagu_official_count_v1(j->'teacher_total',10000) t,
 public.beagu_official_count_v1(j->'male_teachers',10000) m,
 public.beagu_official_count_v1(j->'female_teachers',10000) f,
 public.beagu_official_count_v1(j->'second_grade_teachers',10000) legacy_second,
 public.beagu_official_count_v1(q->'first_male',10000) fm,
 public.beagu_official_count_v1(q->'first_female',10000) ff,
 public.beagu_official_count_v1(q->'first_total',10000) ft,
 public.beagu_official_count_v1(q->'second_male',10000) sm,
 public.beagu_official_count_v1(q->'second_female',10000) sf,
 public.beagu_official_count_v1(q->'second_total',10000) st,
 public.beagu_official_count_v1(q->'associate_male',10000) am,
 public.beagu_official_count_v1(q->'associate_female',10000) af,
 public.beagu_official_count_v1(q->'associate_total',10000) at
 FROM profiles p
), official AS (
 SELECT school_id,
 CASE WHEN j->'student_reference_year'='2026'::jsonb THEN public.beagu_official_count_v1(j->'student_count',100000) END students,
 CASE WHEN t=staff AND m+f=t AND t>0 THEN
  CASE WHEN j ? 'elementary_certified_counts' THEN
   CASE WHEN q->'source_year'='2026'::jsonb AND q->>'basis'='REPORTED_1_2_ASSOCIATE'
    AND fm+ff=ft AND sm+sf=st AND am+af=at
    AND ft+st+at BETWEEN 1 AND t AND fm+sm+am<=m AND ff+sf+af<=f
    THEN round((fm+sm+am)*100/nullif(ft+st+at,0),2) END
   WHEN j->>'ratio_basis'='ELEMENTARY_TEACHER_CERTIFIED' THEN round(m*100/nullif(t,0),2) END END male_ratio,
 CASE WHEN t=staff AND m+f=t AND t>0 THEN
  CASE WHEN j ? 'elementary_certified_counts' THEN
   CASE WHEN q->'source_year'='2026'::jsonb AND q->>'basis'='REPORTED_1_2_ASSOCIATE'
    AND fm+ff=ft AND sm+sf=st AND am+af=at
    AND ft+st+at BETWEEN 1 AND t AND fm+sm+am<=m AND ff+sf+af<=f
    THEN round(st*100/nullif(ft+st+at,0),2) END
   WHEN j->>'ratio_basis'='ELEMENTARY_TEACHER_CERTIFIED' AND legacy_second<=t THEN round(legacy_second*100/nullif(t,0),2) END END junior_ratio
 FROM counts
), effective AS (
 SELECT c.school_id,c.school_name,c.sido,c.sido_standard,c.support_office,c.address,c.establishment,c.school_kind,c.status,
 c.beagu_percentile_2025,c.view_count,c.housing_price_won,true AS official_basics_ranked,
 coalesce(o.students,CASE WHEN c.student_count BETWEEN 0 AND 100000 THEN c.student_count END) student_count,
 CASE WHEN o.students IS NOT NULL THEN 2026 ELSE c.student_reference_year END student_reference_year,
 coalesce(o.male_ratio,CASE WHEN c.male_teacher_ratio BETWEEN 0 AND 100 THEN round(c.male_teacher_ratio::numeric,2) END) male_teacher_ratio,
 CASE WHEN o.male_ratio IS NOT NULL THEN 2026 ELSE 2024 END male_teacher_reference_year,
 coalesce(o.junior_ratio,CASE WHEN c.junior_teacher_ratio BETWEEN 0 AND 100 THEN round(c.junior_teacher_ratio::numeric,2) END) junior_teacher_ratio,
 CASE WHEN o.junior_ratio IS NOT NULL THEN 2026 ELSE 2024 END junior_teacher_reference_year
 FROM candidates c LEFT JOIN official o USING(school_id)
), metrics AS (
 SELECT e.*,CASE p_sort WHEN 'student_count' THEN student_count WHEN 'male_teacher_ratio' THEN male_teacher_ratio WHEN 'junior_teacher_ratio' THEN junior_teacher_ratio END sort_value FROM effective e
), ranked AS (
 SELECT m.*,row_number() OVER (ORDER BY CASE WHEN p_direction='asc' THEN sort_value END ASC NULLS LAST,
 CASE WHEN p_direction='desc' THEN sort_value END DESC NULLS LAST,school_name ASC,school_id ASC) rank_no FROM metrics m
)
SELECT jsonb_build_object('total',(SELECT count(*) FROM candidates),'schools',coalesce(
 (SELECT jsonb_agg(to_jsonb(r)-'rank_no'-'sort_value' ORDER BY rank_no) FROM ranked r WHERE rank_no>p_page*20 AND rank_no<=p_page*20+20),'[]'::jsonb));
$fn$;
REVOKE ALL ON FUNCTION public.beagu_official_basics_ranked_schools_v1(text,text,text,text,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.beagu_official_basics_ranked_schools_v1(text,text,text,text,text,integer) TO service_role;
COMMIT;
