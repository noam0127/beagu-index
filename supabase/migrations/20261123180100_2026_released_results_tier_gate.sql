-- Apply per-level owner approval before returning any 2026 school question results.
-- Existing consent, snapshot, and 24h cooldown checks are retained.
create or replace function public.beagu_2026_released_question_results(p_school_id text)
returns jsonb language sql stable security definer set search_path='' as $$
  select (
    select coalesce(jsonb_agg(q.value),'[]'::jsonb)
    from jsonb_array_elements(r.questions) q(value)
    where q.value->>'id' not in ('Q31','Q51')
  ) from public.beagu_2026_results_snapshot r
  where r.school_id=p_school_id
    AND public.beagu_2026_level_school_published(r.school_id,1)
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

create or replace function public.beagu_2026_lv2_released_question_results(p_school_id text)
returns jsonb language sql stable security definer set search_path='' as $$
  select (
    select coalesce(jsonb_agg(q.value),'[]'::jsonb)
    from jsonb_array_elements(r.questions) q(value)
    where q.value->>'id' not in ('Q31','Q51')
  ) from public.beagu_2026_results_snapshot r
  where p_school_id ~ '^[A-Z0-9]{7}$'
    and r.school_id=p_school_id
    and public.beagu_2026_level_school_published(r.school_id,2)
    and r.approval_status='APPROVED'
    and r.approved_payload_sha256=r.payload_sha256
    and r.approved_at is not null
    and r.approved_at <= now()
    and r.approved_at >= r.source_snapshot_at
    and r.approved_at >= r.updated_at
    and r.payload_sha256 ~ '^[a-f0-9]{64}$'
    and r.approved_payload_sha256 ~ '^[a-f0-9]{64}$'
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
revoke all on function public.beagu_2026_lv2_released_question_results(text) from public, anon, authenticated;
grant execute on function public.beagu_2026_lv2_released_question_results(text) to service_role;
