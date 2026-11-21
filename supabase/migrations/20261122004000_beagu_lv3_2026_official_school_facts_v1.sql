-- Stage22: CODE-ONLY migration. No 2026 facts are imported or approved.
-- DO NOT apply to production/staging until backup+restore and official
-- source/ownership verification. Lv3 control remains OFF by default.
begin;

create table if not exists beagu_private.lv3_official_school_facts_2026_v1(
 school_id text primary key references public.schools(school_id),
 reference_year integer not null default 2026 check(reference_year=2026),
 school_name text not null check(length(btrim(school_name)) between 2 and 120),
 sido_standard text not null check(length(btrim(sido_standard)) between 1 and 30),
 support_office text check(length(support_office)<=120),
 address text check(length(address)<=300),
 establishment text check(length(establishment)<=100),
 school_kind text check(length(school_kind)<=60),
 status text check(length(status)<=60),
 neis_source_ref text not null check(length(btrim(neis_source_ref)) between 12 and 350),
 neis_source_digest text not null check(neis_source_digest ~ '^[a-f0-9]{64}$'),
 neis_as_of date not null check(neis_as_of between date '2026-01-01' and date '2026-12-31'),
 neis_reviewed boolean not null default false,
 student_count bigint check(student_count between 0 and 100000),
 junior_teacher_ratio numeric(6,3) check(junior_teacher_ratio between 0 and 100),
 male_teacher_ratio numeric(6,3) check(male_teacher_ratio between 0 and 100),
 school_info_source_ref text check(length(school_info_source_ref)<=350),
 school_info_source_digest text check(school_info_source_digest ~ '^[a-f0-9]{64}$'),
 school_info_as_of date check(school_info_as_of between date '2026-01-01' and date '2026-12-31'),
 school_info_reviewed boolean not null default false,
 housing_price_won numeric(16,0) check(housing_price_won>=0),
 housing_source_ref text check(length(housing_source_ref)<=350),
 housing_source_digest text check(housing_source_digest ~ '^[a-f0-9]{64}$'),
 housing_as_of date check(housing_as_of between date '2026-01-01' and date '2026-12-31'),
 housing_reviewed boolean not null default false,
 review_status text not null default 'PENDING'
    check(review_status in ('PENDING','APPROVED','REJECTED')),
 reviewer_user_id uuid,
 reviewed_at timestamptz,
 school_identity_reviewed boolean not null default false,
 personal_data_reviewed boolean not null default false,
 reidentification_reviewed boolean not null default false,
 prior_data_combination_reviewed boolean not null default false,
 updated_at timestamptz not null default now(),
 constraint lv3_2026_review_complete_v1 check(
   review_status <> 'APPROVED' or (
     neis_reviewed and school_identity_reviewed
     and personal_data_reviewed and reidentification_reviewed
     and prior_data_combination_reviewed
     and reviewer_user_id is not null and reviewed_at is not null
     and reviewed_at>=updated_at
   )
 ),
 constraint lv3_2026_school_info_provenance_v1 check (
   not school_info_reviewed or (
     school_info_source_ref is not null
     and length(btrim(school_info_source_ref))>=12
     and school_info_source_digest is not null
     and school_info_as_of is not null
   )
 ),
 constraint lv3_2026_housing_provenance_v1 check (
   not housing_reviewed or (
     housing_source_ref is not null
     and length(btrim(housing_source_ref))>=12
     and housing_source_digest is not null
     and housing_as_of is not null
   )
 )
);
alter table beagu_private.lv3_official_school_facts_2026_v1 enable row level security;
revoke all on beagu_private.lv3_official_school_facts_2026_v1
 from public,anon,authenticated;
grant usage on schema beagu_private to service_role;
grant select on beagu_private.lv3_official_school_facts_2026_v1 to service_role;

-- A SECURITY INVOKER view is a narrow service-only projection.
-- It never calls the 2026 survey source or a user-editable profile.
-- Every published row requires current authorized owner and global Lv3 ON;
-- unreviewed numeric values are NULL, not old values disguised as 2026.
create or replace view public.beagu_lv3_2026_school_facts_v1
 with (security_invoker=true)
as
select f.school_id,f.school_name,f.sido_standard,f.support_office,
 f.address,f.establishment,f.school_kind,f.status,
 2026::integer as reference_year,
 f.neis_as_of,
 case when f.school_info_reviewed and f.school_info_as_of<=current_date then f.student_count end as student_count,
 case when f.school_info_reviewed and f.school_info_as_of<=current_date then f.school_info_as_of end as student_reference_date,
 case when f.school_info_reviewed and f.school_info_as_of<=current_date then f.junior_teacher_ratio end as junior_teacher_ratio,
 case when f.school_info_reviewed and f.school_info_as_of<=current_date then f.male_teacher_ratio end as male_teacher_ratio,
 case when f.housing_reviewed and f.housing_as_of<=current_date then f.housing_price_won end as housing_price_won,
 case when f.housing_reviewed and f.housing_as_of<=current_date then f.housing_as_of end as housing_reference_date,
 h.beagu_percentile_2025,
 h.view_count
from beagu_private.lv3_official_school_facts_2026_v1 f
left join public.beagu_lv1_school_sort_index h on h.school_id=f.school_id
where f.reference_year=2026
 and f.review_status='APPROVED'
 and f.neis_reviewed and f.school_identity_reviewed
 and f.personal_data_reviewed
 and f.reidentification_reviewed
 and f.prior_data_combination_reviewed
 and f.reviewed_at>=f.updated_at
 and f.reviewed_at<=now()
 and f.neis_as_of<=current_date
 and exists(select 1 from public.beagu_admin_accounts a
   where a.user_id=f.reviewer_user_id and a.role='owner' and a.enabled=true)
 and exists(select 1 from beagu_private.lv3_release_control_v1 gate
   where gate.singleton and gate.enabled
     and gate.approved_by is not null and gate.approved_at is not null);
revoke all on public.beagu_lv3_2026_school_facts_v1
 from public,anon,authenticated;
grant select on public.beagu_lv3_2026_school_facts_v1 to service_role;

create index if not exists lv3_2026_official_school_review_v1_idx
 on beagu_private.lv3_official_school_facts_2026_v1
 (review_status,sido_standard,school_name,school_id);

comment on table beagu_private.lv3_official_school_facts_2026_v1 is
 'Unpopulated Stage22 staging of individually source-reviewed 2026 official school facts. Never backfill from live schools.updated_at without 2026 official source proof.';
comment on view public.beagu_lv3_2026_school_facts_v1 is
 'Service-only, owner-reviewed, release-gated 2026 school basic facts. All unverified values NULL; 2025 percentile explicitly named. Lv0–Lv2 legacy facts unchanged.';
commit;
