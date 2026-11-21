-- Release manager V1: immutable SHA pointers, queue and successful deployment history.
-- Browser access is denied. Only the MFA + GitHub OIDC verified Edge API may write.
create table if not exists public.beagu_site_release_state_v1 (
  id smallint primary key default 1 check(id=1),
  production_sha text check(production_sha is null or production_sha ~ '^[0-9a-f]{40}$'),
  production_version text,
  staging_sha text check(staging_sha is null or staging_sha ~ '^[0-9a-f]{40}$'),
  staging_version text,
  draft_sha text check(draft_sha is null or draft_sha ~ '^[0-9a-f]{40}$'),
  draft_version text,
  draft_summary text,
  updated_at timestamptz not null default now()
);
create table if not exists public.beagu_site_release_jobs_v1 (
  id uuid primary key default gen_random_uuid(),
  action text not null check(action in ('bootstrap','stage_apply','stage_rollback','prod_apply','prod_rollback')),
  target text not null check(target in ('staging','production')),
  to_sha text check(to_sha is null or to_sha ~ '^[0-9a-f]{40}$'),
  from_sha text check(from_sha is null or from_sha ~ '^[0-9a-f]{40}$'),
  version text not null,
  summary text not null,
  status text not null default 'queued' check(status in ('queued','running','deployed','failed')),
  created_by uuid,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  error_code text,
  deployed_url text
);
create unique index if not exists beagu_site_release_one_active_job_v1
  on public.beagu_site_release_jobs_v1 ((1)) where status in ('queued','running');
create index if not exists beagu_site_release_jobs_by_created_v1
  on public.beagu_site_release_jobs_v1 (created_at desc);
create table if not exists public.beagu_site_release_history_v1 (
  id bigint generated always as identity primary key,
  job_id uuid not null unique references public.beagu_site_release_jobs_v1(id),
  target text not null check(target in ('staging','production')),
  action text not null,
  version text not null,
  summary text not null,
  from_sha text,
  to_sha text,
  deployed_url text,
  deployed_at timestamptz not null default now()
);
create index if not exists beagu_site_release_history_target_time_v1
  on public.beagu_site_release_history_v1 (target,deployed_at desc);
alter table public.beagu_site_release_state_v1 enable row level security;
alter table public.beagu_site_release_jobs_v1 enable row level security;
alter table public.beagu_site_release_history_v1 enable row level security;
revoke all on public.beagu_site_release_state_v1, public.beagu_site_release_jobs_v1,
  public.beagu_site_release_history_v1 from public, anon, authenticated;
grant select, insert, update on public.beagu_site_release_state_v1,
  public.beagu_site_release_jobs_v1 to service_role;
grant select, insert on public.beagu_site_release_history_v1 to service_role;
grant usage, select on sequence public.beagu_site_release_history_v1_id_seq to service_role;
insert into public.beagu_site_release_state_v1(id) values(1) on conflict(id) do nothing;
