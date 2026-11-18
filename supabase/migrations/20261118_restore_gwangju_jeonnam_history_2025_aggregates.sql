-- Replays the already executed 2026-11-18 restoration.
-- Historical surveys remain separated by sido_standard='광주' and '전남'.
-- Only pre-existing approved 2023/24 percentiles and owner-attested 2025
-- aggregated score percentiles are included; NEVER raw response text/choices.
--
-- Scope expected: 425 school-years from 2023/24, 78 school-years from 2025.
-- 2025 published percentiles must exactly match the earlier 1294 public
-- school values when recomputed from the deduplicated 1458-school source.
DO $$
DECLARE source_count integer;
BEGIN
 SELECT count(*) INTO source_count
 FROM public.beagu_level_data d JOIN public.schools s USING(school_id)
 WHERE s.sido_standard IN('광주','전남')
   AND d.access_level=1 AND d.survey_year IN(2023,2024)
   AND d.release_status='approved'
   AND d.summary->'public_release_v1'->>'release_format'='HISTORICAL_PERCENTILE_ONLY'
   AND d.summary->'public_release_v1'->>'source_percentile'
       ~ '^(100|[1-9]?[0-9])(\\.[0-9]{1,4})?$';
 IF source_count<>425 THEN RAISE EXCEPTION '2023/24 source changed: %',source_count; END IF;
END $$;

INSERT INTO public.beagu_school_report_yearly
(school_id,survey_year,percentile,publication_status,privacy_reviewed,
source_status,source_version,updated_at)
SELECT d.school_id,d.survey_year,
(d.summary->'public_release_v1'->>'source_percentile')::numeric,
'PUBLISHED',TRUE,'VERIFIED_LEGACY_RESTORATION',
'public-lv0-20261027-v1.2',now()
FROM public.beagu_level_data d JOIN public.schools s USING(school_id)
WHERE s.sido_standard IN('광주','전남') AND s.status='운영'
  AND d.access_level=1 AND d.survey_year IN(2023,2024)
  AND d.release_status='approved'
  AND d.summary->'public_release_v1'->>'release_format'='HISTORICAL_PERCENTILE_ONLY'
  AND d.summary->'public_release_v1'->>'source_percentile'
      ~ '^(100|[1-9]?[0-9])(\\.[0-9]{1,4})?$'
ON CONFLICT(school_id,survey_year) DO NOTHING;

-- The base source contains three duplicate edited-school records.
-- De-duplicate by school_id and source_row BEFORE computing PERCENT_RANK.
CREATE TEMP TABLE tmp_gjjn_2025_rank ON COMMIT DROP AS
WITH scores AS (
 SELECT DISTINCT ON (d.school_id) d.school_id,
 (r.display_values->>'research_only_2025_score')::numeric AS score
 FROM public.beagu_level_data d
 JOIN public.beagu_edited_school_rows r ON r.school_id=d.school_id AND r.survey_year=2025
 WHERE d.access_level=1 AND d.survey_year=2025 AND d.release_status='approved'
 ORDER BY d.school_id,r.source_row
)
SELECT school_id,score,ROUND((100*PERCENT_RANK() OVER (ORDER BY score))::numeric,2) AS percentile
FROM scores;

DO $$
DECLARE n integer; prior integer; targets integer;
BEGIN
 SELECT count(*) INTO n FROM tmp_gjjn_2025_rank;
 SELECT count(*) INTO prior
 FROM tmp_gjjn_2025_rank r JOIN public.beagu_2025_empirical_percentiles e USING(school_id)
 WHERE e.publication_status='PUBLISHED' AND r.percentile=e.national_percentile;
 SELECT count(*) INTO targets
 FROM tmp_gjjn_2025_rank r JOIN public.schools s USING(school_id)
 JOIN public.beagu_level_data d ON d.school_id=r.school_id AND d.survey_year=2025 AND d.access_level=1
 WHERE s.sido_standard IN('광주','전남') AND s.status='운영' AND d.respondents>=1
 AND r.score BETWEEN 0 AND 100
 AND d.summary->'quality'->'release_gate_20261027'->>'status'='APPROVED_SANITIZED_LEGACY_VIEW'
 AND d.summary->'quality'->'release_gate_20261027'->>'approved_for_public_api'='true'
 AND d.summary->'quality'->'release_gate_20261027'->>'public_approval_scope'='ONLY_PUBLIC_RELEASE_V1_WHITELIST'
 AND d.summary->'public_release_v1'->>'release_format'='DOMAIN_AGGREGATES_ONLY';
 IF n<>1458 OR prior<1294 OR targets<>78 THEN
   RAISE EXCEPTION '2025 source mismatch; total % previous identical % target %',n,prior,targets;
 END IF;
END $$;

INSERT INTO public.beagu_2025_empirical_percentiles
(school_id,survey_year,national_percentile,reference_school_count,
 calculation_method,source_status,publication_status,updated_at)
SELECT r.school_id,2025,r.percentile,1458,'PERCENT_RANK_2025_8_DOMAIN_MEAN',
 'VETTED_LEGACY_2025','PUBLISHED',now()
FROM tmp_gjjn_2025_rank r JOIN public.schools s USING(school_id)
JOIN public.beagu_level_data d ON d.school_id=r.school_id AND d.survey_year=2025 AND d.access_level=1
WHERE s.sido_standard IN('광주','전남') AND s.status='운영' AND d.respondents>=1
AND d.summary->'quality'->'release_gate_20261027'->>'approved_for_public_api'='true'
AND d.summary->'public_release_v1'->>'release_format'='DOMAIN_AGGREGATES_ONLY'
ON CONFLICT(school_id) DO NOTHING;

INSERT INTO public.beagu_school_report_yearly
(school_id,survey_year,percentile,publication_status,privacy_reviewed,
 source_status,source_version,legacy_2025_eight_domain_mean,
 percentile_method,release_evidence,updated_at)
SELECT r.school_id,2025,r.percentile,'PUBLISHED',FALSE,
'VETTED_2025_EMPIRICAL_PERCENTILE','public-lv0-20261031-v1.3-empirical-2025',
ROUND(r.score,3),'PERCENT_RANK_2025_8_DOMAIN_MEAN_N1458',
'2026-11-18: owner attests prior consent for one-response aggregates; matching 1294 published ranks exactly; no raw teacher choices or free text',now()
FROM tmp_gjjn_2025_rank r JOIN public.schools s USING(school_id)
JOIN public.beagu_2025_empirical_percentiles e USING(school_id)
WHERE s.sido_standard IN('광주','전남') AND e.publication_status='PUBLISHED'
ON CONFLICT(school_id,survey_year) DO NOTHING;
