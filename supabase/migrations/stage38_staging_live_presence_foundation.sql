-- STAGE38 ISOLATED SUPABASE ONLY: ycwuugggqbunlbwuzvbx
-- NEVER APPLY TO PRODUCTION: snvzwrexuqavnfvzgxqj
-- Original private presence table/index: 20261120_admin_hourly_live_presence.sql
-- Final 30-second deduplication function: 20261120_telemetry_visit_presence_guard.sql
-- Final service-role-only privilege cutover: 20261120_telemetry_v2_public_rpc_cutover.sql
-- No cron schedule, no public browser writes, no historical data imported.

create table if not exists beagu_private.beagu_live_presence_v1 (
  visitor_id uuid primary key,
  page text not null default 'other',
  last_seen_at timestamptz not null default now()
);
alter table beagu_private.beagu_live_presence_v1 enable row level security;
revoke all on beagu_private.beagu_live_presence_v1 from public, anon, authenticated;
create index if not exists beagu_live_presence_last_seen_v1_idx
  on beagu_private.beagu_live_presence_v1(last_seen_at);

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

revoke all on function public.beagu_presence_ping_v1(uuid,text) from public,anon,authenticated;
grant execute on function public.beagu_presence_ping_v1(uuid,text) to service_role;
