-- Disposable CI only. Adds AUTH session and admin account metadata.
create table auth.sessions (
 id uuid primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 not_after timestamptz
);
insert into auth.sessions(id,user_id,not_after)
values
 ('99999999-9999-4999-8999-999999999999',
  '11111111-1111-4111-8111-111111111111',now()+interval '1 hour'),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '11111111-1111-4111-8111-111111111111',now()-interval '1 hour');

create table public.beagu_admin_accounts (
 user_id uuid primary key references auth.users(id) on delete cascade,
 role text not null,
 enabled boolean not null default true
);
insert into auth.users(id,email_confirmed_at,is_anonymous,raw_user_meta_data)
values('44444444-4444-4444-8444-444444444444',now(),false,'{}');
insert into public.beagu_admin_accounts(user_id,role,enabled)
values('44444444-4444-4444-8444-444444444444','owner',true);
alter table public.beagu_admin_accounts enable row level security;
revoke all on public.beagu_admin_accounts from public,anon,authenticated;
grant select on public.beagu_admin_accounts to service_role;
