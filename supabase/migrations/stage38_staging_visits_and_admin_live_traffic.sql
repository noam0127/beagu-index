-- STAGE38 isolated staging ONLY: ycwuugggqbunlbwuzvbx
-- NEVER APPLY TO PRODUCTION PROJECT snvzwrexuqavnfvzgxqj.
-- All visits data remain synthetic until an authorized staging-only ingestion is live.
-- Columns, defaults, PK and 4 indexes checked against production pg_catalog metadata
-- via SELECT ONLY on 2026-11-22. No production data, identity, count or secret copied.
-- The admin exclusion trigger is from 20261120_admin_visit_search_exclusion.sql.
-- The aggregate RPC below is byte-for-byte from 20261120_admin_hourly_live_presence.sql.
-- No cron, no public visit writer, no telemetry gateway and no live deployment.
CREATE TABLE IF NOT EXISTS beagu_private.visits (
  event_id uuid PRIMARY KEY,
  visitor_id uuid NOT NULL,
  page text NOT NULL,
  visited_at timestamptz NOT NULL DEFAULT now(),
  visit_day date NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Seoul')::date)
);
ALTER TABLE beagu_private.visits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON beagu_private.visits FROM PUBLIC, anon, authenticated;
CREATE INDEX IF NOT EXISTS beagu_visit_day
  ON beagu_private.visits(visit_day, visitor_id);
CREATE INDEX IF NOT EXISTS beagu_visit_visitor
  ON beagu_private.visits(visitor_id);
CREATE INDEX IF NOT EXISTS beagu_visits_visited_at_monitor_v1_idx
  ON beagu_private.visits(visited_at DESC);
CREATE INDEX IF NOT EXISTS beagu_visits_visitor_recent_v1_idx
  ON beagu_private.visits(visitor_id, visited_at DESC);

create or replace function beagu_private.beagu_skip_admin_telemetry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if auth.uid() is not null and exists (
    select 1 from public.beagu_admin_accounts
    where user_id = auth.uid() and enabled = true
  ) then
    return null; -- cancel INSERT before the ordinary statistics can see it
  end if;
  return new;
end;
$fn$;
revoke all on function beagu_private.beagu_skip_admin_telemetry() from public, anon, authenticated;
DROP TRIGGER IF EXISTS beagu_skip_admin_visit ON beagu_private.visits;
CREATE TRIGGER beagu_skip_admin_visit
BEFORE INSERT ON beagu_private.visits
FOR EACH ROW EXECUTE FUNCTION beagu_private.beagu_skip_admin_telemetry();

create or replace function public.beagu_admin_live_traffic_v1(p_period text default 'today')
returns jsonb
language plpgsql security definer set search_path = ''
as $function$
declare
  v_now timestamptz := now();
  v_start timestamptz;
  v_slots jsonb;
  v_online bigint;
  v_pages jsonb;
begin
  if p_period not in ('today','7d','30d','all') then
    raise exception 'INVALID_PERIOD' using errcode='22023';
  end if;
  v_start := case p_period
    when 'today' then ((v_now at time zone 'Asia/Seoul')::date::timestamp at time zone 'Asia/Seoul')
    when '7d' then v_now - interval '7 days'
    when '30d' then v_now - interval '30 days'
    else '2000-01-01 00:00:00+00'::timestamptz end;
  select coalesce(jsonb_agg(jsonb_build_object('hour',hours.h,'views',coalesce(v.hits,0))
                            order by hours.h),'[]'::jsonb)
  into v_slots
  from generate_series(0,23) as hours(h)
  left join (
    select extract(hour from visited_at at time zone 'Asia/Seoul')::integer as hour,
           count(*)::bigint as hits
    from beagu_private.visits
    where visited_at >= v_start
    group by 1
  ) v on v.hour = hours.h;
  select count(*) into v_online
    from beagu_private.beagu_live_presence_v1
   where last_seen_at >= v_now - interval '5 minutes';
  select coalesce(jsonb_agg(jsonb_build_object('page',q.page,'browsers',q.browsers)
                            order by q.browsers desc,q.page),'[]'::jsonb)
  into v_pages
  from (
    select page,count(*)::bigint as browsers
      from beagu_private.beagu_live_presence_v1
     where last_seen_at >= v_now - interval '5 minutes'
     group by page order by browsers desc limit 15
  ) q;
  return jsonb_build_object('as_of',v_now,'period',p_period,
    'timezone','Asia/Seoul','hourly_visits',v_slots,
    'active_browsers_5m',v_online,'active_by_page',v_pages,
    'presence_window_seconds',300,'online_is_estimate',true);
end
$function$;
revoke all on function public.beagu_admin_live_traffic_v1(text) from public,anon,authenticated;
grant execute on function public.beagu_admin_live_traffic_v1(text) to service_role;
comment on function public.beagu_admin_live_traffic_v1(text)
is 'Service-role-only aggregate. Must be called by MFA-verified administrator Edge Function.';
