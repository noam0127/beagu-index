-- Hourly, aggregate-only telemetry health checks.
-- The hourly evaluation stores aggregate counters only.
create table if not exists beagu_private.beagu_telemetry_hourly_checks_v1(
  window_start timestamptz primary key,
  checked_at timestamptz not null default now(),
  guard_attempts bigint not null default 0,
  visit_allowed bigint not null default 0,
  rejected bigint not null default 0,
  saved_visits bigint not null default 0,
  monitor_status text not null check (monitor_status in ('insufficient','normal','warning')),
  alert_codes text[] not null default '{}'::text[]
);
alter table beagu_private.beagu_telemetry_hourly_checks_v1 enable row level security;
revoke all on beagu_private.beagu_telemetry_hourly_checks_v1 from public,anon,authenticated;

create index if not exists beagu_visits_visited_at_monitor_v1_idx
on beagu_private.visits (visited_at desc);

create or replace function beagu_private.beagu_telemetry_hourly_check_v1()
returns void language plpgsql security invoker set search_path=''
as $function$
declare
 v_end timestamptz:=pg_catalog.date_trunc('hour',now());
 v_begin timestamptz:=v_end-interval '1 hour';
 v_attempts bigint:=0;
 v_visit_allowed bigint:=0;
 v_rejected bigint:=0;
 v_saved bigint:=0;
 v_alerts text[]:=array[]::text[];
 v_status text:='insufficient';
begin
 -- Evaluate completed clock hours to avoid noisy partial-hour alerts.
 select coalesce(sum(hits),0),
        coalesce(sum(hits) filter(where action='visit' and reason='allowed'),0),
        coalesce(sum(hits) filter(where reason in ('source_limit','id_rotation')),0)
 into v_attempts,v_visit_allowed,v_rejected
 from beagu_private.beagu_telemetry_guard_decisions_v2
 where hour_start=v_begin;

 select count(*) into v_saved from beagu_private.visits
 where visited_at>=v_begin and visited_at<v_end;

 if v_attempts>=30 then
   if v_rejected>=10 and v_rejected::numeric/v_attempts>=0.10 then
     v_alerts:=pg_catalog.array_append(v_alerts,'rejections');
   end if;
 end if;
 if v_visit_allowed>=20 and v_saved=0 then
   v_alerts:=pg_catalog.array_append(v_alerts,'visit_gap_suspected');
 end if;

 if pg_catalog.array_length(v_alerts,1)>0 then
   v_status:='warning';
 elsif v_attempts>=30 then
   v_status:='normal';
 end if;
 insert into beagu_private.beagu_telemetry_hourly_checks_v1
   (window_start,checked_at,guard_attempts,visit_allowed,rejected,saved_visits,monitor_status,alert_codes)
 values(v_begin,now(),v_attempts,v_visit_allowed,v_rejected,v_saved,v_status,v_alerts)
 on conflict(window_start) do update set
   checked_at=excluded.checked_at,
   guard_attempts=excluded.guard_attempts,
   visit_allowed=excluded.visit_allowed,
   rejected=excluded.rejected,
   saved_visits=excluded.saved_visits,
   monitor_status=excluded.monitor_status,
   alert_codes=excluded.alert_codes;
 delete from beagu_private.beagu_telemetry_hourly_checks_v1
 where window_start<now()-interval '7 days';
end;
$function$;
revoke all on function beagu_private.beagu_telemetry_hourly_check_v1()
  from public,anon,authenticated;

-- Preserve existing API contract, enrich only with compact hourly evaluation.
create or replace function public.beagu_admin_telemetry_health_v2()
returns jsonb language plpgsql stable security definer set search_path=''
as $function$
declare
  v_result jsonb;
  v_monitor jsonb;
begin
  with decisions as (
    select coalesce(sum(hits),0)::bigint as attempted,
           coalesce(sum(hits) filter(where reason='allowed'),0)::bigint as allowed,
           coalesce(sum(hits) filter(where reason='source_limit'),0)::bigint as rate_limited,
           coalesce(sum(hits) filter(where reason='id_rotation'),0)::bigint as id_rotation,
           min(hour_start) as first_hour
    from beagu_private.beagu_telemetry_guard_decisions_v2
    where hour_start >= now() - interval '24 hours'
  ),
  visits as (
    select count(*)::bigint as saved_24h,
           max(visited_at) as latest_saved
      from beagu_private.visits
     where visited_at>=now()-interval '24 hours'
  )
  select pg_catalog.jsonb_build_object(
    'as_of',now(),'window_hours',24,'guard_attempts',d.attempted,
    'guard_allowed',d.allowed,'guard_source_limited',d.rate_limited,
    'guard_id_rotation_limited',d.id_rotation,
    'decisions_since',d.first_hour,
    'saved_visits_24h',v.saved_24h,'latest_saved_visit',v.latest_saved,
    'http_error_rate_measured',false,
    'human_false_positive_rate_measured',false
  ) into v_result from decisions d cross join visits v;

  select pg_catalog.jsonb_build_object(
    'window_start',window_start,'checked_at',checked_at,
    'status',monitor_status,'alert_codes',alert_codes,
    'attempts',guard_attempts,'rejected',rejected,
    'visit_allowed',visit_allowed,'saved_visits',saved_visits
  ) into v_monitor
  from beagu_private.beagu_telemetry_hourly_checks_v1
  order by window_start desc limit 1;
  return v_result || pg_catalog.jsonb_build_object('hourly_monitor',v_monitor);
end;
$function$;
revoke all on function public.beagu_admin_telemetry_health_v2() from public,anon,authenticated;
grant execute on function public.beagu_admin_telemetry_health_v2() to service_role;

-- Run at HH:07 UTC; evaluates the completed preceding hour.
select cron.schedule(
  'beagu-telemetry-hourly-monitor-v1',
  '7 * * * *',
  $job$select beagu_private.beagu_telemetry_hourly_check_v1()$job$
);
