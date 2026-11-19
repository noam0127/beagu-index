-- Allow developer preview access despite unrelated clients/tests using a shared quota.
-- The code still requires a server-side 4-digit PIN, login budget and scoped ticket.
-- Only service_role can execute; 80 attempts / UTC hour globally.
create or replace function public.beagu_consume_class_diary_preview_budget()
returns boolean language plpgsql security definer
set search_path = ''
as $function$
declare n integer;
begin
  delete from beagu_private.class_diary_preview_attempts
  where bucket < pg_catalog.date_trunc('hour', pg_catalog.now()) - interval '2 day';
  insert into beagu_private.class_diary_preview_attempts(bucket, attempts)
  values(pg_catalog.date_trunc('hour', pg_catalog.now()), 1)
  on conflict(bucket) do update
    set attempts = beagu_private.class_diary_preview_attempts.attempts + 1
  returning attempts into n;
  return n <= 80;
end
$function$;
revoke all on function public.beagu_consume_class_diary_preview_budget() from public, anon, authenticated;
grant execute on function public.beagu_consume_class_diary_preview_budget() to service_role;
