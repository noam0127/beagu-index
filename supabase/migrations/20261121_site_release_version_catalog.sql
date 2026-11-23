-- Immutable, administrator-created release snapshots.
-- ChatGPT changes are discovered from GitHub commits; they are NOT a release
-- until the owner explicitly presses "버전 생성".
create table if not exists public.beagu_site_release_versions_v1 (
  id uuid primary key default gen_random_uuid(),
  version text not null unique check(version ~ '^[0-9A-Za-z][0-9A-Za-z._-]{0,31}$'),
  sha text not null unique check(sha ~ '^[0-9a-f]{40}$'),
  summary text not null check(length(summary) between 3 and 500),
  changed_count integer not null default 0 check(changed_count >= 0),
  changes jsonb not null default '[]'::jsonb check(jsonb_typeof(changes) = 'array'),
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists beagu_site_release_versions_created_v1
  on public.beagu_site_release_versions_v1(created_at desc);
alter table public.beagu_site_release_versions_v1 enable row level security;
revoke all on public.beagu_site_release_versions_v1 from public, anon, authenticated;
grant select, insert on public.beagu_site_release_versions_v1 to service_role;
-- The first version captures the existing published code as a selectable baseline.
-- Its public pages are NOT redeployed by this migration.
insert into public.beagu_site_release_versions_v1(version,sha,summary,changed_count)
select '1.0.0',production_sha,'기존 운영 웹의 초기 기준 버전',0
from public.beagu_site_release_state_v1
where id=1 and production_sha is not null
on conflict do nothing;
