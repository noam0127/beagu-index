-- Disposable PostgreSQL only; artificial audit events with no real credentials.
create table public.beagu_admin_audit_events (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users(id),
  event_type text not null constraint beagu_admin_audit_events_event_type_check
    check(length(event_type) between 3 and 64),
  outcome text not null constraint beagu_admin_audit_events_outcome_check
    check(outcome in ('success','denied','error')),
  details jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint beagu_admin_audit_events_details_check
    check(jsonb_typeof(details)='object')
);
alter table public.beagu_admin_audit_events enable row level security;
revoke all on public.beagu_admin_audit_events from public,anon,authenticated;
grant select,insert on public.beagu_admin_audit_events to service_role;
