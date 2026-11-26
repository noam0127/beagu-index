-- Disposable PostgreSQL only. Never run against the operating database.
create role anon;
create role authenticated;
create role service_role bypassrls;
create table public.beagu_level_sessions(
 token_sha256 text primary key, access_level int not null, expires_at timestamptz not null,
 identity_campaign text, identity_visitor_id uuid
);
grant select,insert,update on public.beagu_level_sessions to service_role;
create table public.fixture_earned(visitor uuid primary key);
insert into public.fixture_earned values ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
grant select on public.fixture_earned to service_role;
create function public.beagu_has_earned_challenge_visitor(p_visitor uuid)
returns boolean language sql security invoker set search_path='' as $$
 select exists(select 1 from public.fixture_earned where visitor=p_visitor);
$$;
revoke all on function public.beagu_has_earned_challenge_visitor(uuid) from public;
grant execute on function public.beagu_has_earned_challenge_visitor(uuid) to service_role;
insert into public.beagu_level_sessions values
 (repeat('a',64),2,now()+interval '1 hour','2026','11111111-1111-4111-8111-111111111111'),
 (repeat('b',64),2,now()+interval '1 hour','2026','22222222-2222-4222-8222-222222222222'),
 (repeat('c',64),2,now()+interval '1 hour',null,null),
 (repeat('d',64),1,now()+interval '1 hour','2026','11111111-1111-4111-8111-111111111111'),
 (repeat('e',64),2,now()-interval '1 hour','2026','11111111-1111-4111-8111-111111111111');
