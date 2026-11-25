-- v1.3 candidate: a shared cohort assessment replaces repeated document refs.
-- Percentile-only scope; this script does not approve any school or survey question.
-- Deploy only after disposable-database and browser regression verification.
create table if not exists beagu_private.beagu_2026_percentile_scope_v13(
 source_version text primary key check(length(source_version) between 8 and 160),
 decision text not null default 'PENDING' check(decision in ('PENDING','INCOMPATIBLE','COMPATIBLE')),
 notice_compatible boolean not null default false,
 anonymous_scope_reviewed boolean not null default false,
 scope_code text not null default 'SCHOOL_CARD_PERCENTILE_ONLY' check(scope_code='SCHOOL_CARD_PERCENTILE_ONLY'),
 reviewer_user_id uuid not null,
 reviewed_at timestamptz not null default now(),
 review_note text not null check(length(trim(review_note)) between 12 and 500),
 check(decision<>'COMPATIBLE' or (notice_compatible and anonymous_scope_reviewed))
);
create table if not exists beagu_private.beagu_2026_percentile_school_review_v13(
 school_id text references public.schools(school_id) on delete restrict,
 source_version text references beagu_private.beagu_2026_percentile_scope_v13(source_version) on delete restrict,
 percentile numeric not null check(percentile between 0 and 100),
 valid_observations integer not null check(valid_observations>=1),
 percentile_method text not null,
 teacher_total integer not null check(teacher_total>=0),
 teacher_source_sha256 text not null check(teacher_source_sha256 ~ '^[a-f0-9]{64}$'),
 technical_reviewed boolean not null default false,
 school_identity_reviewed boolean not null default false,
 unique_respondents_reviewed boolean not null default false,
 personal_data_reviewed boolean not null default false,
 small_sample_reviewed boolean not null default false,
 reidentification_reviewed boolean not null default false,
 prior_data_combination_reviewed boolean not null default false,
 reviewer_user_id uuid not null,
 reviewed_at timestamptz not null default now(),
 review_note text not null check(length(trim(review_note)) between 12 and 500),
 primary key(school_id,source_version)
);
alter table beagu_private.beagu_2026_percentile_scope_v13 enable row level security;
alter table beagu_private.beagu_2026_percentile_school_review_v13 enable row level security;
revoke all on beagu_private.beagu_2026_percentile_scope_v13,beagu_private.beagu_2026_percentile_school_review_v13 from public,anon,authenticated;
grant select,insert,update on beagu_private.beagu_2026_percentile_scope_v13,beagu_private.beagu_2026_percentile_school_review_v13 to service_role;
-- An operator records one truthful shared scope review, not a separate file per school.
-- A changed internal publication policy is never itself proof of prior notice compatibility.
create or replace function public.beagu_2026_percentile_v13_scope_review(
 p_version text,p_actor uuid,p_session uuid,p_decision text,p_notice_compatible boolean,
 p_anonymous_scope_reviewed boolean,p_note text)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 if p_actor is null or p_session is null or not exists(
 select 1 from public.beagu_admin_accounts a where a.user_id=p_actor and a.role='owner' and a.enabled)
 or not public.beagu_admin_active_mfa_session(p_actor,p_session)
 then raise exception 'owner MFA required'; end if;
 if p_decision not in ('PENDING','INCOMPATIBLE','COMPATIBLE') or p_decision is null
 or p_note is null or length(trim(p_note)) not between 12 and 500 or p_note ~ '[<>]'
 or p_notice_compatible is null or p_anonymous_scope_reviewed is null
 or (p_decision='COMPATIBLE' and (not p_notice_compatible or not p_anonymous_scope_reviewed))
 or not exists(select 1 from public.beagu_school_report_yearly where survey_year=2026 and source_version=p_version)
 then raise exception 'scope review incomplete'; end if;
 insert into beagu_private.beagu_2026_percentile_scope_v13
 (source_version,decision,notice_compatible,anonymous_scope_reviewed,reviewer_user_id,reviewed_at,review_note)
 values(p_version,p_decision,p_notice_compatible,p_anonymous_scope_reviewed,p_actor,now(),trim(p_note))
 on conflict(source_version) do update set decision=excluded.decision,
 notice_compatible=excluded.notice_compatible,anonymous_scope_reviewed=excluded.anonymous_scope_reviewed,
 reviewer_user_id=excluded.reviewer_user_id,reviewed_at=excluded.reviewed_at,review_note=excluded.review_note;
 return jsonb_build_object('ok',true,'publication_approved',false);
end $$;
-- School-specific review is bound to the exact annual candidate and independently
-- verified official teacher total. No separate notice document or digest is input.
create or replace function public.beagu_2026_percentile_v13_school_review(
 p_school text,p_version text,p_expected_percentile numeric,p_expected_observations integer,
 p_actor uuid,p_session uuid,p_checks jsonb,p_note text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.beagu_school_report_yearly; p public.beagu_2026_official_school_profiles;
begin
 if p_actor is null or p_session is null or not exists(
 select 1 from public.beagu_admin_accounts x where x.user_id=p_actor and x.role='owner' and x.enabled)
 or not public.beagu_admin_active_mfa_session(p_actor,p_session)
 then raise exception 'owner MFA required'; end if;
 if p_school is null or p_school !~ '^[A-Z0-9]{7}$' or jsonb_typeof(p_checks) is distinct from 'object'
 or p_note is null or length(trim(p_note)) not between 12 and 500 or p_note ~ '[<>]'
 then raise exception 'invalid review'; end if;
 select * into strict a from public.beagu_school_report_yearly where school_id=p_school and survey_year=2026;
 select * into strict p from public.beagu_2026_official_school_profiles where school_id=p_school;
 if a.source_version is distinct from p_version or a.percentile is distinct from p_expected_percentile
 or a.valid_observation_count is distinct from p_expected_observations or a.percentile_method is null
 or a.publication_status<>'WITHHELD' or p.teacher_total is null
 then raise exception 'candidate changed or official teacher count missing'; end if;
 insert into beagu_private.beagu_2026_percentile_school_review_v13(
 school_id,source_version,percentile,valid_observations,percentile_method,teacher_total,teacher_source_sha256,
 technical_reviewed,school_identity_reviewed,unique_respondents_reviewed,personal_data_reviewed,
 small_sample_reviewed,reidentification_reviewed,prior_data_combination_reviewed,reviewer_user_id,reviewed_at,review_note)
 values(a.school_id,a.source_version,a.percentile,a.valid_observation_count,a.percentile_method,p.teacher_total,p.source_sha256,
 coalesce(p_checks->'technical_reviewed'='true'::jsonb,false),
 coalesce(p_checks->'school_identity_reviewed'='true'::jsonb,false),
 coalesce(p_checks->'unique_respondents_reviewed'='true'::jsonb,false),
 coalesce(p_checks->'personal_data_reviewed'='true'::jsonb,false),
 coalesce(p_checks->'small_sample_reviewed'='true'::jsonb,false),
 coalesce(p_checks->'reidentification_reviewed'='true'::jsonb,false),
 coalesce(p_checks->'prior_data_combination_reviewed'='true'::jsonb,false),p_actor,now(),trim(p_note))
 on conflict(school_id,source_version) do update set
 percentile=excluded.percentile,valid_observations=excluded.valid_observations,percentile_method=excluded.percentile_method,
 teacher_total=excluded.teacher_total,teacher_source_sha256=excluded.teacher_source_sha256,
 technical_reviewed=excluded.technical_reviewed,school_identity_reviewed=excluded.school_identity_reviewed,
 unique_respondents_reviewed=excluded.unique_respondents_reviewed,personal_data_reviewed=excluded.personal_data_reviewed,
 small_sample_reviewed=excluded.small_sample_reviewed,reidentification_reviewed=excluded.reidentification_reviewed,
 prior_data_combination_reviewed=excluded.prior_data_combination_reviewed,reviewer_user_id=excluded.reviewer_user_id,
 reviewed_at=excluded.reviewed_at,review_note=excluded.review_note;
 return jsonb_build_object('ok',true,'publication_approved',false);
end $$;
-- Read-only preflight. The old full-snapshot and tier publication gates remain untouched.
create or replace function public.beagu_2026_percentile_v13_preview(p_version text)
returns jsonb language sql stable security invoker set search_path='' as $$
 with candidates as (
 select a.school_id,a.valid_observation_count,a.percentile,
 coalesce(c.decision='COMPATIBLE' and c.notice_compatible and c.anonymous_scope_reviewed,false) scope_ok,
 coalesce(p.teacher_total>=10,false) official_ok,
 coalesce(r.percentile=a.percentile and r.valid_observations=a.valid_observation_count
 and r.percentile_method=a.percentile_method and r.teacher_total=p.teacher_total
 and r.teacher_source_sha256=p.source_sha256 and r.reviewed_at>=a.updated_at
 and r.technical_reviewed and r.school_identity_reviewed and r.unique_respondents_reviewed
 and r.personal_data_reviewed and r.small_sample_reviewed and r.reidentification_reviewed
 and r.prior_data_combination_reviewed,false) school_ok,
 not exists(select 1 from beagu_private.beagu_2026_civic_publication_hold h where h.school_id=a.school_id and h.active) no_hold
 from public.beagu_school_report_yearly a
 left join beagu_private.beagu_2026_percentile_scope_v13 c on c.source_version=a.source_version
 left join beagu_private.beagu_2026_percentile_school_review_v13 r on r.school_id=a.school_id and r.source_version=a.source_version
 left join public.beagu_2026_official_school_profiles p on p.school_id=a.school_id
 where a.survey_year=2026 and a.source_version=p_version and a.publication_status='WITHHELD'
 )
 select jsonb_build_object('candidate_schools',count(*),'common_scope_compatible',count(*) filter(where scope_ok),
 'official_teacher_threshold',count(*) filter(where official_ok),
 'school_review_complete',count(*) filter(where school_ok),
 'eligible_for_percentile_only_approval',count(*) filter(where scope_ok and official_ok and school_ok and no_hold),
 'publication_approved',false) from candidates
$$;
revoke all on function public.beagu_2026_percentile_v13_scope_review(text,uuid,uuid,text,boolean,boolean,text) from public,anon,authenticated;
revoke all on function public.beagu_2026_percentile_v13_school_review(text,text,numeric,integer,uuid,uuid,jsonb,text) from public,anon,authenticated;
revoke all on function public.beagu_2026_percentile_v13_preview(text) from public,anon,authenticated;
grant execute on function public.beagu_2026_percentile_v13_scope_review(text,uuid,uuid,text,boolean,boolean,text) to service_role;
grant execute on function public.beagu_2026_percentile_v13_school_review(text,text,numeric,integer,uuid,uuid,jsonb,text) to service_role;
grant execute on function public.beagu_2026_percentile_v13_preview(text) to service_role;
-- The preview is deliberately not a publication action. A separate verified
-- percentile-only approval migration is required before any live release.
