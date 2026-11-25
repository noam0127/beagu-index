-- Reproducible schema for the isolated 2026 official Schoolinfo profile store.
-- The data itself is imported from the owner-supplied CSV files in private storage.
-- No raw teacher-survey data or approval state belongs here.
create table if not exists public.beagu_2026_official_school_profiles (
 school_id text primary key references public.schools(school_id) on delete restrict,
 disclosure_code text not null unique check(disclosure_code ~ '^S[0-9]{9}$'),
 source_year smallint not null default 2026 check(source_year=2026),
 profile jsonb not null check(jsonb_typeof(profile)='object' and length(profile::text)<=12000),
 teacher_total integer check(teacher_total between 0 and 10000),
 source_sha256 text not null check(source_sha256 ~ '^[a-f0-9]{64}$'),
 mapping_rule text not null check(mapping_rule in ('EXACT','NATIONAL','ADDRESS')),
 created_at timestamptz not null default now()
);
alter table public.beagu_2026_official_school_profiles enable row level security;
revoke all on public.beagu_2026_official_school_profiles from public,anon,authenticated;
grant select,insert,update on public.beagu_2026_official_school_profiles to service_role;
