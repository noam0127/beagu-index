-- Only the server service role may check whether a signed admin JWT belongs to a live MFA session.
create or replace function public.beagu_admin_active_mfa_session(p_user uuid, p_session uuid)
returns boolean language sql stable security definer set search_path = ''
as $function$
  select exists (
    select 1 from auth.sessions s
    where s.user_id=p_user and s.id=p_session
      and s.aal::text = 'aal2'
      and (s.not_after is null or s.not_after>now())
  )
$function$;
revoke all on function public.beagu_admin_active_mfa_session(uuid,uuid) from public,anon,authenticated;
grant execute on function public.beagu_admin_active_mfa_session(uuid,uuid) to service_role;
comment on function public.beagu_admin_active_mfa_session(uuid,uuid) is 'Session revocation and AAL2 confirmation. Service role only.';

-- Reuse the existing server-side authenticated-admin filter for additional view collectors.
drop trigger if exists beagu_skip_admin_school_view_daily on beagu_private.school_view_daily;
create trigger beagu_skip_admin_school_view_daily
before insert on beagu_private.school_view_daily
for each row execute function beagu_private.beagu_skip_admin_telemetry();
drop trigger if exists beagu_skip_admin_school_interest_daily on public.beagu_school_interest_daily;
create trigger beagu_skip_admin_school_interest_daily
before insert on public.beagu_school_interest_daily
for each row execute function beagu_private.beagu_skip_admin_telemetry();
