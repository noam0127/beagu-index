-- SYNTHETIC ONLY. Extend existing percentile fixture to exercise real predecessor view.
create schema if not exists extensions;
create extension if not exists pgcrypto schema extensions;
grant usage on schema extensions to service_role;
alter table beagu_private.beagu_2026_auto_review_status add column matching_core_questions int,add column verified_catalog_questions int,add column checked_at timestamptz;
create table public.beagu_2026_results_snapshot(school_id text primary key,payload_sha256 text,updated_at timestamptz,source_snapshot_at timestamptz,school_match_status text,school_response_rows int,approval_status text,questions jsonb);
create table beagu_private.beagu_2026_publication_basis_review(school_id text,payload_sha256 text,updated_at timestamptz,reviewed_at timestamptz,notice_effective_at timestamptz,review_status text,distinct_respondents_reviewed boolean,personal_data_reviewed boolean,small_sample_reviewed boolean,reidentification_reviewed boolean,prior_data_combination_reviewed boolean);
grant select on public.beagu_2026_results_snapshot,beagu_private.beagu_2026_publication_basis_review to service_role;
update public.beagu_school_report_yearly set percentile=case school_id when '1000004' then 0 else 100 end where source_version='fixture-auto-version';
insert into public.beagu_2026_results_snapshot values('1000004',repeat('a',64),now()-interval '2 days',now()-interval '2 days','EXACT_REGION_OFFICE_NAME',1,'WITHHELD','[{"id":"Q01","invalid":0},{"id":"Q31","invalid":0},{"id":"Q51","invalid":0}]');
insert into beagu_private.beagu_2026_publication_basis_review values('1000004',repeat('a',64),now()-interval '1 day',now()-interval '1 day',now()-interval '10 days','VERIFIED',true,true,true,true,true);
insert into beagu_private.beagu_2026_auto_review_status(school_id,source_spreadsheet_id,survey_year,technical_status,source_response_rows,matching_core_questions,verified_catalog_questions,checked_at) values('1000004','1T_rEz1LqX97pC9gOv33SRmspK2IizTU3wFtxA8P1pC4',2026,'TECHNICAL_CHECK_PASSED',1,13,13,now()-interval '1 day');
