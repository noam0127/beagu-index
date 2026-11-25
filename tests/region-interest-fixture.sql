\set ON_ERROR_STOP on
create role anon;create role authenticated;create role service_role bypassrls;
create schema auth;create schema extensions;create schema beagu_private;
create extension pgcrypto schema extensions;
create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create table public.beagu_admin_accounts(user_id uuid,enabled bool);
create table public.beagu_lv1_office_directory(sido_standard text,support_office text);
insert into public.beagu_lv1_office_directory values ('부산','부산광역시북부교육지원청'),('경기','경기도광명교육지원청'),('서울','서울특별시강남서초교육지원청'),('강원','강원특별자치도강릉교육지원청'),('경남','창원교육지원청(마산센터)'),('인천','인천광역시서부교육지원청');
create table beagu_private.school_search_settings(name text,salt text);
insert into beagu_private.school_search_settings values('salt','fixture-only');
create table beagu_private.school_view_admin_exclusions(visitor_digest text);
