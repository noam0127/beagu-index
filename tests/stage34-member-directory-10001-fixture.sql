-- Isolated PostgreSQL16 synthetic fixture. 10,001 deliberately fake Auth
-- records only, no production account, message, phone or survey data.
create schema if not exists auth;
do $role$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname='service_role')
    then create role service_role nologin; end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname='anon')
    then create role anon nologin; end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname='authenticated')
    then create role authenticated nologin; end if;
end $role$;
create table if not exists auth.users (
  id uuid primary key,
  email text,
  email_confirmed_at timestamptz,
  created_at timestamptz not null,
  last_sign_in_at timestamptz,
  banned_until timestamptz
);
create table if not exists public.beagu_admin_accounts (
  user_id uuid primary key,
  role text not null,
  enabled boolean not null default true
);
truncate table auth.users cascade;
truncate table public.beagu_admin_accounts;

insert into auth.users(
 id,email,email_confirmed_at,created_at,last_sign_in_at,banned_until
)
select
 ('00000000-0000-4000-8000-'||pg_catalog.lpad(pg_catalog.to_hex(n),12,'0'))::uuid,
 'teacher'||pg_catalog.lpad(n::text,5,'0')||'@example.test',
 case when n%4=0 then null
   else '2026-01-01 00:00:00+00'::timestamptz end,
 '2026-01-01 00:00:00+00'::timestamptz + n * interval '1 second',
 null,
 case when n%10=0 then '2099-12-31 00:00:00+00'::timestamptz else null end
from pg_catalog.generate_series(1,10001) n;
insert into public.beagu_admin_accounts(user_id,role,enabled)
values('00000000-0000-4000-8000-000000000001','owner',true);

create index if not exists stage34_auth_users_created
 on auth.users (created_at desc,id desc);
analyze auth.users;

do $check$
begin
 if (select pg_catalog.count(*) from auth.users)<>10001 then
   raise exception 'Fixture must have exactly 10,001 synthetic users';
 end if;
end $check$;
select 'PASS: 10,001 synthetic authenticated user profiles provisioned in isolated PostgreSQL' as result;
