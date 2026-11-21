-- v1.1.0 stage28 B-01 — FORWARD-ONLY PRIVATE QUESTION API BOUNDARY.
-- Code and disposable CI test only; do not apply to production before
-- staged DB backup, verified consent/notice, independent review and E2E.
-- This supersedes Stage21's older tiered RPC with an explicit 2026
-- closed-question ID allowlist and closes the legacy 24h RPC as well.
begin;

create or replace function public.beagu_2026_tiered_released_question_results_v1(
 p_school_id text,p_level integer
) returns jsonb
language sql stable security definer set search_path='' as $fn$
 select (
   select coalesce(pg_catalog.jsonb_agg(q.value),'[]'::jsonb)
   from pg_catalog.jsonb_array_elements(r.questions) q(value)
   -- B-01: explicit closed-form allowlist: Q01..Q50 except Q31.
   -- Q51, custom suffixes (Q31.1), identities and free-answer columns
   -- are never emitted, even when approved data carries extra fields.
   where q.value->>'id' not in ('Q31','Q51')
     and q.value->>'id' ~ '^Q(0[1-9]|[1-4][0-9]|50)
 ) from public.beagu_2026_results_snapshot r
 where p_school_id ~ '^[A-Z0-9]{7}$'
   and p_level in (1,2,3)
   and r.school_id=p_school_id
   and r.approval_status='APPROVED'
   and r.approved_payload_sha256=r.payload_sha256
   and r.approved_at is not null
   and r.approved_at<=now()
   and r.approved_at>=r.updated_at
   and r.approved_at <= now() - case p_level
     when 1 then interval '24 hours'
     when 2 then interval '6 hours'
     else interval '0 hours'
   end
   and r.school_match_status='EXACT_REGION_OFFICE_NAME'
   and pg_catalog.length(pg_catalog.btrim(r.approved_by))>=2
   and r.approval_evidence->>'decision'='APPROVE_EXACT_SNAPSHOT'
   and not exists(
     select 1 from pg_catalog.unnest(array[
       'source_scoring','school_identity','duplicate_responses',
       'consent','small_sample','reidentification','prior_data_combination'
     ]) k
     where pg_catalog.length(pg_catalog.btrim(coalesce(
       r.approval_evidence->>k,'')))<10
   )
   and pg_catalog.jsonb_typeof(r.questions)='array'
   and not exists (
     select 1 from pg_catalog.jsonb_array_elements(r.questions) q
     where coalesce(q->>'invalid','') !~ '^[0-9]+$'
       or q->>'invalid'<>'0'
       or coalesce(q->>'valid','') !~ '^[0-9]+$'
   )
   and exists (
     select 1 from beagu_private.beagu_2026_publication_basis_review b
     where b.school_id=r.school_id
       and b.payload_sha256=r.payload_sha256
       and b.review_status='VERIFIED'
       and b.reviewer_user_id::text=r.approved_by
       and b.reviewed_at>=r.source_snapshot_at
       and b.notice_effective_at<=r.source_snapshot_at
       and b.basis_type in (
         'EXPLICIT_RESPONDENT_CONSENT',
         'OTHER_DOCUMENTED_LEGAL_BASIS'
       )
       and pg_catalog.length(pg_catalog.btrim(b.notice_source_ref))>=12
       and b.notice_digest_sha256 ~ '^[a-f0-9]{64}$'
       and pg_catalog.length(pg_catalog.btrim(b.publication_scope))>=20
       and b.distinct_respondents_reviewed is true
       and b.personal_data_reviewed is true
       and b.small_sample_reviewed is true
       and b.reidentification_reviewed is true
       and b.prior_data_combination_reviewed is true
   )
$fn$;

 ) from public.beagu_2026_results_snapshot r
 where p_school_id ~ '^[A-Z0-9]{7}$'
   and p_level in (1,2,3)
   and r.school_id=p_school_id
   and r.approval_status='APPROVED'
   and r.approved_payload_sha256=r.payload_sha256
   and r.approved_at is not null
   and r.approved_at<=now()
   and r.approved_at>=r.updated_at
   and r.approved_at <= now() - case p_level
     when 1 then interval '24 hours'
     when 2 then interval '6 hours'
     else interval '0 hours'
   end
   and r.school_match_status='EXACT_REGION_OFFICE_NAME'
   and pg_catalog.length(pg_catalog.btrim(r.approved_by))>=2
   and r.approval_evidence->>'decision'='APPROVE_EXACT_SNAPSHOT'
   and not exists(
     select 1 from pg_catalog.unnest(array[
       'source_scoring','school_identity','duplicate_responses',
       'consent','small_sample','reidentification','prior_data_combination'
     ]) k
     where pg_catalog.length(pg_catalog.btrim(coalesce(
       r.approval_evidence->>k,'')))<10
   )
   and pg_catalog.jsonb_typeof(r.questions)='array'
   and not exists (
     select 1 from pg_catalog.jsonb_array_elements(r.questions) q
     where coalesce(q->>'invalid','') !~ '^[0-9]+$'
       or q->>'invalid'<>'0'
       or coalesce(q->>'valid','') !~ '^[0-9]+$'
   )
   and exists (
     select 1 from beagu_private.beagu_2026_publication_basis_review b
     where b.school_id=r.school_id
       and b.payload_sha256=r.payload_sha256
       and b.review_status='VERIFIED'
       and b.reviewer_user_id::text=r.approved_by
       and b.reviewed_at>=r.source_snapshot_at
       and b.notice_effective_at<=r.source_snapshot_at
       and b.basis_type in (
         'EXPLICIT_RESPONDENT_CONSENT',
         'OTHER_DOCUMENTED_LEGAL_BASIS'
       )
       and pg_catalog.length(pg_catalog.btrim(b.notice_source_ref))>=12
       and b.notice_digest_sha256 ~ '^[a-f0-9]{64}$'
       and pg_catalog.length(pg_catalog.btrim(b.publication_scope))>=20
       and b.distinct_respondents_reviewed is true
       and b.personal_data_reviewed is true
       and b.small_sample_reviewed is true
       and b.reidentification_reviewed is true
       and b.prior_data_combination_reviewed is true
   )
$fn$;

-- The privileged internal RPC never serves an unreviewed snapshot.
revoke all on function public.beagu_2026_tiered_released_question_results_v1(text,integer)
 from public,anon,authenticated;
grant execute on function public.beagu_2026_tiered_released_question_results_v1(text,integer)
 to service_role;

-- Old legacy 24-hour endpoint MUST receive identical independently
-- approved, consent-checked, redacted output: no separate bypass.
create or replace function public.beagu_2026_released_question_results(
 p_school_id text
) returns jsonb language sql stable security definer set search_path='' as $fn$
 select public.beagu_2026_tiered_released_question_results_v1(p_school_id,1)
$fn$;
revoke all on function public.beagu_2026_released_question_results(text)
 from public,anon,authenticated;
grant execute on function public.beagu_2026_released_question_results(text)
 to service_role;

-- Same canonical review for the pre-existing Lv2 route (minimum 6h).
create or replace function public.beagu_2026_lv2_released_question_results(
 p_school_id text
) returns jsonb language sql stable security definer set search_path='' as $fn$
 select public.beagu_2026_tiered_released_question_results_v1(p_school_id,2)
$fn$;
revoke all on function public.beagu_2026_lv2_released_question_results(text)
 from public,anon,authenticated;
grant execute on function public.beagu_2026_lv2_released_question_results(text)
 to service_role;

comment on function public.beagu_2026_released_question_results(text) is
 'Stage28: legacy Lv1 uses same reviewed 2026 approved, 24h, privacy-redacted tiered RPC.';
comment on function public.beagu_2026_tiered_released_question_results_v1(text,integer) is
 'Stage28: approved exact snapshot only, public 2026 Q01-Q50 except sensitive Q31; Q51 and noncatalogue IDs blocked; 24h/6h/0h.';
commit;
