-- Privacy-limited Real User Monitoring for the private administrator dashboard.
-- No IP, URL search terms, device details, raw errors, survey responses or visitor
-- identifiers are stored in the long-lived performance sample table.
create table if not exists beagu_private.beagu_page_perf_samples_v1 (
 id bigint generated always as identity primary key,
 page text not null,
 operation text not null,
 duration_ms integer not null check(duration_ms between 1 and 120000),
 succeeded boolean not null,
 recorded_at timestamptz not null default now()
);
alter table beagu_private.beagu_page_perf_samples_v1 enable row level security;
revoke all on beagu_private.beagu_page_perf_samples_v1 from public,anon,authenticated;
create index if not exists beagu_page_perf_samples_time_idx
 on beagu_private.beagu_page_perf_samples_v1(recorded_at);
create table if not exists beagu_private.beagu_page_perf_rate_v1 (
 visitor_id uuid not null,
 page text not null,
 operation text not null,
 last_sample_at timestamptz not null default now(),
 primary key(visitor_id,page,operation)
);
alter table beagu_private.beagu_page_perf_rate_v1 enable row level security;
revoke all on beagu_private.beagu_page_perf_rate_v1 from public,anon,authenticated;
create index if not exists beagu_page_perf_rate_time_idx
 on beagu_private.beagu_page_perf_rate_v1(last_sample_at);

-- Anonymous reports cannot read performance data; only bounded fixed-category
-- events are accepted. 20-second per browser/page/operation limit is atomic.
create or replace function public.beagu_perf_record_v1(
 p_visitor uuid,p_page text,p_operation text,p_duration_ms integer,p_ok boolean
) returns boolean
language plpgsql security definer set search_path = ''
as $function$
declare v_accepted boolean:=false;
begin
 if p_visitor is null or substring(p_visitor::text from 15 for 1)<>'4'
    or p_page not in ('index','search','search-lv1','statistics',
       'school-report','result','challenge','volleyball','teacher-run')
    or p_operation not in ('navigation','school_search','school_selection','compare_directory')
    or p_duration_ms is null or p_duration_ms < 1 or p_duration_ms > 120000
    or p_ok is null then return false; end if;
 if (p_operation='school_selection' and p_page not in ('volleyball','teacher-run'))
    or (p_operation='compare_directory' and p_page<>'statistics')
    or (p_operation='school_search' and p_page not in
       ('search','search-lv1','volleyball','teacher-run')) then return false; end if;
 if exists(select 1 from public.beagu_admin_accounts a
           where a.user_id=auth.uid() and a.enabled=true) then return false; end if;
 insert into beagu_private.beagu_page_perf_rate_v1(visitor_id,page,operation,last_sample_at)
 values(p_visitor,p_page,p_operation,now())
 on conflict(visitor_id,page,operation) do update
  set last_sample_at=excluded.last_sample_at
  where beagu_private.beagu_page_perf_rate_v1.last_sample_at
    < now()-interval '20 seconds'
 returning true into v_accepted;
 if v_accepted is not true then return false; end if;
 insert into beagu_private.beagu_page_perf_samples_v1(page,operation,duration_ms,succeeded)
 values(p_page,p_operation,p_duration_ms,p_ok);
 return true;
end
$function$;
revoke all on function public.beagu_perf_record_v1(uuid,text,text,integer,boolean)
 from public,anon,authenticated;
grant execute on function public.beagu_perf_record_v1(uuid,text,text,integer,boolean)
 to anon,authenticated,service_role;

-- Service-role only aggregate. The HTTP Edge Function authenticates live AAL2
-- and allowlisted admin status before this RPC is ever invoked.
create or replace function public.beagu_admin_page_perf_v1(p_period text default '7d')
returns jsonb
language plpgsql security definer set search_path=''
as $function$
declare v_now timestamptz:=now();
declare v_start timestamptz;
declare v_rows jsonb;
begin
 if p_period not in ('today','7d','30d','all') then
  raise exception 'INVALID_PERIOD' using errcode='22023'; end if;
 v_start:=case p_period
  when 'today' then ((v_now at time zone 'Asia/Seoul')::date::timestamp at time zone 'Asia/Seoul')
  when '7d' then v_now-interval '7 days'
  else v_now-interval '30 days' end;
 select coalesce(jsonb_agg(jsonb_build_object(
   'page',b.page,'operation',b.operation,'samples',b.samples,
   'failures',b.failures,'failure_rate',b.failure_rate,
   'p50_ms',b.p50_ms,'p90_ms',b.p90_ms,'p99_ms',b.p99_ms)
   order by b.page,b.operation),'[]'::jsonb)
 into v_rows from (
  select page,operation,
   count(*)::bigint samples,
   count(*) filter(where not succeeded)::bigint failures,
   round(100.0*count(*) filter(where not succeeded)/nullif(count(*),0),1) failure_rate,
   percentile_disc(0.50) within group(order by duration_ms)
      filter(where succeeded)::integer p50_ms,
   percentile_disc(0.90) within group(order by duration_ms)
      filter(where succeeded)::integer p90_ms,
   percentile_disc(0.99) within group(order by duration_ms)
      filter(where succeeded)::integer p99_ms
  from beagu_private.beagu_page_perf_samples_v1
  where recorded_at>=v_start
  group by page,operation
 ) b;
 return jsonb_build_object('as_of',v_now,'period',p_period,
  'timezone','Asia/Seoul','retention_days',31,'all_limited_to_days',30,
  'sampled',true,'rows',v_rows);
end
$function$;
revoke all on function public.beagu_admin_page_perf_v1(text) from public,anon,authenticated;
grant execute on function public.beagu_admin_page_perf_v1(text) to service_role;

-- IDs are removed after two days; only unidentifiable aggregate samples remain
-- up to 31 days. Never purge by a browser request.
select cron.schedule('beagu-perf-samples-retention-31d','43 2 * * *',
 $job$delete from beagu_private.beagu_page_perf_samples_v1
 where recorded_at < now()-interval '31 days'$job$);
select cron.schedule('beagu-perf-rate-retention-48h','48 2 * * *',
 $job$delete from beagu_private.beagu_page_perf_rate_v1
 where last_sample_at < now()-interval '48 hours'$job$);
