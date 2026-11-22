-- Stage38 isolated staging only (ycwuugggqbunlbwuzvbx).
-- PRODUCTION PROJECT snvzwrexuqavnfvzgxqj MUST NOT RUN THIS FILE.
-- Exact service-role aggregate RPC from 20261120_admin_page_perf_v1.sql.
-- Excludes unrelated ingestion code and cron registration: those require a separate review.
-- Never fabricate analytics: empty source table gives rows=[].

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
