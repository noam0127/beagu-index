\set ON_ERROR_STOP on
-- Disposable PostgreSQL only. Synthetic fixture, no production data.
CREATE SCHEMA beagu_private;
CREATE TABLE public.beagu_metric_catalog(survey_year smallint,question_id text,verified boolean,verification_evidence text);
CREATE TABLE beagu_private.beagu_2026_school_coverage(source_spreadsheet_id text,school_id text,survey_year smallint,school_response_rows int,prelaunch_rows int,school_match_status text,distinct_respondents_verified boolean,personal_data_reviewed boolean,updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE beagu_private.beagu_2026_question_coverage(source_spreadsheet_id text,school_id text,survey_year smallint,question_subitem text,question_id text,nonblank_response_rows int,updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.beagu_2026_results_snapshot(school_id text PRIMARY KEY,school_response_rows int,questions jsonb,source_snapshot_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE beagu_private.beagu_2026_civic_publication_hold(school_id text,active boolean,updated_at timestamptz NOT NULL);
CREATE TABLE beagu_private.beagu_2026_auto_review_status(source_spreadsheet_id text,school_id text,survey_year smallint,source_response_rows int,technical_status text,publication_status text,reasons text[],matching_core_questions int,verified_catalog_questions int,checked_at timestamptz NOT NULL,PRIMARY KEY(source_spreadsheet_id,school_id));
INSERT INTO public.beagu_metric_catalog SELECT 2026,'Q'||lpad(i::text,2,'0'),true,'synthetic verified catalog' FROM generate_series(1,13)i;
INSERT INTO beagu_private.beagu_2026_school_coverage(source_spreadsheet_id,school_id,survey_year,school_response_rows,prelaunch_rows,school_match_status,distinct_respondents_verified,personal_data_reviewed) VALUES
('fixture','A',2026,7,0,'EXACT_REGION_OFFICE_NAME',true,true),
('fixture','B',2026,1,0,'EXACT_REGION_OFFICE_NAME',false,false),
('fixture','C',2026,7,0,'UNMATCHED',false,false);
INSERT INTO beagu_private.beagu_2026_question_coverage(source_spreadsheet_id,school_id,survey_year,question_subitem,question_id,nonblank_response_rows)
SELECT 'fixture',school_id,2026,'MAIN','Q'||lpad(i::text,2,'0'),1 FROM beagu_private.beagu_2026_school_coverage CROSS JOIN generate_series(1,13)i;
INSERT INTO public.beagu_2026_results_snapshot(school_id,school_response_rows,questions)
SELECT school_id,school_response_rows,(SELECT jsonb_agg(jsonb_build_object('id','Q'||lpad(i::text,2,'0'),'row',-1,'invalid',0,'valid',1)) FROM generate_series(1,13)i) FROM beagu_private.beagu_2026_school_coverage;
