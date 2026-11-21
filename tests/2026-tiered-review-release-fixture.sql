-- Stage21 CI-only synthetic school source and independently reviewed
-- publication basis. No production school names, identifiers or response rows.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema beagu_private;
create table public.beagu_2026_results_snapshot(
 school_id text primary key,
 questions jsonb not null,
 payload_sha256 text not null,
 approved_payload_sha256 text,
 school_match_status text not null,
 source_snapshot_at timestamptz not null,
 approval_status text not null,
 approved_at timestamptz,
 approved_by text,
 approval_evidence jsonb,
 updated_at timestamptz not null
);
create table beagu_private.beagu_2026_publication_basis_review(
 school_id text primary key,
 payload_sha256 text not null,
 review_status text not null,
 reviewer_user_id uuid,
 reviewed_at timestamptz,
 notice_effective_at timestamptz,
 basis_type text,
 notice_source_ref text,
 notice_digest_sha256 text,
 publication_scope text,
 distinct_respondents_reviewed boolean,
 personal_data_reviewed boolean,
 small_sample_reviewed boolean,
 reidentification_reviewed boolean,
 prior_data_combination_reviewed boolean
);
alter table public.beagu_2026_results_snapshot enable row level security;
alter table beagu_private.beagu_2026_publication_basis_review enable row level security;
revoke all on public.beagu_2026_results_snapshot,
 beagu_private.beagu_2026_publication_basis_review
 from public,anon,authenticated;
grant usage on schema beagu_private to service_role;
grant select on public.beagu_2026_results_snapshot to service_role;
grant select on beagu_private.beagu_2026_publication_basis_review to service_role;

-- The synthetic response count is NOT published, and no raw answer exists.
with evidence as (
 select pg_catalog.jsonb_build_object(
 'decision','APPROVE_EXACT_SNAPSHOT',
 'source_scoring','verified synthetic source',
 'school_identity','verified matching',
 'duplicate_responses','verified duplicates',
 'consent','verified notice',
 'small_sample','verified small cells',
 'reidentification','verified risk',
 'prior_data_combination','verified linkage'
 ) body
), fixtures(school_id,age_hours) as (
 values('A000001',2),('A000002',7),('A000003',25),
       ('A000004',25),('A000005',25),('A000006',25)
)
insert into public.beagu_2026_results_snapshot(
 school_id,questions,payload_sha256,approved_payload_sha256,
 school_match_status,source_snapshot_at,approval_status,approved_at,
 approved_by,approval_evidence,updated_at
)
select f.school_id,
 '[{"id":"Q01","row":-1,"valid":1,"invalid":0,"counts":[0,0,1,0,0,0],"minutes_sum":0},
   {"id":"Q31","row":-1,"valid":1,"invalid":0,"counts":[1,0],"minutes_sum":0},
   {"id":"Q51","row":-1,"valid":1,"invalid":0,"counts":[1,0],"minutes_sum":0}]'::jsonb,
 repeat('a',64),repeat('a',64),
 'EXACT_REGION_OFFICE_NAME',now()-interval '48 hours','APPROVED',
 now()-(f.age_hours||' hours')::interval,
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',e.body,
 now()-(f.age_hours||' hours')::interval-interval '1 minute'
from fixtures f cross join evidence e;

insert into beagu_private.beagu_2026_publication_basis_review(
 school_id,payload_sha256,review_status,reviewer_user_id,
 reviewed_at,notice_effective_at,basis_type,notice_source_ref,
 notice_digest_sha256,publication_scope,
 distinct_respondents_reviewed,personal_data_reviewed,
 small_sample_reviewed,reidentification_reviewed,prior_data_combination_reviewed
) select school_id,repeat('a',64),'VERIFIED',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',now()-interval '47 hours',
 now()-interval '49 hours','OTHER_DOCUMENTED_LEGAL_BASIS',
 'synthetic-review-notice-id',repeat('b',64),
 'synthetic closed-choice aggregated school information only',
 true,true,true,true,true
from public.beagu_2026_results_snapshot;
