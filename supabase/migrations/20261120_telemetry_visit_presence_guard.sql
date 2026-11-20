-- Preserve the legacy anonymous statistics contract while bounding
-- repeated telemetry from any single browser ID. An ID minted in the browser
-- is NOT an authenticated identity: rotation remains possible and must be
-- mitigated separately at a trusted request gateway (rate limiting/attestation).
--
-- Observed production peak (2026-11-20 audit): 23 visit events per browser
-- per minute and 87 per browser per hour. Thresholds 30/120 avoid rejecting
-- the observed ordinary sessions. Rejected events still return the usual
-- today/month/total counts so telemetry never blocks navigation.
create index if not exists beagu_visits_visitor_recent_v1_idx
  on beagu_private.visits(visitor_id, visited_at desc);

create or replace function public.beagu_record_visit(
  p_visitor uuid, p_event uuid, p_page text
)
returns jsonb
language plpgsql security definer set search_path = ''
as $function$
declare
  d date := (now() at time zone 'Asia/Seoul')::date;
  result jsonb;
  normalized_page text;
  v_throttled boolean := false;
begin
  normalized_page := case
    when p_page in ('index','search','result','survey','challenge') then p_page
    when p_page in ('search-lv1','search-lv2','school-report','statistics') then 'search'
    else null end;
  -- Browsers create RFC4122 UUID v4 values via crypto.randomUUID().
  if p_visitor is null or p_event is null or normalized_page is null
     or p_visitor::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or p_event::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'Invalid visit' using errcode = '22023';
  end if;

  -- Serialize calls for the *same* browser UUID only. This makes the
  -- 30/minute and 120/hour checks atomic without locking other browsers.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_visitor::text, 873122::bigint)
  );

  -- Stable event UUID makes retries idempotent. Do not penalize retries.
  if not exists (
    select 1 from beagu_private.visits where event_id = p_event
  ) then
    if (select count(*) from beagu_private.visits
        where visitor_id = p_visitor
          and visited_at >= now() - interval '1 minute') >= 30
       or (select count(*) from beagu_private.visits
        where visitor_id = p_visitor
          and visited_at >= now() - interval '1 hour') >= 120 then
      v_throttled := true;
    else
      insert into beagu_private.visits(event_id,visitor_id,page)
        values (p_event,p_visitor,normalized_page)
        on conflict(event_id) do nothing;
      -- Existing BEFORE INSERT admin-exclusion trigger continues to run.
    end if;
  end if;
  select pg_catalog.jsonb_build_object(
    'today',count(distinct visitor_id) filter(where visit_day=d),
    'month',count(distinct visitor_id) filter(
       where visit_day >= pg_catalog.date_trunc('month',d::timestamp)::date),
    'total',count(distinct visitor_id),'as_of',d,
    'rate_limited',v_throttled
  ) into result from beagu_private.visits;
  return result;
end;
$function$;

-- The existing presence RPC already deduplicates one row per browser ID.
-- Prevent a caller from defeating its 30-second update cadence by rapidly
-- alternating the page name. Keep the accepted page set, TTL and signature.
create or replace function public.beagu_presence_ping_v1(
  p_visitor uuid, p_page text default 'other'
)
returns void
language plpgsql security definer set search_path = ''
as $function$
declare
  v_page text;
begin
  if p_visitor is null
     or p_visitor::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'INVALID_VISITOR' using errcode='22023';
  end if;
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
    where beagu_private.beagu_live_presence_v1.last_seen_at <
          now()-interval '30 seconds';
end;
$function$;

-- CREATE OR REPLACE keeps the pre-existing owner/privileges, but explicitly
-- reassert intended public telemetry access and block direct private reads.
revoke all on function public.beagu_record_visit(uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.beagu_record_visit(uuid,uuid,text)
  to anon,authenticated,service_role;
revoke all on function public.beagu_presence_ping_v1(uuid,text)
  from public,anon,authenticated;
grant execute on function public.beagu_presence_ping_v1(uuid,text)
  to anon,authenticated,service_role;
