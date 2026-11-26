-- REVIEW ONLY. Install in disposable PostgreSQL after legacy archive and verified Run4 adapter.
-- Keep legacy records, verified rows, existing points receipts and local storage unchanged.
begin;
create or replace function public.beagu_run_unified_records_v11120(p_tier text,p_page integer,p_top_only boolean)
returns jsonb language sql stable security invoker set search_path='' as $$
 with eligible as (
  select a.game,a.session_id,a.score,a.created_at,a.school_id,a.school_name,a.difficulty,a.outcome,a.details
  from public.beagu_arcade_archive_v11115 a
  where a.game='teacher_run_retirement'
  union all
  select a.game,a.session_id,a.score,a.created_at,a.school_id,a.school_name,a.difficulty,a.outcome,a.details
  from public.beagu_arcade_archive_v11115 a
  join public.arcade_run4_records_candidate r on r.session_id=a.session_id
    and r.verification_status='verified' and r.score=a.score
  join public.arcade_run4_sessions_candidate s on s.id=r.session_id
    and s.school_id=a.school_id and s.difficulty=a.difficulty
  where a.game='teacher_run_retirement_v4'
 ), ranked as (
  select * from eligible
  where (p_tier is null or p_tier in ('easy','normal','hard','very_hard','extreme'))
    and (p_tier is null or difficulty=p_tier)
    and p_page between 1 and 4 and p_top_only is not null
  order by score desc,created_at,game,session_id
  limit case when p_top_only then 10 when p_page=4 then 10 else 31 end
  offset case when p_top_only then 0 else greatest(0,least(3,coalesce(p_page,1)-1))*30 end
 )
 select coalesce(jsonb_agg(jsonb_build_object(
 'score',score,'createdAt',created_at,'schoolId',school_id,'schoolName',school_name,
 'difficulty',difficulty,'winTimeTenths',null,
 'details',jsonb_strip_nulls(jsonb_build_object('outcome',outcome,'endAge',details->'endAge',
 'playedSeconds',details->'playedSeconds','baseScore',details->'baseScore','retirementBonus',details->'retirementBonus',
 'nearMisses',details->'nearMisses','hits',details->'hits','livesLeft',details->'livesLeft',
 'healthPercent',details->'healthPercent','bossCount',details->'bossCount')))
 order by score desc,created_at,game,session_id),'[]'::jsonb) from ranked
$$;
revoke all on function public.beagu_run_unified_records_v11120(text,integer,boolean) from public,anon,authenticated;
grant execute on function public.beagu_run_unified_records_v11120(text,integer,boolean) to service_role;
commit;
