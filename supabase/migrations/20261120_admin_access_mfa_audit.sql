-- Safe opt-in admin authority. Does not modify Lv.0/1/2 or existing records.
-- Bootstrap is manual, via a trusted server-side SQL editor, after creating the Auth user.
create table if not exists public.beagu_admin_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'admin' check (role in ('owner','admin','viewer')),
  enabled boolean not null default true,
  granted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.beagu_admin_accounts is 'Allowlist for Supabase Auth administrators; never writable by clients.';
alter table public.beagu_admin_accounts enable row level security;
revoke all on table public.beagu_admin_accounts from public, anon, authenticated;
grant select on table public.beagu_admin_accounts to service_role;

create table if not exists public.beagu_admin_audit_events (
  id bigint generated always as identity primary key,
  actor_user_id uuid,
  event_type text not null check (length(event_type) between 3 and 64),
  outcome text not null check (outcome in ('success','denied','error')),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  occurred_at timestamptz not null default now()
);
comment on table public.beagu_admin_audit_events is 'Server-write-only admin security audit. No IP, passwords, TOTP codes or bearer tokens.';
create index if not exists beagu_admin_audit_time_idx
  on public.beagu_admin_audit_events (occurred_at desc);
create index if not exists beagu_admin_audit_actor_time_idx
  on public.beagu_admin_audit_events (actor_user_id, occurred_at desc);
alter table public.beagu_admin_audit_events enable row level security;
revoke all on table public.beagu_admin_audit_events from public, anon, authenticated;
grant select, insert on table public.beagu_admin_audit_events to service_role;
grant usage, select on sequence public.beagu_admin_audit_events_id_seq to service_role;

-- No RLS policy is defined for anon/authenticated; absence of permission is intentional.
-- No public function for granting/removing admin accounts is created.