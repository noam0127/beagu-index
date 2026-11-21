-- Stage 15 draft. DO NOT APPLY to production/staging before verified backup,
-- independent restoration, stage-14 private SMS migration and owner approval.
-- The UI/Edge Function must deploy AFTER this migration succeeds.
begin;

-- An audit-intent event must commit before a moderation ban.
-- Extend existing valid audit outcomes instead of overwriting records.
alter table public.beagu_admin_audit_events
  drop constraint if exists beagu_admin_audit_events_outcome_check;
alter table public.beagu_admin_audit_events
  add constraint beagu_admin_audit_events_outcome_check
  check(outcome in ('success','denied','error','pending'));

-- Request ID belongs to the pre-moderation audit event; its unique index
-- rejects accidental or concurrent retries before changing Auth users.
create unique index if not exists beagu_member_moderation_request_v2_unique
  on public.beagu_admin_audit_events ((details->>'request_id'))
  where event_type='member_moderation_requested'
    and details ? 'request_id';

alter table public.beagu_admin_audit_events enable row level security;
revoke all on public.beagu_admin_audit_events from public,anon,authenticated;
-- Service-role audit is already granted in existing production schema;
-- explicitly ensure its INSERT and SELECT rights for this flow.
grant select,insert on public.beagu_admin_audit_events to service_role;

-- Supersede the legacy, mutable user_metadata-derived SMS status projection.
-- Stage 14's private table flags and verified consent timestamp are required.
create or replace function public.beagu_admin_member_sms_status_v2(p_ids uuid[])
returns table(
  user_id uuid,
  sms_consent boolean,
  phone_verified boolean,
  withdrawn_at timestamptz
) language sql stable security definer set search_path='' as $fn$
  select s.user_id,
    (s.sms_consent is true and s.phone_collection_consent is true
     and s.consent_confirmed_at is not null
     and s.withdrawn_at is null) as sms_consent,
    (s.phone_verified_at is not null and s.sms_consent is true
     and s.phone_collection_consent is true
     and s.consent_confirmed_at is not null
     and s.withdrawn_at is null) as phone_verified,
    s.withdrawn_at
  from beagu_private.member_sms_subscriptions_v1 s
  where s.user_id = any(p_ids)
    and pg_catalog.array_length(p_ids,1)<=20
$fn$;
revoke all on function public.beagu_admin_member_sms_status_v2(uuid[])
  from public,anon,authenticated;
grant execute on function public.beagu_admin_member_sms_status_v2(uuid[])
  to service_role;
comment on function public.beagu_admin_member_sms_status_v2(uuid[]) is
  'Service role owner-only Edge API use. Verified SMS consent status, no phone numbers.';

commit;
