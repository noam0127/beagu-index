-- Private live-presence store; 5-minute activity window, 48-hour retention.
-- No IP address, user-agent, real name, or survey response is collected.
create table if not exists beagu_private.beagu_live_presence_v1 (
  visitor_id uuid primary key,
  page text not null default 'other',
  last_seen_at timestamptz not null default now()
);
alter table beagu_private.beagu_live_presence_v1 enable row level security;
revoke all on beagu_private.beagu_live_presence_v1 from public, anon, authenticated;
create index if not exists beagu_live_presence_last_seen_v1_idx
  on beagu_private.beagu_live_presence_v1(last_seen_at);

-- The public client can only update its own anonymous browser identifier;
-- it cannot list the presence table or read online visitors.
create or replace function public.beagu_presence_ping_v1(p_visitor uuid, p_page text default 'other')
returns void
language plpgsql security definer set search_path = ''
as $function$
declare
  v_page text;
begin
  if p_visitor is null or substring(p_visitor::text from 15 for 1) <> '4' then
    raise exception 'INVALID_VISITOR' using errcode='22023';
  end if;
  -- Authenticated administrator visits do not influence live audience counts.
  if exists (
    select 1 from public.beagu_admin_accounts a
    where a.user_id = auth.uid() and a.enabled = true
  ) then return; end if;
  v_page := case
    when p_page in ('index','search','search-lv1','search-lv2','school-report',
                    'statistics','result','survey','challenge','postit',
                    'levels','volleyball','teacher-run','teacher-class-diary')
      then p_page else 'other' end;
  insert into beagu_private.beagu_live_presence_v1(visitor_id,page,last_seen_at)
  values(p_visitor,v_page,now())
  on conflict (visitor_id) do update
  set page=excluded.page,last_seen_at=excluded.last_seen_at
  where beagu_private.beagu_live_presence_v1.last_seen_at < now()-interval '30 seconds'
     or beagu_private.beagu_live_presence_v1.page is distinct from excluded.page;
end
$function$;
revoke all on function public.beagu_presence_ping_v1(uuid,text) from public,anon,authenticated;
grant execute on function public.beagu_presence_ping_v1(uuid,text) to anon,authenticated,service_role;

-- Aggregates only; never returns individual visitor identifiers.
-- p_period determines the 24 Seoul-hour slots in the traffic graph.
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

-- pg_cron is already installed in this project. Remove stale pseudo-anonymous browser IDs.
select cron.schedule('beagu-presence-retention-48h','17 * * * *',
  $job$delete from beagu_private.beagu_live_presence_v1 where last_seen_at < now()-interval '48 hours'$job$);
