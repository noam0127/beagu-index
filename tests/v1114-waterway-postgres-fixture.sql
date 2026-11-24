-- Disposable PostgreSQL only. Synthetic school and aggregate metadata.
create schema beagu_private;
create role anon;
create role authenticated;
create role service_role bypassrls;
grant usage on schema beagu_private to service_role;
create table public.beagu_2026_results_snapshot(school_id text primary key,school_response_rows integer,school_match_status text,questions jsonb,payload_sha256 text,source_snapshot_at timestamptz,approval_status text,approved_by text,approved_at timestamptz,approved_payload_sha256 text,updated_at timestamptz);
create table beagu_private.beagu_2026_publication_basis_review(school_id text primary key,payload_sha256 text,review_status text,basis_type text,notice_source_ref text,notice_digest_sha256 text,notice_effective_at timestamptz,publication_scope text,reviewer_user_id uuid,reviewed_at timestamptz,distinct_respondents_reviewed boolean,personal_data_reviewed boolean,small_sample_reviewed boolean,reidentification_reviewed boolean,prior_data_combination_reviewed boolean);
create table beagu_private.beagu_2026_auto_review_status(school_id text,survey_year integer,source_spreadsheet_id text,source_response_rows integer,technical_status text,matching_core_questions integer,verified_catalog_questions integer,checked_at timestamptz);
create table beagu_private.beagu_2026_quality_reviews(school_id text,payload_sha256 text,quality_status text);
create table beagu_private.beagu_2026_civic_publication_hold(school_id text,active boolean);
create table beagu_private.beagu_2026_results_sync(singleton boolean primary key,snapshot_at timestamptz,totals jsonb);
create table public.beagu_2026_public_progress(id integer primary key,official_submission_rows integer,refreshed_at timestamptz);
grant select on public.beagu_2026_results_snapshot,public.beagu_2026_public_progress,beagu_private.beagu_2026_publication_basis_review,beagu_private.beagu_2026_auto_review_status,beagu_private.beagu_2026_quality_reviews,beagu_private.beagu_2026_civic_publication_hold to service_role;
-- The real level release function is installed from its existing migration.
create table public.beagu_admin_accounts(user_id uuid,role text,enabled boolean);
create function public.beagu_admin_active_mfa_session(uuid,uuid) returns boolean language sql as $$select false$$;
insert into public.beagu_2026_results_snapshot values('A000001',1,'EXACT_REGION_OFFICE_NAME','[{"id":"Q45","row":10,"valid":0,"invalid":1}]',repeat('a',64),now()-interval '1 hour','WITHHELD',null,null,null,now()-interval '1 hour');
insert into beagu_private.beagu_2026_results_sync values(true,now()-interval '1 hour','{"source_rows":2,"official_rows":1,"prelaunch_rows":1,"undated_rows":0,"unmatched_rows":0}');
insert into public.beagu_2026_public_progress values(1,1,now()-interval '1 hour');
