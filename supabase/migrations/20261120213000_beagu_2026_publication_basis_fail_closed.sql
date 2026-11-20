-- 2026 release authorization is fail-closed until independent evidence has been
-- reviewed for the exact snapshot. This migration does NOT approve any school.
-- The legacy 24-hour release cooldown remains unchanged.
create table if not exists beagu_private.beagu_2026_publication_basis_review (
  school_id text primary key references public.schools(school_id),
  payload_sha256 text not null check(payload_sha256 ~ '^[a-f0-9]{64}$'),
  review_status text not null default 'PENDING'
    check(review_status in ('PENDING','VERIFIED','REJECTED')),
  basis_type text check(basis_type in ('EXPLICIT_RESPONDENT_CONSENT','OTHER_DOCUMENTED_LEGAL_BASIS')),
  notice_source_ref text,
  notice_digest_sha256 text check(notice_digest_sha256 ~ '^[a-f0-9]{64}$'),
  notice_effective_at timestamptz,
  publication_scope text,
  reviewer_user_id uuid references auth.users(id),
  distinct_respondents_reviewed boolean not null default false,
  personal_data_reviewed boolean not null default false,
  small_sample_reviewed boolean not null default false,
  reidentification_reviewed boolean not null default false,
  prior_data_combination_reviewed boolean not null default false,
  reviewed_at timestamptz,
  notes text,
  updated_at timestamptz not null default now(),
  constraint beagu_2026_verified_basis_complete check(
    review_status <> 'VERIFIED' OR (
      basis_type is not null
      and length(trim(coalesce(notice_source_ref,'')))>=12
      and length(trim(coalesce(publication_scope,'')))>=20
      and notice_digest_sha256 is not null
      and notice_effective_at is not null
      and reviewer_user_id is not null
      and reviewed_at is not null
      and distinct_respondents_reviewed
      and personal_data_reviewed
      and small_sample_reviewed
      and reidentification_reviewed
      and prior_data_combination_reviewed
    )
  )
);
alter table beagu_private.beagu_2026_publication_basis_review enable row level security;
revoke all on beagu_private.beagu_2026_publication_basis_review from public,anon,authenticated;
grant select,insert,update on beagu_private.beagu_2026_publication_basis_review to service_role;

-- Every school approval additionally requires a separate, source-linked,
-- owner-reviewed legal basis. Arbitrary 10-character memo strings cannot
-- substitute for that review, and the chosen version must remain unchanged.
create or replace function public.beagu_2026_approve_results(
  p_school_id text,p_expected_sha256 text,p_actor text,p_evidence jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare
  r public.beagu_2026_results_snapshot;
  k text;
  actor_id uuid;
  actor_session uuid;
begin
  if p_actor is null or p_actor !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or p_expected_sha256 !~ '^[a-f0-9]{64}$'
    or jsonb_typeof(p_evidence) is distinct from 'object'
  then raise exception 'invalid approval request'; end if;
  actor_id:=p_actor::uuid;
  if coalesce(p_evidence->>'admin_session_id','') !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then raise exception 'active MFA session required'; end if;
  actor_session:=(p_evidence->>'admin_session_id')::uuid;
  if not exists(select 1 from public.beagu_admin_accounts a
                where a.user_id=actor_id and a.enabled=true and a.role='owner')
     or not public.beagu_admin_active_mfa_session(actor_id,actor_session)
  then raise exception 'verified owner session required'; end if;

  select * into strict r from public.beagu_2026_results_snapshot
    where school_id=p_school_id for update;
  if r.payload_sha256 is distinct from p_expected_sha256
  then raise exception 'approval target mismatch'; end if;
  if r.school_match_status<>'EXACT_REGION_OFFICE_NAME'
    or exists(select 1 from jsonb_array_elements(r.questions) q
       where coalesce((q->>'invalid')::integer,1)>0)
  then raise exception 'technical review unresolved'; end if;
  if not exists(
      select 1 from beagu_private.beagu_2026_auto_review_status q
      where q.school_id=p_school_id and q.survey_year=2026
        and q.source_spreadsheet_id='1T_rEz1LqX97pC9gOv33SRmspK2IizTU3wFtxA8P1pC4'
        and q.technical_status='TECHNICAL_CHECK_PASSED'
        and q.matching_core_questions=13 and q.verified_catalog_questions=13
  ) then raise exception 'private technical review incomplete'; end if;
  if not exists(
      select 1 from beagu_private.beagu_2026_publication_basis_review b
      where b.school_id=p_school_id
        and b.payload_sha256=r.payload_sha256
        and b.review_status='VERIFIED'
        and b.reviewer_user_id=actor_id
        and b.reviewed_at>=r.source_snapshot_at
        and b.notice_effective_at<=r.source_snapshot_at
        and b.distinct_respondents_reviewed
        and b.personal_data_reviewed
        and b.small_sample_reviewed
        and b.reidentification_reviewed
        and b.prior_data_combination_reviewed
  ) then raise exception 'independent publication basis review is missing'; end if;

  foreach k in array array['source_scoring','school_identity','duplicate_responses',
    'consent','small_sample','reidentification','prior_data_combination'] loop
    if jsonb_typeof(p_evidence->k) is distinct from 'string'
       or coalesce(length(trim(p_evidence->>k)),0)<10
    then raise exception 'missing review evidence: %',k; end if;
  end loop;
  if p_evidence->>'decision'<>'APPROVE_EXACT_SNAPSHOT'
  then raise exception 'explicit approval required'; end if;
  if r.approval_status='APPROVED' and r.approved_payload_sha256=r.payload_sha256 then return; end if;
  update public.beagu_2026_results_snapshot set
    approval_status='APPROVED',approved_by=p_actor,approved_at=now(),
    approval_evidence=p_evidence,approved_payload_sha256=payload_sha256
  where school_id=p_school_id;
  insert into beagu_private.beagu_2026_results_approval_audit(
    school_id,payload_sha256,action,actor,evidence)
  values(p_school_id,r.payload_sha256,'APPROVED',p_actor,p_evidence);
end $$;
revoke all on function public.beagu_2026_approve_results(text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.beagu_2026_approve_results(text,text,text,jsonb) to service_role;

-- Defense in depth: even accidental direct snapshot approval cannot bypass the
-- verified-basis registry. Revoking the registry immediately removes access.
create or replace function public.beagu_2026_released_question_results(p_school_id text)
returns jsonb language sql stable security definer set search_path='' as $$
  select (
    select coalesce(jsonb_agg(q.value),'[]'::jsonb)
    from jsonb_array_elements(r.questions) q(value)
    where q.value->>'id' not in ('Q31','Q51')
  ) from public.beagu_2026_results_snapshot r
  where r.school_id=p_school_id
    and r.approval_status='APPROVED'
    and r.approved_payload_sha256=r.payload_sha256
    and r.approved_at <= now()-interval '24 hours'
    and r.approved_at >= r.updated_at
    and r.school_match_status='EXACT_REGION_OFFICE_NAME'
    and length(trim(r.approved_by))>=2
    and r.approval_evidence->>'decision'='APPROVE_EXACT_SNAPSHOT'
    and not exists(select 1 from unnest(array[
      'source_scoring','school_identity','duplicate_responses',
      'consent','small_sample','reidentification','prior_data_combination']) k
      where coalesce(length(trim(r.approval_evidence->>k)),0)<10)
    and not exists(select 1 from jsonb_array_elements(r.questions) q
      where coalesce((q->>'invalid')::integer,1)>0)
    and exists(
      select 1 from beagu_private.beagu_2026_publication_basis_review b
      where b.school_id=r.school_id
        and b.payload_sha256=r.payload_sha256
        and b.review_status='VERIFIED'
        and b.reviewer_user_id::text=r.approved_by
        and b.reviewed_at>=r.source_snapshot_at
        and b.notice_effective_at<=r.source_snapshot_at
        and b.distinct_respondents_reviewed
        and b.personal_data_reviewed
        and b.small_sample_reviewed
        and b.reidentification_reviewed
        and b.prior_data_combination_reviewed
    )
$$;
revoke all on function public.beagu_2026_released_question_results(text) from public,anon,authenticated;
grant execute on function public.beagu_2026_released_question_results(text) to service_role;
