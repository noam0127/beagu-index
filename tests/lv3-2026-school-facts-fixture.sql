-- Disposable PostgreSQL 16 only. No user identities, real schools, sources.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema beagu_private;
create table public.schools(school_id text primary key);
create table public.beagu_admin_accounts(
 user_id uuid primary key,role text,enabled boolean
);
create table beagu_private.lv3_release_control_v1(
 singleton boolean primary key default true,
 enabled boolean not null default false,
 approved_by uuid,approved_at timestamptz
);
insert into public.schools(school_id)
 values('A000001'),('A000002'),('A000003'),('A000004');
insert into public.beagu_admin_accounts(user_id,role,enabled)
 values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','owner',true);
insert into beagu_private.lv3_release_control_v1
 (singleton,enabled,approved_by,approved_at)
 values(true,false,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',now());
create view public.beagu_lv1_school_sort_index
 with (security_invoker=true) as
 select s.school_id,42::numeric as beagu_percentile_2025,
 5::bigint as view_count from public.schools s;
grant usage on schema beagu_private to service_role;
grant select on public.schools,public.beagu_admin_accounts,
 public.beagu_lv1_school_sort_index to service_role;
grant select on beagu_private.lv3_release_control_v1 to service_role;
