-- Verified school-year-question distributions. Internally retains only review counts;
-- the signed LV1 API returns a rounded public distribution with NO response counts.
create table if not exists public.beagu_verified_school_question_distributions_v1(
 school_id text not null check (school_id ~ '^[0-9]{7}$'),
 survey_year smallint not null check (survey_year in(2023,2024)),
 question_id text not null check (question_id ~ '^Q[0-9]{2}$'),
 mode_option text not null check (length(mode_option) between 1 and 180),
 rounded_distribution jsonb not null check (jsonb_typeof(rounded_distribution)='array'),
 valid_response_rows integer not null check (valid_response_rows>=10),
 source_description text not null check (length(source_description)<=160),
 review_policy text not null check (review_policy='N10_CELL3_PATTERNS5_STRICT_MATCH'),
 release_status text not null check (release_status='APPROVED_AGGREGATE_ONLY'),
 review_completed_at timestamptz not null default now(),
 primary key(school_id,survey_year,question_id)
);
alter table public.beagu_verified_school_question_distributions_v1 enable row level security;
revoke all on public.beagu_verified_school_question_distributions_v1 from PUBLIC,anon,authenticated;
grant select,insert,update on public.beagu_verified_school_question_distributions_v1 to service_role;
comment on table public.beagu_verified_school_question_distributions_v1 is
'Privileged only. Validated school question distributions: school exact unique match, 10+ source rows and distinct timestamps, 5+ response patterns, at least two categories, every nonzero category 3+, 10%-rounded proportions; no school respondent counts exposed via Lv1 API.';