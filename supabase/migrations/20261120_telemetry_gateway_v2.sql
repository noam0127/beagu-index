-- Stage 2: server-mediated visits and presence.
-- The Edge Function passes only an HMAC of the inbound source address, never
-- the raw IP, and rotates the HMAC daily. Public RPC access is revoked only
-- AFTER the new browser assets have been deployed and verified.
create table if not exists beagu_private.beagu_telemetry_source_windows_v2 (
  source_hash text not null,
  action text not null check(action in ('visit','ping')),
  window_kind text not null check(window_kind in ('minute','hour')),
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (source_hash, action, window_kind, window_start)
);
create table if not exists beagu_private.beagu_telemetry_source_visitors_v2 (
  source_hash text not null,
  visitor_id uuid not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key(source_hash,visitor_id)
);
create index if not exists beagu_telemetry_source_visitors_recent_v2_idx
  on beagu_private.beagu_telemetry_source_visitors_v2(source_hash,first_seen_at desc);
alter table beagu_private.beagu_telemetry_source_windows_v2 enable row level security;
alter table beagu_private.beagu_telemetry_source_visitors_v2 enable row level security;
revoke all on beagu_private.beagu_telemetry_source_windows_v2 from public,anon,authenticated;
revoke all on beagu_private.beagu_telemetry_source_visitors_v2 from public,anon,authenticated;
-- No IP or user-agent values are stored. Service-role-only atomic counters.
create or replace function public.beagu_telemetry_guard_v2(
  p_source_hash text, p_visitor uuid, p_action text
) returns boolean
language plpgsql security definer set search_path = ''
as $function$
declare
  v_min integer;
  v_hour integer;
  v_5m bigint;
  v_1h bigint;
  v_now timestamptz := now();
begin
  if p_source_hash !~ '^[0-9a-f]{64}$' or p_action not in ('visit','ping')
     or p_visitor is null or
     p_visitor::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'INVALID_TELEMETRY' using errcode='22023';
  end if;
  -- Unique source/action minute and hour rows serialize concurrent increments.
  insert into beagu_private.beagu_telemetry_source_windows_v2
    (source_hash, action, window_kind, window_start, hits)
  values (p_source_hash, p_action, 'minute', pg_catalog.date_trunc('minute',v_now),1)
  on conflict (source_hash,action,window_kind,window_start)
    do update set hits=beagu_private.beagu_telemetry_source_windows_v2.hits+1
  returning hits into v_min;
  insert into beagu_private.beagu_telemetry_source_windows_v2
    (source_hash, action, window_kind, window_start, hits)
  values (p_source_hash, p_action, 'hour', pg_catalog.date_trunc('hour',v_now),1)
  on conflict (source_hash,action,window_kind,window_start)
    do update set hits=beagu_private.beagu_telemetry_source_windows_v2.hits+1
  returning hits into v_hour;

  if v_min > case p_action when 'visit' then 240 else 500 end
     or v_hour > case p_action when 'visit' then 2000 else 6000 end
  then return false; end if;

  insert into beagu_private.beagu_telemetry_source_visitors_v2
    (source_hash,visitor_id,first_seen_at,last_seen_at)
  values (p_source_hash,p_visitor,v_now,v_now)
  on conflict (source_hash,visitor_id)
    do update set last_seen_at=excluded.last_seen_at;
  select count(*) filter(where first_seen_at>=v_now-interval '5 minutes'),
         count(*) filter(where first_seen_at>=v_now-interval '1 hour')
    into v_5m,v_1h
    from beagu_private.beagu_telemetry_source_visitors_v2
   where source_hash=p_source_hash and first_seen_at>=v_now-interval '1 hour';
  return v_5m<=100 and v_1h<=400;
end;
$function$;
revoke all on function public.beagu_telemetry_guard_v2(text,uuid,text)
  from public,anon,authenticated;
grant execute on function public.beagu_telemetry_guard_v2(text,uuid,text) to service_role;

-- Preserve the visit-counter response contract when recording is rate-limited.
create or replace function public.beagu_telemetry_totals_v2()
returns jsonb language sql stable security definer set search_path = ''
as $function$
  select pg_catalog.jsonb_build_object(
    'today', count(distinct visitor_id) filter (
      where visit_day=(now() at time zone 'Asia/Seoul')::date),
    'month', count(distinct visitor_id) filter (
      where visit_day>=pg_catalog.date_trunc('month',now() at time zone 'Asia/Seoul')::date),
    'total',count(distinct visitor_id),
    'as_of',(now() at time zone 'Asia/Seoul')::date,
    'rate_limited',true
  )
  from beagu_private.visits;
$function$;
revoke all on function public.beagu_telemetry_totals_v2() from public,anon,authenticated;
grant execute on function public.beagu_telemetry_totals_v2() to service_role;

-- Existing pg_cron extension and 48-hour presence retention were verified.
select cron.schedule('beagu-telemetry-source-retention-v2','43 * * * *',
  $job$delete from beagu_private.beagu_telemetry_source_windows_v2
           where window_start < now()-interval '48 hours';
        delete from beagu_private.beagu_telemetry_source_visitors_v2
           where last_seen_at < now()-interval '48 hours'$job$);
