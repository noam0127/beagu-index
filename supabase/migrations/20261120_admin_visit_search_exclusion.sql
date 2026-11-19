-- Keep authenticated administrators OUT of existing visit/search tables at write time.
-- Existing data and RPC response formats are not changed.
-- auth.uid() is read from a verified Supabase Auth bearer token; browser flags are ignored.
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
drop trigger if exists beagu_skip_admin_visit on beagu_private.visits;
create trigger beagu_skip_admin_visit
before insert on beagu_private.visits
for each row execute function beagu_private.beagu_skip_admin_telemetry();
drop trigger if exists beagu_skip_admin_school_event on public.school_search_events;
create trigger beagu_skip_admin_school_event
before insert on public.school_search_events
for each row execute function beagu_private.beagu_skip_admin_telemetry();
-- Deliberately does NOT retroactively remove visits/search events.
-- The old RPCs keep returning normal totals but no authenticated-admin row can enter these tables.