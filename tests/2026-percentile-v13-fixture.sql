-- Synthetic data only. Never run this fixture against production.
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema beagu_private;
grant usage on schema beagu_private to service_role;
create table public.schools(school_id text primary key);
create table public.beagu_school_report_yearly(
 school_id text references public.schools(school_id),survey_year smallint,source_version text,
 percentile numeric,valid_observation_count integer,percentile_method text,
 publication_status text,updated_at timestamptz default now()-interval '1 hour',
 primary key(school_id,survey_year));
create table public.beagu_admin_accounts(user_id uuid primary key,role text,enabled boolean);
create function public.beagu_admin_active_mfa_session(uuid,uuid) returns boolean language sql stable
 as $$ select $1='11111111-1111-1111-1111-111111111111'::uuid and $2='22222222-2222-2222-2222-222222222222'::uuid $$;
create table beagu_private.beagu_2026_civic_publication_hold(school_id text,active boolean);
grant select on public.schools,public.beagu_school_report_yearly,public.beagu_admin_accounts,
 beagu_private.beagu_2026_civic_publication_hold to service_role;
insert into public.schools values('1000001'),('1000002'),('1000003');
insert into public.beagu_school_report_yearly(school_id,survey_year,source_version,percentile,valid_observation_count,percentile_method,publication_status)
 values ('1000001',2026,'fixture-version',70,1,'fixture-method','WITHHELD'),
 ('1000002',2026,'fixture-version',20,2,'fixture-method','WITHHELD'),
 ('1000003',2026,'fixture-version',10,1,'fixture-method','WITHHELD'),
 ('1000001',2025,'legacy-fixture',30,1,'legacy-method','PUBLISHED');
insert into public.beagu_admin_accounts values('11111111-1111-1111-1111-111111111111','owner',true);
