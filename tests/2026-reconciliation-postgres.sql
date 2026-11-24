-- Isolated PostgreSQL fixtures only; no operating data.
create schema if not exists beagu_private;
create table public.beagu_admin_accounts(user_id uuid,role text,enabled boolean);
create function public.beagu_admin_active_mfa_session(uuid,uuid) returns boolean language sql as $$ select $2='00000000-0000-0000-0000-000000000002'::uuid $$;
create table public.beagu_2026_results_snapshot(school_id text primary key,school_response_rows integer,school_match_status text,questions jsonb,payload_sha256 text,source_snapshot_at timestamptz,approval_status text,approved_by text,approved_at timestamptz,approved_payload_sha256 text,updated_at timestamptz);
create table beagu_private.beagu_2026_publication_basis_review(school_id text,payload_sha256 text,review_status text,reviewer_user_id uuid,reviewed_at timestamptz,notice_effective_at timestamptz,distinct_respondents_reviewed boolean,personal_data_reviewed boolean,small_sample_reviewed boolean,reidentification_reviewed boolean,prior_data_combination_reviewed boolean);
create table beagu_private.beagu_2026_auto_review_status(school_id text,survey_year integer,source_spreadsheet_id text,source_response_rows integer,technical_status text,matching_core_questions integer,verified_catalog_questions integer,checked_at timestamptz);
insert into public.beagu_admin_accounts values('00000000-0000-0000-0000-000000000001','owner',true);
insert into public.beagu_2026_results_snapshot values('A000001',1,'EXACT_REGION_OFFICE_NAME','[{"id":"Q01","invalid":0}]',repeat('a',64),now()-interval '3 days','APPROVED','00000000-0000-0000-0000-000000000001',now()-interval '2 days',repeat('a',64),now()-interval '3 days');
insert into beagu_private.beagu_2026_publication_basis_review values('A000001',repeat('a',64),'VERIFIED','00000000-0000-0000-0000-000000000001',now()-interval '2 days',now()-interval '4 days',true,true,true,true,true);
insert into beagu_private.beagu_2026_auto_review_status values('A000001',2026,'1T_rEz1LqX97pC9gOv33SRmspK2IizTU3wFtxA8P1pC4',2,'TECHNICAL_CHECK_PASSED',13,13,now()-interval '2 days');

create table public.beagu_school_report_yearly(school_id text,survey_year smallint,percentile numeric,publication_status text,valid_observation_count integer,release_evidence jsonb);
alter table public.beagu_school_report_yearly enable row level security;
create policy existing_approved_only on public.beagu_school_report_yearly for select to anon,authenticated using(publication_status='PUBLISHED');
grant select on public.beagu_school_report_yearly to anon,authenticated;
insert into public.beagu_school_report_yearly values
 ('A000001',2026,50,'PUBLISHED',1,'{}'),('A000001',2025,40,'PUBLISHED',1,'{}'),('A000002',2026,10,'WITHHELD',1,'{}');
