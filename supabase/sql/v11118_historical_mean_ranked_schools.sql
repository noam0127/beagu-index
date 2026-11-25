-- Candidate SQL, apply only through a reviewed release; no production changes made.
-- Reuse the signed-session API and existing shared 2026 release gate. Never expose survey counts.
BEGIN;
CREATE OR REPLACE FUNCTION public.beagu_historical_mean_ranked_schools_v1(
 p_keyword text, p_region text, p_office text, p_direction text, p_page integer
) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $fn$
 WITH candidates AS MATERIALIZED (
  SELECT school_id,school_name,sido,sido_standard,support_office,address,establishment,school_kind,status,
   beagu_percentile_2025,student_count,student_reference_year,junior_teacher_ratio,male_teacher_ratio,view_count,housing_price_won
  FROM public.beagu_lv1_school_sort_index
  WHERE p_direction IN ('asc','desc') AND p_page BETWEEN 0 AND 500
   AND (p_keyword<>'' OR p_region<>'') AND (p_region<>'' OR p_office='')
   AND (p_keyword='' OR school_name ILIKE '%'||translate(p_keyword,E'%_\\','')||'%')
   AND (p_region='' OR sido_standard=p_region)
   AND (p_office='' OR support_office=p_office)
 ), numbered AS (
  SELECT school_id,(row_number() OVER (ORDER BY school_id)-1)/20 AS batch FROM candidates
 ), batches AS (
  SELECT array_agg(school_id ORDER BY school_id) AS ids FROM numbered GROUP BY batch
 ), approved_active AS MATERIALIZED (
  SELECT EXISTS(SELECT 1 FROM public.beagu_edited_school_rows WHERE survey_year=2026
    AND source_tab='2026 최종 편집본' AND release_status='APPROVED') AS active
 ), shared_release AS MATERIALIZED (
  SELECT b.ids,public.beagu_2026_edited_read_v1(b.ids,1) AS lv1,
   public.beagu_2026_edited_read_v1(b.ids,2) AS lv2
  FROM batches b CROSS JOIN approved_active a WHERE a.active
 ), common_values AS (
  SELECT i.school_id, CASE
    WHEN jsonb_typeof(r.lv1->'schools'->i.school_id->'percentile')='number'
     AND r.lv1->'schools'->i.school_id->'percentile'=r.lv2->'schools'->i.school_id->'percentile'
    THEN (r.lv1->'schools'->i.school_id->>'percentile')::numeric END AS percentile
  FROM shared_release r CROSS JOIN LATERAL unnest(r.ids) AS i(school_id)
  WHERE r.lv1->>'active'='true' AND r.lv2->>'active'='true'
 ), historic AS (
  SELECT h.school_id,h.survey_year,max(h.percentile) AS percentile
  FROM public.beagu_school_report_yearly h JOIN candidates c USING(school_id)
  WHERE h.survey_year IN (2023,2024,2025) AND h.publication_status='PUBLISHED'
   AND h.percentile BETWEEN 0 AND 100
  GROUP BY h.school_id,h.survey_year
 ), eligible AS (
  SELECT school_id,percentile FROM historic
  UNION ALL SELECT school_id,percentile FROM common_values WHERE percentile BETWEEN 0 AND 100
 ), means AS (
  SELECT school_id,avg(percentile) AS historical_mean FROM eligible GROUP BY school_id
 ), ranked AS (
  SELECT c.*,m.historical_mean,row_number() OVER (
    ORDER BY CASE WHEN p_direction='asc' THEN m.historical_mean END ASC NULLS LAST,
     CASE WHEN p_direction='desc' THEN m.historical_mean END DESC NULLS LAST,
     c.school_name ASC,c.school_id ASC
  ) AS rank_no
  FROM candidates c LEFT JOIN means m USING(school_id)
 )
 SELECT jsonb_build_object('total',(SELECT count(*) FROM candidates),
  'schools',coalesce((SELECT jsonb_agg(to_jsonb(r)-'rank_no' ORDER BY rank_no)
    FROM ranked r WHERE rank_no>p_page*20 AND rank_no<=p_page*20+20),'[]'::jsonb));
$fn$;
REVOKE ALL ON FUNCTION public.beagu_historical_mean_ranked_schools_v1(text,text,text,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.beagu_historical_mean_ranked_schools_v1(text,text,text,text,integer) TO service_role;
COMMIT;
