-- Home notice content is public, but its editing API is service-role-only.
-- Do NOT grant anon/authenticated access. Edge Function performs administrator MFA checks.
create table if not exists public.beagu_home_notice_v1 (
  id smallint primary key default 1 check (id = 1),
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.beagu_home_notice_v1 enable row level security;
revoke all on table public.beagu_home_notice_v1 from public, anon, authenticated;
grant select, update on table public.beagu_home_notice_v1 to service_role;
insert into public.beagu_home_notice_v1 (id, body, revision)
values (1, '2026년 배구지수 데이터 작업 중입니다. 학교별 결과를 정리하고 있어 일부 정보는 아직 반영되지 않았을 수 있습니다.', 1)
on conflict (id) do nothing;
comment on table public.beagu_home_notice_v1 is 'Homepage footer notice. Only the MFA-protected beagu-home-notice-v1 Edge Function may write.';
