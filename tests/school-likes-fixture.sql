\set ON_ERROR_STOP on
create role anon;
create role authenticated;
create role service_role bypassrls;
create table public.schools(school_id text primary key,school_name text,sido text,sido_standard text,support_office text,address text,establishment text,status text);
create table public.beagu_level_sessions(token_sha256 text primary key,access_level int,identity_campaign text,identity_visitor_id uuid,expires_at timestamptz);
create table public.fixture_earned(visitor uuid primary key);
create function public.beagu_has_earned_challenge_visitor(p_visitor uuid) returns boolean language sql stable as $$select exists(select 1 from public.fixture_earned where visitor=p_visitor)$$;
grant select on public.schools,public.beagu_level_sessions,public.fixture_earned to service_role;
insert into public.schools select lpad(n::text,7,'0'),'학교'||lpad(n::text,2,'0'),'부산','부산','동래','주소','공립','운영' from generate_series(1,25) n;
insert into public.schools values('0000026','폐교','부산','부산','동래','주소','공립','폐교');
insert into public.fixture_earned values('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
insert into public.beagu_level_sessions values
(repeat('a',64),2,'2026','11111111-1111-4111-8111-111111111111',now()+interval '1 hour'),
(repeat('b',64),2,'2026','11111111-1111-4111-8111-111111111111',now()+interval '1 hour'),
(repeat('c',64),2,'2026','22222222-2222-4222-8222-222222222222',now()+interval '1 hour'),
(repeat('d',64),1,'2026','11111111-1111-4111-8111-111111111111',now()+interval '1 hour'),
(repeat('e',64),2,'2026',null,now()+interval '1 hour'),
(repeat('f',64),2,'2026','11111111-1111-4111-8111-111111111111',now()-interval '1 hour');
