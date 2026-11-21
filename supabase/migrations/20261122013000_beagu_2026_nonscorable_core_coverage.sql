-- 2026: scoreable item count != valid answer count.
-- "Cannot judge" and blank optional/no-knowledge answers are NOT invalid.
-- This fixes the 143 aggregate false review flags from valid non-scoring Q01-Q13.
-- Use 13 canonical item slots and the full private snapshot to validate input.
-- Data quality is separate from individual response trust and publication consent.

CREATE OR REPLACE FUNCTION beagu_private.review_2026_staged_aggregates()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE checked_count integer;
BEGIN
  WITH verified_catalog AS (
    SELECT count(*)::integer AS n
    FROM public.beagu_metric_catalog m
    WHERE m.survey_year=2026 AND m.question_id ~ '^Q(0[1-9]|1[0-3])$'
      AND m.verified IS TRUE AND length(coalesce(m.verification_evidence,''))>=12
  ),
  staging AS (
    SELECT c.source_spreadsheet_id,c.school_id,c.survey_year,c.school_response_rows,
      c.prelaunch_rows,c.school_match_status,c.distinct_respondents_verified,
      c.personal_data_reviewed,
      v.n AS verified_catalog_questions,
      (SELECT count(DISTINCT q.question_id)::integer
       FROM beagu_private.beagu_2026_question_coverage q
       WHERE q.source_spreadsheet_id=c.source_spreadsheet_id AND q.school_id=c.school_id
         AND q.survey_year=2026 AND q.question_subitem='MAIN'
         AND q.question_id ~ '^Q(0[1-9]|1[0-3])$'
         AND q.nonblank_response_rows>=0
         AND q.nonblank_response_rows<=c.school_response_rows) AS matching_core_questions,
      (SELECT count(*)::integer
       FROM beagu_private.beagu_2026_question_coverage q
       WHERE q.source_spreadsheet_id=c.source_spreadsheet_id AND q.school_id=c.school_id
         AND q.survey_year=2026 AND q.nonblank_response_rows>c.school_response_rows)
       AS impossible_question_counts,
      (SELECT count(*)::integer
       FROM public.beagu_2026_results_snapshot r
       CROSS JOIN LATERAL jsonb_array_elements(r.questions) j(q)
       WHERE r.school_id=c.school_id AND r.school_response_rows=c.school_response_rows
         AND j.q->>'id' ~ '^Q(0[1-9]|1[0-3])$'
         AND coalesce((j.q->>'row')::integer,-999)=-1
       ) AS snapshot_core_rows,
      (SELECT count(*)::integer
       FROM public.beagu_2026_results_snapshot r
       CROSS JOIN LATERAL jsonb_array_elements(r.questions) j(q)
       WHERE r.school_id=c.school_id AND r.school_response_rows=c.school_response_rows
         AND j.q->>'id' ~ '^Q(0[1-9]|1[0-3])$'
         AND coalesce((j.q->>'row')::integer,-999)=-1
         AND coalesce((j.q->>'invalid')::integer,0)>0
       ) AS invalid_core_aggregate
    FROM beagu_private.beagu_2026_school_coverage c
    CROSS JOIN verified_catalog v
    WHERE c.survey_year=2026
  ),
  decisions AS (
    SELECT *,
      array_remove(ARRAY[
        CASE WHEN prelaunch_rows>0 THEN 'PRELAUNCH_EXCLUDED' END,
        CASE WHEN school_response_rows<1 THEN 'NO_OFFICIAL_RESPONSES' END,
        CASE WHEN school_match_status<>'EXACT_REGION_OFFICE_NAME' THEN 'SCHOOL_MATCH_NEEDS_REVIEW' END,
        CASE WHEN impossible_question_counts>0 THEN 'RESPONSE_COUNT_CONFLICT' END,
        CASE WHEN matching_core_questions<13 OR snapshot_core_rows<>13
          THEN 'CORE_QUESTION_COVERAGE_INCOMPLETE' END,
        CASE WHEN invalid_core_aggregate>0 THEN 'UNRECOGNIZED_MANDATORY_ANSWER' END,
        CASE WHEN verified_catalog_questions<13 THEN '2026_CODEBOOK_NOT_VERIFIED' END,
        CASE WHEN distinct_respondents_verified IS NOT TRUE THEN 'DISTINCT_RESPONDENTS_UNVERIFIED' END,
        CASE WHEN personal_data_reviewed IS NOT TRUE THEN 'PERSONAL_DATA_REVIEW_INCOMPLETE' END,
        CASE WHEN school_response_rows<5 THEN 'SMALL_CELL_REIDENTIFICATION_RISK' END,
        'PUBLICATION_CONSENT_EVIDENCE_NOT_CONNECTED'
      ]::text[],NULL) AS reasons,
      CASE
        WHEN prelaunch_rows>0 THEN 'PRELAUNCH_EXCLUDED'
        WHEN school_response_rows<1 THEN 'NO_OFFICIAL_DATA'
        WHEN school_match_status<>'EXACT_REGION_OFFICE_NAME' THEN 'NEEDS_SCHOOL_CHECK'
        WHEN matching_core_questions<13 OR snapshot_core_rows<>13
          OR invalid_core_aggregate>0 OR impossible_question_counts>0
          OR verified_catalog_questions<13 THEN 'NEEDS_QUESTION_CHECK'
        ELSE 'TECHNICAL_CHECK_PASSED'
      END AS technical_status
    FROM staging
  )
  INSERT INTO beagu_private.beagu_2026_auto_review_status AS a
    (source_spreadsheet_id,school_id,survey_year,source_response_rows,technical_status,
     publication_status,reasons,matching_core_questions,verified_catalog_questions,checked_at)
  SELECT source_spreadsheet_id,school_id,survey_year,school_response_rows,technical_status,
    'WITHHELD',reasons,matching_core_questions,verified_catalog_questions,now()
  FROM decisions
  ON CONFLICT(source_spreadsheet_id,school_id) DO UPDATE
    SET source_response_rows=EXCLUDED.source_response_rows,
      technical_status=EXCLUDED.technical_status,
      publication_status='WITHHELD',
      reasons=EXCLUDED.reasons,
      matching_core_questions=EXCLUDED.matching_core_questions,
      verified_catalog_questions=EXCLUDED.verified_catalog_questions,
      checked_at=now();
  GET DIAGNOSTICS checked_count=ROW_COUNT;
  RETURN checked_count;
END;
$function$
;

-- Missing items may legitimately have no recorded choice; do not pretend
-- every submitted row answered each individual item. Unknown options still
-- require review, and response counts must remain bounded and nonnegative.
CREATE OR REPLACE FUNCTION beagu_private.refresh_2026_quality_reviews()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare n integer;
begin
 with inspect as (
   select r.school_id,r.payload_sha256,r.school_response_rows,r.school_match_status,
     count(*) filter(where j.q->>'id' ~ '^Q(0[1-9]|1[0-3])$'
       and coalesce((j.q->>'row')::integer,-999)=-1) core_count,
     count(*) filter(where j.q->>'id' ~ '^Q(0[1-9]|1[0-3])$'
       and coalesce((j.q->>'row')::integer,-999)=-1
       and coalesce((j.q->>'valid')::integer,-1)>=0
       and coalesce((j.q->>'invalid')::integer,-1)>=0
       and coalesce((j.q->>'valid')::integer,-1)+coalesce((j.q->>'invalid')::integer,-1)<=r.school_response_rows)
       core_complete,
     count(*) filter(where j.q->>'id' ~ '^Q(0[1-9]|1[0-3])$'
       and coalesce((j.q->>'row')::integer,-999)=-1
       and coalesce((j.q->>'invalid')::integer,0)>0) core_invalid
   from public.beagu_2026_results_snapshot r
   cross join lateral jsonb_array_elements(r.questions) j(q)
   group by r.school_id,r.payload_sha256,r.school_response_rows,r.school_match_status
 ), decisions as (
   select school_id,payload_sha256,
     array_remove(array[
       case when school_match_status<>'EXACT_REGION_OFFICE_NAME' then 'SCHOOL_MATCH_UNRESOLVED' end,
       case when core_count<>13 or core_complete<>13 then 'MANDATORY_QUESTION_COVERAGE' end,
       case when core_invalid>0 then 'UNRECOGNIZED_MANDATORY_ANSWER' end
     ]::text[],null) reasons
   from inspect
 ), upserted as (
   insert into beagu_private.beagu_2026_quality_reviews as old(
      school_id,payload_sha256,quality_status,reasons,checked_at)
   select school_id,payload_sha256,
      case when cardinality(reasons)=0 then 'AUTO_PASS' else 'REVIEW_REQUIRED' end,
      reasons,now() from decisions
   on conflict(school_id) do update set
     payload_sha256=excluded.payload_sha256,quality_status=excluded.quality_status,
     reasons=excluded.reasons,checked_at=now()
   where (old.payload_sha256,old.quality_status,old.reasons) is distinct from
     (excluded.payload_sha256,excluded.quality_status,excluded.reasons)
   returning 1
 )
 select count(*) into n from upserted;
 delete from beagu_private.beagu_2026_quality_reviews q
 where not exists(select 1 from public.beagu_2026_results_snapshot r where r.school_id=q.school_id);
 return n;
end $function$
;

revoke all on function beagu_private.review_2026_staged_aggregates() from public,anon,authenticated;
revoke all on function beagu_private.refresh_2026_quality_reviews() from public,anon,authenticated;
grant execute on function beagu_private.review_2026_staged_aggregates() to service_role;
grant execute on function beagu_private.refresh_2026_quality_reviews() to service_role;
