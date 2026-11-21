-- 2026 sandbox database harness: staging project only.
-- This file creates an isolated schema with deliberately fictitious rows.
-- No production data, school IDs, teacher answers, access codes or secrets.
-- The two function bodies are copied verbatim from the correction migration,
-- replacing only explicitly-qualified table/function schemas with sandbox.
-- It is NOT the production schema; it is a realistic SQL execution test.
-- STOP if schema exists to prevent accidentally changing prior test runs.
DO $guard$
BEGIN
 IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname='qa2026_sandbox') THEN
   RAISE EXCEPTION 'qa2026_sandbox already exists; refusing to overwrite';
 END IF;
END
$guard$;

CREATE SCHEMA qa2026_sandbox;
REVOKE ALL ON SCHEMA qa2026_sandbox FROM PUBLIC, anon, authenticated;

CREATE TABLE qa2026_sandbox.fixture_cases(
 school_id text PRIMARY KEY,
 scenario text UNIQUE NOT NULL,
 expected_technical text NOT NULL,
 expected_quality text NOT NULL
);
CREATE TABLE qa2026_sandbox.beagu_metric_catalog(
 survey_year integer NOT NULL, question_id text PRIMARY KEY,
 verified boolean, verification_evidence text
);
CREATE TABLE qa2026_sandbox.beagu_2026_results_snapshot(
 school_id text PRIMARY KEY, payload_sha256 text NOT NULL,
 school_response_rows integer NOT NULL, school_match_status text NOT NULL,
 questions jsonb NOT NULL
);
CREATE TABLE qa2026_sandbox.beagu_2026_school_coverage(
 source_spreadsheet_id text NOT NULL, school_id text PRIMARY KEY,
 survey_year integer NOT NULL, school_response_rows integer NOT NULL,
 prelaunch_rows integer NOT NULL, school_match_status text NOT NULL,
 distinct_respondents_verified boolean NOT NULL DEFAULT false,
 personal_data_reviewed boolean NOT NULL DEFAULT false
);
CREATE TABLE qa2026_sandbox.beagu_2026_question_coverage(
 source_spreadsheet_id text NOT NULL, school_id text NOT NULL,
 survey_year integer NOT NULL, question_subitem text NOT NULL,
 question_id text NOT NULL, nonblank_response_rows integer NOT NULL,
 PRIMARY KEY(source_spreadsheet_id,school_id,question_subitem,question_id)
);
CREATE TABLE qa2026_sandbox.beagu_2026_auto_review_status(
 source_spreadsheet_id text NOT NULL, school_id text NOT NULL,
 survey_year integer NOT NULL,source_response_rows integer NOT NULL,
 technical_status text NOT NULL, publication_status text NOT NULL,
 reasons text[] NOT NULL, matching_core_questions integer NOT NULL,
 verified_catalog_questions integer NOT NULL,checked_at timestamptz NOT NULL,
 PRIMARY KEY(source_spreadsheet_id,school_id)
);
CREATE TABLE qa2026_sandbox.beagu_2026_quality_reviews(
 school_id text PRIMARY KEY,payload_sha256 text NOT NULL,
 quality_status text NOT NULL,reasons text[] NOT NULL,
 checked_at timestamptz NOT NULL
);

INSERT INTO qa2026_sandbox.fixture_cases(school_id,scenario,expected_technical,expected_quality) VALUES
('T000001','regular_13_only','TECHNICAL_CHECK_PASSED','AUTO_PASS'),
('T000002','valid_cannot_judge','TECHNICAL_CHECK_PASSED','AUTO_PASS'),
('T000003','optional_questions_blank','TECHNICAL_CHECK_PASSED','AUTO_PASS'),
('T000004','core_question_blank','TECHNICAL_CHECK_PASSED','AUTO_PASS'),
('T000005','unrecognized_Q08','NEEDS_QUESTION_CHECK','REVIEW_REQUIRED'),
('T000006','school_mismatch','NEEDS_SCHOOL_CHECK','REVIEW_REQUIRED'),
('T000007','impossible_QA_count','NEEDS_QUESTION_CHECK','AUTO_PASS'),
('T000008','missing_snapshot_core','NEEDS_QUESTION_CHECK','REVIEW_REQUIRED'),
('T000009','unrecognized_Q12_other','NEEDS_QUESTION_CHECK','REVIEW_REQUIRED'),
('T000010','missing_QA_core_slot','NEEDS_QUESTION_CHECK','AUTO_PASS');

INSERT INTO qa2026_sandbox.beagu_metric_catalog(survey_year,question_id,verified,verification_evidence)
SELECT 2026,'Q'||lpad(n::text,2,'0'),true,'SYNTHETIC_CODEBOOK_VERIFIED' FROM generate_series(1,13) g(n);

INSERT INTO qa2026_sandbox.beagu_2026_results_snapshot
(school_id,payload_sha256,school_response_rows,school_match_status,questions)
SELECT f.school_id, rpad(md5(f.school_id),64,'0'),1,
       CASE WHEN f.scenario='school_mismatch' THEN 'NEEDS_REVIEW'
            ELSE 'EXACT_REGION_OFFICE_NAME' END,
       (SELECT jsonb_agg(jsonb_build_object(
           'id','Q'||lpad(n::text,2,'0'),
           'row',-1,
           'valid',CASE WHEN n=8 AND f.scenario IN ('core_question_blank','unrecognized_Q08')
                        OR n=12 AND f.scenario='unrecognized_Q12_other' THEN 0 ELSE 1 END,
           'invalid',CASE WHEN n=8 AND f.scenario='unrecognized_Q08'
                          OR n=12 AND f.scenario='unrecognized_Q12_other' THEN 1 ELSE 0 END
       ) ORDER BY n)
        FROM generate_series(1,13) g(n)
        WHERE NOT(f.scenario='missing_snapshot_core' AND n=13))
FROM qa2026_sandbox.fixture_cases f;

INSERT INTO qa2026_sandbox.beagu_2026_school_coverage
(source_spreadsheet_id,school_id,survey_year,school_response_rows,prelaunch_rows,
 school_match_status,distinct_respondents_verified,personal_data_reviewed)
SELECT 'synthetic_2026_staging',school_id,2026,1,0,
       CASE WHEN scenario='school_mismatch' THEN 'NEEDS_REVIEW'
            ELSE 'EXACT_REGION_OFFICE_NAME' END,
       false,false FROM qa2026_sandbox.fixture_cases;

INSERT INTO qa2026_sandbox.beagu_2026_question_coverage
(source_spreadsheet_id,school_id,survey_year,question_subitem,question_id,nonblank_response_rows)
SELECT 'synthetic_2026_staging',f.school_id,2026,'MAIN',
       'Q'||lpad(n::text,2,'0'),
       CASE WHEN n=8 AND f.scenario IN ('valid_cannot_judge','core_question_blank','unrecognized_Q08')
               OR n=12 AND f.scenario='unrecognized_Q12_other'
            THEN 0
            WHEN n=8 AND f.scenario='impossible_QA_count' THEN 2
            ELSE 1 END
FROM qa2026_sandbox.fixture_cases f CROSS JOIN generate_series(1,13) g(n)
WHERE NOT(f.scenario='missing_QA_core_slot' AND n=13);

-- Run the exact current SQL function logic with only schema-qualified
-- identifiers rewritten to qa2026_sandbox.
CREATE OR REPLACE FUNCTION qa2026_sandbox.review_2026_staged_aggregates()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE checked_count integer;
BEGIN
  WITH verified_catalog AS (
    SELECT count(*)::integer AS n
    FROM qa2026_sandbox.beagu_metric_catalog m
    WHERE m.survey_year=2026 AND m.question_id ~ '^Q(0[1-9]|1[0-3])$'
      AND m.verified IS TRUE AND length(coalesce(m.verification_evidence,''))>=12
  ),
  staging AS (
    SELECT c.source_spreadsheet_id,c.school_id,c.survey_year,c.school_response_rows,
      c.prelaunch_rows,c.school_match_status,c.distinct_respondents_verified,
      c.personal_data_reviewed,
      v.n AS verified_catalog_questions,
      (SELECT count(DISTINCT q.question_id)::integer
       FROM qa2026_sandbox.beagu_2026_question_coverage q
       WHERE q.source_spreadsheet_id=c.source_spreadsheet_id AND q.school_id=c.school_id
         AND q.survey_year=2026 AND q.question_subitem='MAIN'
         AND q.question_id ~ '^Q(0[1-9]|1[0-3])$'
         AND q.nonblank_response_rows>=0
         AND q.nonblank_response_rows<=c.school_response_rows) AS matching_core_questions,
      (SELECT count(*)::integer
       FROM qa2026_sandbox.beagu_2026_question_coverage q
       WHERE q.source_spreadsheet_id=c.source_spreadsheet_id AND q.school_id=c.school_id
         AND q.survey_year=2026 AND q.nonblank_response_rows>c.school_response_rows)
       AS impossible_question_counts,
      (SELECT count(*)::integer
       FROM qa2026_sandbox.beagu_2026_results_snapshot r
       CROSS JOIN LATERAL jsonb_array_elements(r.questions) j(q)
       WHERE r.school_id=c.school_id AND r.school_response_rows=c.school_response_rows
         AND j.q->>'id' ~ '^Q(0[1-9]|1[0-3])$'
         AND coalesce((j.q->>'row')::integer,-999)=-1
       ) AS snapshot_core_rows,
      (SELECT count(*)::integer
       FROM qa2026_sandbox.beagu_2026_results_snapshot r
       CROSS JOIN LATERAL jsonb_array_elements(r.questions) j(q)
       WHERE r.school_id=c.school_id AND r.school_response_rows=c.school_response_rows
         AND j.q->>'id' ~ '^Q(0[1-9]|1[0-3])$'
         AND coalesce((j.q->>'row')::integer,-999)=-1
         AND coalesce((j.q->>'invalid')::integer,0)>0
       ) AS invalid_core_aggregate
    FROM qa2026_sandbox.beagu_2026_school_coverage c
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
  INSERT INTO qa2026_sandbox.beagu_2026_auto_review_status AS a
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
$function$;

CREATE OR REPLACE FUNCTION qa2026_sandbox.refresh_2026_quality_reviews()
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
   from qa2026_sandbox.beagu_2026_results_snapshot r
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
   insert into qa2026_sandbox.beagu_2026_quality_reviews as old(
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
 delete from qa2026_sandbox.beagu_2026_quality_reviews q
 where not exists(select 1 from qa2026_sandbox.beagu_2026_results_snapshot r where r.school_id=q.school_id);
 return n;
end $function$;

REVOKE ALL ON ALL TABLES IN SCHEMA qa2026_sandbox FROM PUBLIC,anon,authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA qa2026_sandbox FROM PUBLIC,anon,authenticated;

SELECT qa2026_sandbox.review_2026_staged_aggregates();
SELECT qa2026_sandbox.refresh_2026_quality_reviews();

-- Never accidentally succeed if an unsafe classification is returned.
DO $verify$
DECLARE mismatches jsonb;
DECLARE examples integer;
BEGIN
 SELECT jsonb_agg(jsonb_build_object(
   'scenario',f.scenario,'technical',t.technical_status,
   'basic',q.quality_status,'expected_technical',f.expected_technical,
   'expected_basic',f.expected_quality))
 INTO mismatches
 FROM qa2026_sandbox.fixture_cases f
 LEFT JOIN qa2026_sandbox.beagu_2026_auto_review_status t ON t.school_id=f.school_id
 LEFT JOIN qa2026_sandbox.beagu_2026_quality_reviews q ON q.school_id=f.school_id
 WHERE t.technical_status IS DISTINCT FROM f.expected_technical
    OR q.quality_status IS DISTINCT FROM f.expected_quality
    OR t.publication_status IS DISTINCT FROM 'WITHHELD';
 IF mismatches IS NOT NULL THEN
   RAISE EXCEPTION '2026 QA staging sandbox failed: %',mismatches;
 END IF;
 SELECT count(*) INTO examples FROM qa2026_sandbox.fixture_cases;
 IF examples<>10 THEN RAISE EXCEPTION 'Incomplete synthetic case count: %',examples; END IF;
END
$verify$;
