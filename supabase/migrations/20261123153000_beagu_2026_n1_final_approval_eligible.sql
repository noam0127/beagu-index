-- 2026 school publication rule: N>=1 may undergo full approval.
-- Includes N=1 schools; no unconditional N>=5 rejection.
-- Does NOT grant consent, assert review completion or approve any result.
-- Preserve the already enforced identity, MFA, technical, snapshot and
-- independently verified publication-basis checks.
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
  -- Minimum response eligibility is N>=1; a single response is NOT automatically
  -- disqualified by an arbitrary N>=5 threshold. Individual disclosure still
  -- requires documented consent/legal basis, re-identification review and MFA.
  if coalesce(r.school_response_rows,0)<1
  then raise exception 'at least one survey response required'; end if;
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
REVOKE ALL ON FUNCTION public.beagu_2026_approve_results(text,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.beagu_2026_approve_results(text,text,text,jsonb) TO service_role;
COMMENT ON FUNCTION public.beagu_2026_approve_results(text,text,text,jsonb) IS
 '2026 release policy: 1 or more respondents eligible for independent review/approval; no automatic five-response minimum. Publication requires valid documented basis, small-sample and re-identification review, snapshot hash match, verified owner MFA and audited decision.';
