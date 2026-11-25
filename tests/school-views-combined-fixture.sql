\set ON_ERROR_STOP on
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema beagu_private;
create schema extensions;
create extension pgcrypto schema extensions;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;
create table public.schools(school_id text primary key,status text);
create table public.school_search_events(action_id uuid,school_id text,event_type text,source_page text,searched_at timestamptz default now(),primary key(action_id,event_type));
create table public.beagu_admin_accounts(user_id uuid,enabled boolean);
create table public.beagu_school_view_totals(school_id text primary key,views bigint,updated_at timestamptz default now());
create table beagu_private.school_search_settings(name text primary key,salt text);
create table beagu_private.school_view_admin_exclusions(visitor_digest text primary key);
create table beagu_private.school_view_claims(action_id uuid primary key,school_id text,visitor_digest text);
create table beagu_private.school_view_daily(school_id text,visitor_digest text,view_day date,primary key(school_id,visitor_digest,view_day));
insert into public.schools values('1234567','운영'),('7654321','운영');
insert into public.beagu_school_view_totals(school_id,views) values('1234567',41);
insert into beagu_private.school_search_settings values('salt','fixture-only');
insert into public.school_search_events(action_id,school_id,event_type,source_page) values
('00000000-0000-4000-8000-000000000001','1234567','search_confirmed','search'),
('00000000-0000-4000-8000-000000000002','1234567','school_selected','search'),
('00000000-0000-4000-8000-000000000002','1234567','detail_viewed','search'),
('00000000-0000-4000-8000-000000000003','1234567','detail_viewed','school-report'),
('00000000-0000-4000-8000-000000000004','1234567','school_selected','school-report'),
('00000000-0000-4000-8000-000000000005','7654321','detail_viewed','school-report');
insert into beagu_private.school_view_admin_exclusions values(encode(extensions.digest('22222222-2222-4222-8222-222222222222:fixture-only:school-views-v1','sha256'),'hex'));
