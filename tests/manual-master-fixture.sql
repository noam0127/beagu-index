\set ON_ERROR_STOP on
create role anon; create role authenticated; create role service_role bypassrls;
create schema beagu_private; create schema extensions; create extension pgcrypto schema extensions;
grant usage on schema beagu_private,extensions to service_role;
create table public.beagu_admin_accounts(user_id uuid primary key,role text,enabled boolean);
create function public.beagu_admin_active_mfa_session(p_actor uuid,p_session uuid) returns boolean language sql stable as $f$select p_actor='11111111-1111-4111-8111-111111111111'::uuid and p_session='22222222-2222-4222-8222-222222222222'::uuid$f$;
insert into public.beagu_admin_accounts values ('11111111-1111-4111-8111-111111111111','owner',true),('33333333-3333-4333-8333-333333333333','editor',true);
create table beagu_private.beagu_2026_auto_preflight(school_id text,source_version text,percentile numeric,valid_observation_count int,updated_at timestamptz,eligible_since timestamptz,scope_ok boolean,structure_ok boolean,exact_evidence_ok boolean,held boolean);
create table beagu_private.beagu_2026_level_release_approvals(access_level int,approved boolean,updated_at timestamptz);
create table beagu_private.beagu_2026_percentile_v13_decisions(school_id text,access_level int,decision text,decided_at timestamptz);
grant select on public.beagu_admin_accounts,beagu_private.beagu_2026_auto_preflight,beagu_private.beagu_2026_level_release_approvals,beagu_private.beagu_2026_percentile_v13_decisions to service_role;
insert into beagu_private.beagu_2026_auto_preflight values
('1000001','fixture-v1',0,1,now()-interval '1 day',now()-interval '1 day',true,true,true,false),
('1000002','fixture-v1',100,1,now()-interval '1 day',now()-interval '1 day',true,true,true,true),
('1000001','fixture-v2',100,1,now()-interval '1 day',now()-interval '1 day',true,true,true,false),
('1000002','fixture-v2',0,1,now()-interval '1 day',now()-interval '1 day',true,true,false,false);

create table public.beagu_2026_results_snapshot(school_id text primary key,payload_sha256 text,updated_at timestamptz,source_snapshot_at timestamptz,school_match_status text,school_response_rows int,approval_status text,questions jsonb);
create table beagu_private.beagu_2026_publication_basis_review(school_id text,payload_sha256 text,updated_at timestamptz,reviewed_at timestamptz,notice_effective_at timestamptz,review_status text,distinct_respondents_reviewed boolean,personal_data_reviewed boolean,small_sample_reviewed boolean,reidentification_reviewed boolean,prior_data_combination_reviewed boolean);
create table beagu_private.beagu_2026_auto_review_status(school_id text,survey_year int,source_spreadsheet_id text,technical_status text,matching_core_questions int,verified_catalog_questions int,checked_at timestamptz,source_response_rows int);
create table beagu_private.beagu_2026_civic_publication_hold(school_id text,active boolean,updated_at timestamptz);
create table beagu_private.beagu_2026_auto_exception(school_id text);
grant select on public.beagu_2026_results_snapshot,beagu_private.beagu_2026_publication_basis_review,beagu_private.beagu_2026_auto_review_status,beagu_private.beagu_2026_civic_publication_hold,beagu_private.beagu_2026_auto_exception to service_role;
insert into public.beagu_2026_results_snapshot values
('1000001',repeat('a',64),now()-interval '2 days',now()-interval '2 days','EXACT_REGION_OFFICE_NAME',1,'WITHHELD','[{"id":"Q01","invalid":0},{"id":"Q31","invalid":0},{"id":"Q51","invalid":0}]'),
('1000002',repeat('b',64),now()-interval '2 days',now()-interval '2 days','EXACT_REGION_OFFICE_NAME',1,'WITHHELD','[{"id":"Q01","invalid":0}]');
insert into beagu_private.beagu_2026_publication_basis_review values ('1000001',repeat('a',64),now()-interval '1 day',now()-interval '1 day',now()-interval '10 days','VERIFIED',true,true,true,true,true);
insert into beagu_private.beagu_2026_auto_review_status values
('1000001',2026,'1T_rEz1LqX97pC9gOv33SRmspK2IizTU3wFtxA8P1pC4','TECHNICAL_CHECK_PASSED',13,13,now()-interval '1 day',1),
('1000002',2026,'1T_rEz1LqX97pC9gOv33SRmspK2IizTU3wFtxA8P1pC4','TECHNICAL_CHECK_PASSED',13,13,now()-interval '1 day',1);
