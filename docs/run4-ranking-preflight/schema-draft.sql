-- REVIEW ONLY. Do not apply to production. Separate tables; 3.0 tables untouched.
-- Service role is the only writer/reader. Verification must be performed by
-- a future authoritative replay service; summary validation is insufficient.
begin;
create table public.arcade_run4_sessions_candidate (
 id uuid primary key,
 rules_version text not null check (rules_version='4.0'),
 difficulty text not null check(difficulty in ('easy','normal','hard','very_hard','extreme')),
 actor_hash text not null check(length(actor_hash)=64),
 started_at timestamptz not null default now()
);
create table public.arcade_run4_records_candidate (
 session_id uuid primary key references public.arcade_run4_sessions_candidate(id),
 score integer not null check(score between 0 and 960000),
 base_score integer not null check(base_score between 0 and 200000),
 survival_seconds integer not null check(survival_seconds between 0 and 190),
 victory boolean not null check(victory=(survival_seconds=190)),
 boss_count integer not null check(boss_count between 0 and 5),
 result jsonb not null check(jsonb_typeof(result)='object' and octet_length(result::text)<=6000),
 verification_status text not null default 'pending' check(verification_status in ('pending','verified','rejected')),
 submitted_at timestamptz not null default now(),
 verified_at timestamptz,
 check((verification_status='verified')=(verified_at is not null))
);
alter table public.arcade_run4_sessions_candidate enable row level security;
alter table public.arcade_run4_records_candidate enable row level security;
revoke all on public.arcade_run4_sessions_candidate,public.arcade_run4_records_candidate from public,anon,authenticated,service_role;
grant select,insert,update on public.arcade_run4_sessions_candidate,public.arcade_run4_records_candidate to service_role;
create index arcade_run4_verified_score_candidate on public.arcade_run4_records_candidate(score desc,submitted_at asc) where verification_status='verified';
-- Private API route must return only allowlisted result fields, never session IDs,
-- actor hashes, account details, or unverified records.
create view public.arcade_run4_verified_candidate with (security_invoker=true) as
 select s.rules_version,s.difficulty,r.score,r.survival_seconds,r.victory,r.boss_count,r.submitted_at
 from public.arcade_run4_records_candidate r join public.arcade_run4_sessions_candidate s on s.id=r.session_id
 where r.verification_status='verified';
revoke all on public.arcade_run4_verified_candidate from public,anon,authenticated,service_role;
grant select on public.arcade_run4_verified_candidate to service_role;
commit;
