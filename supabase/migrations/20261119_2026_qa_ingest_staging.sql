-- Aggregate counts only; service-role-only data API staging for private QA.
-- The Google Form still requires a one-time Apps Script installation by owner.
CREATE TABLE IF NOT EXISTS public.beagu_2026_qa_ingest_staging (
 source_spreadsheet_id text NOT NULL CHECK (source_spreadsheet_id='1T_rEz1LqX97pC9gOv33SRmspK2IizTU3wFtxA8P1pC4'),
 school_id text NOT NULL REFERENCES public.schools(school_id),
 survey_year smallint NOT NULL DEFAULT 2026 CHECK(survey_year=2026),
 school_response_rows integer NOT NULL CHECK(school_response_rows BETWEEN 1 AND 50000),
 school_match_status text NOT NULL CHECK(school_match_status IN ('EXACT_REGION_OFFICE_NAME','NEEDS_REVIEW')),
 core_valid_counts jsonb NOT NULL CHECK (jsonb_typeof(core_valid_counts)='object'),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(source_spreadsheet_id,school_id)
);
ALTER TABLE public.beagu_2026_qa_ingest_staging ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.beagu_2026_qa_ingest_staging FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.beagu_2026_qa_ingest_staging TO service_role;
COMMENT ON TABLE public.beagu_2026_qa_ingest_staging IS
 'Private service-role-only counts for auto QA. No original teacher answers, selected options, respondent identifiers or release approvals.';

CREATE OR REPLACE FUNCTION beagu_private.sync_2026_qa_ingest_to_private()
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER
SET search_path=''
AS $body$
DECLARE n integer;
BEGIN
  WITH valid AS (
    SELECT r.* FROM public.beagu_2026_qa_ingest_staging r
    WHERE r.survey_year=2026
      AND (SELECT count(*) FROM jsonb_object_keys(r.core_valid_counts))=13
      AND NOT EXISTS(
        SELECT 1 FROM jsonb_each(r.core_valid_counts) item
        WHERE item.key !~ '^Q(0[1-9]|1[0-3])$'
          OR jsonb_typeof(item.value)<>'number'
          OR (item.value::text)::numeric<0
          OR (item.value::text)::numeric>r.school_response_rows
          OR (item.value::text)::numeric<>trunc((item.value::text)::numeric)
      )
  ),
  inserted AS (
    INSERT INTO beagu_private.beagu_2026_school_coverage AS c
      (source_spreadsheet_id,school_id,survey_year,school_response_rows,prelaunch_rows,
       answered_core_question_count,school_match_status,distinct_respondents_verified,
       personal_data_reviewed,publication_status,latest_source_audit)
    SELECT v.source_spreadsheet_id,v.school_id,2026,v.school_response_rows,0,
      (SELECT count(*)::integer FROM jsonb_each_text(v.core_valid_counts) j WHERE j.value::integer>0),
      v.school_match_status,false,false,'WITHHELD',
      (v.updated_at AT TIME ZONE 'Asia/Seoul')::date
    FROM valid v
    ON CONFLICT(source_spreadsheet_id,school_id) DO UPDATE SET
      school_response_rows=EXCLUDED.school_response_rows,
      prelaunch_rows=0,
      answered_core_question_count=EXCLUDED.answered_core_question_count,
      school_match_status=EXCLUDED.school_match_status,
      distinct_respondents_verified=false,
      personal_data_reviewed=false,
      publication_status='WITHHELD',
      latest_source_audit=EXCLUDED.latest_source_audit,
      updated_at=now()
    WHERE c.publication_status<>'APPROVED'
      AND (c.school_response_rows,c.school_match_status,c.answered_core_question_count,
           c.latest_source_audit) IS DISTINCT FROM
          (EXCLUDED.school_response_rows,EXCLUDED.school_match_status,
           EXCLUDED.answered_core_question_count,EXCLUDED.latest_source_audit)
    RETURNING 1
  ),
  qa AS (
    INSERT INTO beagu_private.beagu_2026_question_coverage AS q
      (source_spreadsheet_id,school_id,survey_year,question_id,question_subitem,
       nonblank_response_rows,eligibility_status)
    SELECT v.source_spreadsheet_id,v.school_id,2026,item.key,'MAIN',
      item.value::integer,'WITHHELD'
    FROM valid v
      CROSS JOIN LATERAL jsonb_each_text(v.core_valid_counts) item
    ON CONFLICT(source_spreadsheet_id,school_id,question_id,question_subitem)
    DO UPDATE SET nonblank_response_rows=EXCLUDED.nonblank_response_rows,
      eligibility_status='WITHHELD',updated_at=now()
    WHERE q.eligibility_status<>'APPROVED'
      AND q.nonblank_response_rows IS DISTINCT FROM EXCLUDED.nonblank_response_rows
    RETURNING 1
  )
  SELECT (SELECT count(*) FROM inserted)+(SELECT count(*) FROM qa)
    INTO n;
  RETURN n;
END;
$body$;
REVOKE ALL ON FUNCTION beagu_private.sync_2026_qa_ingest_to_private() FROM PUBLIC,anon,authenticated;
SELECT cron.schedule('beagu-2026-private-qa-ingest-sync','*/5 * * * *',
  'SELECT beagu_private.sync_2026_qa_ingest_to_private();');
