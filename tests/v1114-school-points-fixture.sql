-- Disposable test database only. No production connection.
create role anon;
create role authenticated;
create role service_role bypassrls;
create table public.arcade_game_scores(
 id bigint generated always as identity primary key,
 session_id uuid not null unique,game text not null,score integer not null,
 school_id text,school_name text
);
alter table public.arcade_game_scores enable row level security;
revoke all on public.arcade_game_scores from public,anon,authenticated;
grant select,insert,delete on public.arcade_game_scores to service_role;
grant usage,select on sequence public.arcade_game_scores_id_seq to service_role;
-- Reproduce the TOP100 pruning contract with a smaller cap for testing.
create function public.arcade_enforce_game_record_limits() returns trigger language plpgsql as $$
begin
 delete from public.arcade_game_scores where id in
 (select id from public.arcade_game_scores where game=new.game order by score desc,id asc offset 2);
 return new;
end $$;
create trigger arcade_limit_game_record_insert after insert on public.arcade_game_scores
for each row execute function public.arcade_enforce_game_record_limits();
insert into public.arcade_game_scores(session_id,game,score,school_id,school_name) values
 ('00000000-0000-4000-8000-000000000001','volleyball_25',100,'1234567','동명초'),
 ('00000000-0000-4000-8000-000000000002','teacher_run_retirement',200,'1234567','동명초'),
 ('00000000-0000-4000-8000-000000000003','volleyball_25',500,'7654321','동명초');
