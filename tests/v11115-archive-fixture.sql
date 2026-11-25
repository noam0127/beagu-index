-- Extend existing disposable fixture; all identities synthetic.
alter table public.arcade_game_scores add column difficulty text default 'hard',add column created_at timestamptz not null default now(),add column public_result jsonb default '{}',add column win_time_tenths integer;
create table public.schools(school_id text primary key,school_name text);
insert into public.schools values('1234567','동명초'),('7654321','동명초');
grant select on public.schools to service_role;
