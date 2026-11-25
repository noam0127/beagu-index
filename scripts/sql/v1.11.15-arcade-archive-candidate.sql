-- REVIEW ONLY: apply in disposable PostgreSQL after v1.11.14 points and, if present, verified Run4 store.
begin;
lock table public.arcade_game_scores in share row exclusive mode;
create table if not exists public.beagu_arcade_archive_v11115(
 game text not null check(game in ('volleyball_25','teacher_run_retirement','teacher_run_retirement_v4')),
 session_id uuid not null, school_id text, school_name text, difficulty text,
 score integer not null check(score>=0), created_at timestamptz not null,
 outcome text not null check(outcome in ('victory','defeat','stopped','retired','retired_early','unknown')),
 win_time_tenths integer, details jsonb not null default '{}',
 primary key(game,session_id)
);
alter table public.beagu_arcade_archive_v11115 enable row level security;
revoke all on public.beagu_arcade_archive_v11115 from public,anon,authenticated;
grant select,insert on public.beagu_arcade_archive_v11115 to service_role;
create index if not exists beagu_arcade_archive_score_v11115 on public.beagu_arcade_archive_v11115(game,score desc,created_at,session_id);
create index if not exists beagu_arcade_archive_school_v11115 on public.beagu_arcade_archive_v11115(school_id,game);
create or replace function public.beagu_archive_legacy_v11115() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.game in ('volleyball_25','teacher_run_retirement') and new.session_id is not null and new.score>=0 then
  insert into public.beagu_arcade_archive_v11115(game,session_id,school_id,school_name,difficulty,score,created_at,outcome,win_time_tenths,details)
  values(new.game,new.session_id,new.school_id,new.school_name,new.difficulty,new.score,new.created_at,
   case when new.game='volleyball_25' and new.public_result->>'outcome' in ('victory','defeat','stopped') then new.public_result->>'outcome'
   when new.game='teacher_run_retirement' and new.public_result->>'outcome' in ('retired','retired_early') then new.public_result->>'outcome' else 'unknown' end,
   new.win_time_tenths,coalesce(new.public_result,'{}'::jsonb)) on conflict do nothing;
 end if;return new;
end $$;
revoke all on function public.beagu_archive_legacy_v11115() from public,anon,authenticated;
grant execute on function public.beagu_archive_legacy_v11115() to service_role;
insert into public.beagu_arcade_archive_v11115(game,session_id,school_id,school_name,difficulty,score,created_at,outcome,win_time_tenths,details)
select game,session_id,school_id,school_name,difficulty,score,created_at,
 case when game='volleyball_25' and public_result->>'outcome' in ('victory','defeat','stopped') then public_result->>'outcome'
 when game='teacher_run_retirement' and public_result->>'outcome' in ('retired','retired_early') then public_result->>'outcome' else 'unknown' end,
 win_time_tenths,coalesce(public_result,'{}'::jsonb)
from public.arcade_game_scores where game in ('volleyball_25','teacher_run_retirement') and session_id is not null and score>=0 on conflict do nothing;
drop trigger if exists aa_beagu_archive_v11115 on public.arcade_game_scores;
create trigger aa_beagu_archive_v11115 after insert on public.arcade_game_scores for each row execute function public.beagu_archive_legacy_v11115();
-- 4.0 adapter is a separate migration; absent official tables must not break legacy.
create or replace function public.beagu_arcade_history_v11115(p_game text,p_tier text,p_page integer)
returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('score',r.score,'createdAt',r.created_at,'schoolId',r.school_id,'schoolName',r.school_name,'difficulty',r.difficulty,'version',case r.game when 'teacher_run_retirement_v4' then '4.0' when 'teacher_run_retirement' then '3.0' else '1.0' end,'winTimeTenths',r.win_time_tenths,'details',r.details) order by r.score desc,r.created_at,r.game,r.session_id),'[]'::jsonb)
 from (select * from public.beagu_arcade_archive_v11115 where
 (game=p_game or (p_game='teacher_run_retirement' and game='teacher_run_retirement_v4'))
 and (p_tier is null or difficulty=p_tier) and p_page between 1 and 10000
 order by score desc,created_at,game,session_id limit 31 offset greatest(0,least(9999,coalesce(p_page,1)-1))*30) r
$$;
-- Existing point receipts include scores already pruned since the points launch.
-- Use those for legacy totals and add only verified 4.0 scores, not legacy archive scores again.
create or replace function public.beagu_arcade_school_rank_v11115(p_game text)
returns jsonb language sql stable security invoker set search_path='' as $$
 with totals as (
 select a.school_id, sum(a.score)::bigint points,
 count(*) filter(where a.outcome='victory') wins,count(*) filter(where a.outcome='defeat') losses,
 count(*) filter(where a.outcome='stopped') stopped,count(*) filter(where a.outcome='unknown') unknown,
 count(*) filter(where a.outcome='retired') retired
 from public.beagu_arcade_archive_v11115 a
 where a.school_id ~ '^[A-Z0-9]{7}$' and (a.game=p_game or (p_game='teacher_run_retirement' and a.game='teacher_run_retirement_v4'))
 group by a.school_id
 ), ranked as (
 select t.*,s.school_name from totals t join public.schools s on s.school_id=t.school_id
 order by t.points desc,t.school_id limit 10
 )
 select coalesce(jsonb_agg(to_jsonb(r) order by r.points desc,r.school_id),'[]'::jsonb) from ranked r
$$;
create or replace function public.beagu_school_game_points(p_school_ids text[])
returns table(school_id text,points bigint) language sql stable security invoker set search_path='' as $$
 select ids.school_id,coalesce(t.points,0::bigint)+coalesce(v.points,0::bigint)
 from (select distinct id as school_id from unnest(p_school_ids) x(id) where id ~ '^[A-Z0-9]{7}$' and cardinality(p_school_ids)<=40) ids
 left join public.beagu_school_game_point_totals t on t.school_id=ids.school_id
 left join (select a.school_id,sum(a.score)::bigint points from public.beagu_arcade_archive_v11115 a where a.game='teacher_run_retirement_v4' and a.school_id=any(p_school_ids) group by a.school_id) v on v.school_id=ids.school_id
$$;
-- School card totals are public aggregate only. SECURITY DEFINER narrowly projects IDs and sums.
alter function public.beagu_school_game_points(text[]) security definer;
revoke all on function public.beagu_arcade_history_v11115(text,text,integer),public.beagu_arcade_school_rank_v11115(text) from public,anon,authenticated;
grant execute on function public.beagu_arcade_history_v11115(text,text,integer),public.beagu_arcade_school_rank_v11115(text) to service_role;
commit;
