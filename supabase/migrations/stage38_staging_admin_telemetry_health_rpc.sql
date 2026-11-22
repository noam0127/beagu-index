-- STAGE38 independent testing Supabase only: ycwuugggqbunlbwuzvbx
-- NEVER apply to production project snvzwrexuqavnfvzgxqj.
-- Exact DDL, guard and health RPC fragments from original 20261120 migrations.
-- No source-IP / browser identities copied, no production observations imported.
-- No cron, gateway deployment, public RPC grant, client traffic or fake analytics.
-- An empty telemetry table means no recorded observations, NOT proven healthy traffic.
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

create table if not exists beagu_private.beagu_telemetry_guard_decisions_v2(
  hour_start timestamptz not null,
  action text not null check(action in ('visit','ping')),
  reason text not null check(reason in ('allowed','source_limit','id_rotation')),
  hits bigint not null default 0 check(hits>=0),
  primary key(hour_start,action,reason)
);
alter table beagu_private.beagu_telemetry_guard_decisions_v2 enable row level security;
revoke all on beagu_private.beagu_telemetry_guard_decisions_v2 from public,anon,authenticated;

create or replace function beagu_private.beagu_note_telemetry_guard_v2(
  p_action text,p_reason text
) returns void
language plpgsql security invoker set search_path=''
as $function$
begin
  if p_action not in ('visit','ping') or
     p_reason not in ('allowed','source_limit','id_rotation') then
    raise exception 'INVALID_GUARD_DECISION' using errcode='22023';
  end if;
  insert into beagu_private.beagu_telemetry_guard_decisions_v2
    (hour_start,action,reason,hits)
  values(pg_catalog.date_trunc('hour',now()),p_action,p_reason,1)
  on conflict(hour_start,action,reason)
  do update set hits=beagu_private.beagu_telemetry_guard_decisions_v2.hits+1;
end;
$function$;
revoke all on function beagu_private.beagu_note_telemetry_guard_v2(text,text)
  from public,anon,authenticated;

create or replace function public.beagu_telemetry_guard_v2(
  p_source_hash text, p_visitor uuid, p_action text
) returns boolean
language plpgsql security definer set search_path=''
as $function$
declare
  v_min integer;
  v_hour integer;
  v_limit_min integer;
  v_limit_hour integer;
  v_5m bigint;
  v_1h bigint;
  v_now timestamptz:=now();
begin
  if p_source_hash !~ '^[0-9a-f]{64}$' or p_action not in ('visit','ping')
     or p_visitor is null or
     p_visitor::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'INVALID_TELEMETRY' using errcode='22023';
  end if;
  insert into beagu_private.beagu_telemetry_source_windows_v2
    (source_hash,action,window_kind,window_start,hits)
  values(p_source_hash,p_action,'minute',pg_catalog.date_trunc('minute',v_now),1)
  on conflict(source_hash,action,window_kind,window_start)
    do update set hits=beagu_private.beagu_telemetry_source_windows_v2.hits+1
  returning hits into v_min;

  insert into beagu_private.beagu_telemetry_source_windows_v2
    (source_hash,action,window_kind,window_start,hits)
  values(p_source_hash,p_action,'hour',pg_catalog.date_trunc('hour',v_now),1)
  on conflict(source_hash,action,window_kind,window_start)
    do update set hits=beagu_private.beagu_telemetry_source_windows_v2.hits+1
  returning hits into v_hour;

  v_limit_min:=case when p_action='visit' then 240 else 500 end;
  v_limit_hour:=case when p_action='visit' then 2000 else 6000 end;
  if v_min>v_limit_min or v_hour>v_limit_hour then
    perform beagu_private.beagu_note_telemetry_guard_v2(p_action,'source_limit');
    return false;
  end if;

  insert into beagu_private.beagu_telemetry_source_visitors_v2
    (source_hash,visitor_id,first_seen_at,last_seen_at)
  values(p_source_hash,p_visitor,v_now,v_now)
  on conflict(source_hash,visitor_id)
    do update set last_seen_at=excluded.last_seen_at;

  select count(*) filter (where first_seen_at>=v_now-interval '5 minutes'),
         count(*) filter (where first_seen_at>=v_now-interval '1 hour')
    into v_5m,v_1h
    from beagu_private.beagu_telemetry_source_visitors_v2
   where source_hash=p_source_hash and first_seen_at>=v_now-interval '1 hour';
  if v_5m>100 or v_1h>400 then
    perform beagu_private.beagu_note_telemetry_guard_v2(p_action,'id_rotation');
    return false;
  end if;
  perform beagu_private.beagu_note_telemetry_guard_v2(p_action,'allowed');
  return true;
end;
$function$;
revoke all on function public.beagu_telemetry_guard_v2(text,uuid,text) from public,anon,authenticated;
grant execute on function public.beagu_telemetry_guard_v2(text,uuid,text) to service_role;

create or replace function public.beagu_admin_telemetry_health_v2()
returns jsonb
language plpgsql stable security definer set search_path=''
as $function$
declare
  v_result jsonb;
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
  return v_result;
end;
$function$;
revoke all on function public.beagu_admin_telemetry_health_v2()
  from public,anon,authenticated;
grant execute on function public.beagu_admin_telemetry_health_v2() to service_role;
