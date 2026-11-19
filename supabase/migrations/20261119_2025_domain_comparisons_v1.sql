-- Reviewed 2025 domain means for Lv.1 detail comparisons.
-- Equally weighted by school (NOT a teacher-weighted mean or census).
-- Only approved eight-domain school summaries are used; exclude small groups.
-- Original respondent counts, answers and source records are never returned.
CREATE OR REPLACE VIEW public.beagu_2025_domain_comparisons_v1
WITH (security_invoker = true)
AS
WITH source AS (
 SELECT a.school_id,s.sido_standard AS region, e.item->>'label' AS domain_label,
        e.item->>'value' AS published_score, e.ord
 FROM public.beagu_level_data a
 JOIN public.schools s ON s.school_id=a.school_id
 CROSS JOIN LATERAL jsonb_array_elements(
   CASE WHEN jsonb_typeof(a.summary->'public_release_v1'->'metrics')='array'
     THEN a.summary->'public_release_v1'->'metrics' ELSE '[]'::jsonb END
 ) WITH ORDINALITY AS e(item,ord)
 WHERE a.survey_year=2025 AND a.access_level=1
   AND a.release_status='approved' AND a.respondents>=1
   AND a.summary->'quality'->'release_gate_20261027'->>'status'='APPROVED_SANITIZED_LEGACY_VIEW'
   AND a.summary->'quality'->'release_gate_20261027'->>'approved_for_public_api'='true'
   AND a.summary->'quality'->'release_gate_20261027'->>'public_approval_scope'='ONLY_PUBLIC_RELEASE_V1_WHITELIST'
   AND a.summary->'quality'->'release_gate_20261027'->>'privacy_restriction'='NO_RAW_QUESTION_VALUES_NO_FREE_TEXT_NO_PERSONAL_IDENTIFIERS'
   AND a.summary->'quality'->'release_gate_20261027'->>'owner_authorized_on' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
   AND a.summary->'public_release_v1'->>'release_format'='DOMAIN_AGGREGATES_ONLY'
), valid AS (
 SELECT DISTINCT ON (school_id,domain_label) school_id,region,domain_label,
       left(published_score,length(published_score)-1)::numeric AS score
 FROM source
 WHERE domain_label IN (
 '학생·학부모 문화','교직원 문화','조직운영','업무부하',
 '교직관행','체험학습 관행','복무관행','학교환경')
 AND published_score ~ '^(100(\.0)?|[1-9]?\d(\.\d)?|0(\.0)?)점$'
 AND region IS NOT NULL AND region<>''
 ORDER BY school_id,domain_label,ord
)
SELECT domain_label,
       CASE WHEN GROUPING(region)=1 THEN 'national'::text ELSE 'regional'::text END AS scope,
       CASE WHEN GROUPING(region)=1 THEN ''::text ELSE region END AS region,
       ROUND(AVG(score),2) AS average_value
FROM valid
GROUP BY GROUPING SETS ((domain_label), (domain_label,region))
HAVING COUNT(DISTINCT school_id)>=10;

REVOKE ALL ON public.beagu_2025_domain_comparisons_v1 FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.beagu_2025_domain_comparisons_v1 TO service_role;
COMMENT ON VIEW public.beagu_2025_domain_comparisons_v1 IS
 '2025 approved eight-domain reference means; equal weight per school; small-cell groups <10 omitted. Service role only; compare with the similarly approved school mean, not respondents.';
