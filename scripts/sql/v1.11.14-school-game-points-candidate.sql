-- v1.11.14 candidate only. Do not apply to production until isolated tests pass.
-- Counts verified inserts even when the existing TOP100 trigger later prunes them.
-- Historical rows already pruned cannot be reconstructed from this schema.
begin;
lock table public.arcade_game_scores in share row exclusive mode;
create table if not exists public.beagu_school_game_point_receipts(
 session_id uuid primary key,
 school_id text not null check(school_id ~ '^[A-Z0-9]{7}$'),
 points integer not null check(points>=0)
);
create table if not exists public.beagu_school_game_point_totals(
 school_id text primary key check(school_id ~ '^[A-Z0-9]{7}$'),
 points bigint not null check(points>=0)
);
alter table public.beagu_school_game_point_receipts enable row level security;
alter table public.beagu_school_game_point_totals enable row level security;
revoke all on public.beagu_school_game_point_receipts,public.beagu_school_game_point_totals from public,anon,authenticated;
grant select on public.beagu_school_game_point_totals to anon,authenticated;
drop policy if exists school_game_points_public_read on public.beagu_school_game_point_totals;
create policy school_game_points_public_read on public.beagu_school_game_point_totals for select to anon,authenticated using(true);
-- Only trusted score-insert code can reach this trigger; no direct public write.
create or replace function public.beagu_count_school_game_points() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.game not in ('volleyball_25','teacher_run_retirement') or
    new.school_id is null or new.school_id !~ '^[A-Z0-9]{7}$' or
    new.score is null or new.score<0 or new.session_id is null then return new; end if;
 insert into public.beagu_school_game_point_receipts(session_id,school_id,points)
 values(new.session_id,new.school_id,new.score) on conflict(session_id) do nothing;
 if found then
  insert into public.beagu_school_game_point_totals(school_id,points)
  values(new.school_id,new.score)
  on conflict(school_id) do update set points=public.beagu_school_game_point_totals.points+excluded.points;
 end if;
 return new;
end;
$$;
revoke all on function public.beagu_count_school_game_points() from public,anon,authenticated;
grant select,insert on public.beagu_school_game_point_receipts to service_role;
grant select,insert,update on public.beagu_school_game_point_totals to service_role;
grant execute on function public.beagu_count_school_game_points() to service_role;
-- Idempotent baseline: only retained verified rows, never fabricate missing old scores.
with added as (
 insert into public.beagu_school_game_point_receipts(session_id,school_id,points)
 select session_id,school_id,score from public.arcade_game_scores
 where game in ('volleyball_25','teacher_run_retirement') and school_id ~ '^[A-Z0-9]{7}$' and score>=0 and session_id is not null
 on conflict(session_id) do nothing returning school_id,points
)
insert into public.beagu_school_game_point_totals(school_id,points)
select school_id,sum(points)::bigint from added group by school_id
on conflict(school_id) do update set points=public.beagu_school_game_point_totals.points+excluded.points;
-- PostgreSQL fires same-kind triggers by name. aa_ precedes arcade_limit_game_record_insert.
drop trigger if exists aa_beagu_count_school_game_points on public.arcade_game_scores;
create trigger aa_beagu_count_school_game_points after insert on public.arcade_game_scores
for each row execute function public.beagu_count_school_game_points();
create or replace function public.beagu_school_game_points(p_school_ids text[])
returns table(school_id text,points bigint) language sql stable security invoker set search_path='' as $$
 select ids.school_id,coalesce(t.points,0::bigint)
 from (select distinct id as school_id from unnest(p_school_ids) as x(id)
       where id ~ '^[A-Z0-9]{7}$' and cardinality(p_school_ids)<=40) ids
 left join public.beagu_school_game_point_totals t on t.school_id=ids.school_id;
$$;
revoke all on function public.beagu_school_game_points(text[]) from public;
grant execute on function public.beagu_school_game_points(text[]) to anon,authenticated,service_role;
commit;
