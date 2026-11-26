-- Candidate only. Install after verified percentile v1.3 approval pipeline.
-- No source version is enabled by default. Owner must explicitly select the
-- validated 2026 verticality PERCENT_RANK source and matching method.
begin;
create table if not exists beagu_private.beagu_2026_home_rank_config_v1(
 singleton boolean primary key default true check(singleton),
 source_version text not null check(length(source_version) between 8 and 160),
 percentile_method text not null check(length(trim(percentile_method))>0)
);
create table if not exists beagu_private.beagu_2026_home_rank_daily_v1(
 day date not null, access_level integer not null check(access_level in(1,2)),
 source_version text not null, percentile_method text not null,
 rows jsonb not null check(jsonb_typeof(rows)='array' and jsonb_array_length(rows)<=10),
 generated_at timestamptz not null default now(), primary key(day,access_level)
);
alter table beagu_private.beagu_2026_home_rank_config_v1 enable row level security;
alter table beagu_private.beagu_2026_home_rank_daily_v1 enable row level security;
revoke all on beagu_private.beagu_2026_home_rank_config_v1,beagu_private.beagu_2026_home_rank_daily_v1 from public,anon,authenticated;
grant select on beagu_private.beagu_2026_home_rank_config_v1,beagu_private.beagu_2026_home_rank_daily_v1 to service_role;
create or replace function public.beagu_2026_home_ranking_refresh_v1()
returns void language plpgsql security invoker set search_path='' as $$
declare cfg beagu_private.beagu_2026_home_rank_config_v1; tier integer; result jsonb;
begin
 perform pg_catalog.pg_advisory_xact_lock(20261119,2026);
 select * into cfg from beagu_private.beagu_2026_home_rank_config_v1 where singleton;
 if not found then return; end if;
 for tier in 1..2 loop
  with latest as (
   select distinct on (school_id) school_id,source_version,percentile_method,decision
   from beagu_private.beagu_2026_percentile_v13_decisions
   where access_level=tier order by school_id,id desc
  ), candidates as (
   select c.school_id,c.percentile,row_number() over(order by c.school_id) as rn
   from beagu_private.beagu_2026_percentile_v13_current c
   join public.schools s on s.school_id=c.school_id and s.status='운영'
   join latest l on l.school_id=c.school_id and l.source_version=c.source_version
     and l.percentile_method=c.percentile_method and l.decision='APPROVE'
   where c.source_version=cfg.source_version and c.percentile_method=cfg.percentile_method
  ), batches as (
   select array_agg(school_id order by school_id)::text[] ids from candidates group by (rn-1)/20
  ), approved as (
   select e.key as school_id,(e.value #>> '{}')::numeric as percentile
   from batches b cross join lateral jsonb_each(public.beagu_2026_percentile_v13_values(b.ids,tier)) e
  ), eligible as (
   select c.school_id,c.percentile,s.school_name,coalesce(s.sido_standard,s.sido,'') as region
   from candidates c join approved a using(school_id,percentile) join public.schools s using(school_id)
  ), ranked as (
   select school_id,school_name,region,percentile,rank() over(order by percentile desc) as rank
   from eligible order by percentile desc,school_id asc limit 10
  )
  select coalesce(jsonb_agg(jsonb_build_object('school_id',school_id,'school_name',school_name,'region',region,'percentile',percentile,'rank',rank) order by percentile desc,school_id),'[]'::jsonb) into result from ranked;
  insert into beagu_private.beagu_2026_home_rank_daily_v1(day,access_level,source_version,percentile_method,rows,generated_at)
  values((now() at time zone 'Asia/Seoul')::date,tier,cfg.source_version,cfg.percentile_method,result,now())
  on conflict(day,access_level) do update set source_version=excluded.source_version,percentile_method=excluded.percentile_method,rows=excluded.rows,generated_at=excluded.generated_at;
 end loop;
end $$;
revoke all on function public.beagu_2026_home_ranking_refresh_v1() from public,anon,authenticated,service_role;
create or replace function public.beagu_2026_home_ranking_read_v1(p_level integer)
returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce((
  select case when not exists(
   select 1 from jsonb_array_elements(d.rows) e
   where not exists(
    select 1 from (
     select source_version,percentile_method,decision
     from beagu_private.beagu_2026_percentile_v13_decisions x
     where x.school_id=e->>'school_id' and x.access_level=p_level
     order by x.id desc limit 1
    ) l
    join beagu_private.beagu_2026_percentile_v13_current v
      on v.school_id=e->>'school_id' and v.source_version=l.source_version
      and v.percentile_method=l.percentile_method and v.percentile=(e->>'percentile')::numeric
    join public.schools s on s.school_id=v.school_id and s.status='운영'
    where l.source_version=d.source_version and l.percentile_method=d.percentile_method
      and l.decision='APPROVE'
   )
  ) then jsonb_build_object('day',d.day,'rows',d.rows)
    else jsonb_build_object('day',null,'rows','[]'::jsonb) end
  from beagu_private.beagu_2026_home_rank_daily_v1 d
  join beagu_private.beagu_2026_home_rank_config_v1 c on c.singleton and d.source_version=c.source_version and d.percentile_method=c.percentile_method
  where jsonb_array_length(d.rows)<=10 and p_level in(1,2) and d.access_level=p_level and d.day<=(now() at time zone 'Asia/Seoul')::date
  order by d.day desc limit 1
 ),jsonb_build_object('day',null,'rows','[]'::jsonb))
$$;
revoke all on function public.beagu_2026_home_ranking_read_v1(integer) from public,anon,authenticated;
grant execute on function public.beagu_2026_home_ranking_read_v1(integer) to service_role;
commit;
-- DO NOT run in production without separate owner authorization.
-- After source/method verification, configure the singleton using the reviewed
-- source version + method, then install the UTC cron schedule (15:00 UTC=00:00 KST):
-- select cron.schedule('beagu-2026-home-ranking-midnight-v1','0 15 * * *','select public.beagu_2026_home_ranking_refresh_v1()');
