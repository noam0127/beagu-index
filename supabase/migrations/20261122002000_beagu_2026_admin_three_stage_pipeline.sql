-- Admin-only three-stage 2026 workflow status.
-- Distinguish individual-response signals from school-level aggregate checks.
-- Read-only. Never marks snapshots APPROVED or changes release eligibility.
create or replace function public.beagu_2026_admin_pipeline_status()
returns jsonb language sql stable security definer set search_path='' as $fn$
 select jsonb_build_object(
  'year',2026,
  'response_trust',jsonb_build_object(
   'scope','REFERRAL_ONLY',
   'general_individual_check','NOT_CONNECTED',
   'referral_events',(select count(*) from beagu_private.challenge_referral_events e
       where e.campaign='2026'),
   'referral_review_required',(select count(*)
       from beagu_private.challenge_referral_quality_reviews q
       where q.quality_status='REVIEW_REQUIRED'),
   'referral_auto_pass',(select count(*)
       from beagu_private.challenge_referral_quality_reviews q
       where q.quality_status='AUTO_PASS')
  ),
  'aggregation_accuracy',jsonb_build_object(
   'total',(select count(*) from public.beagu_2026_results_snapshot),
   'basic_auto_pass',(select count(*) from public.beagu_2026_results_snapshot r
      join beagu_private.beagu_2026_quality_reviews q
       on q.school_id=r.school_id and q.payload_sha256=r.payload_sha256
       and q.quality_status='AUTO_PASS'),
   'basic_review_required',(select count(*) from public.beagu_2026_results_snapshot r
      left join beagu_private.beagu_2026_quality_reviews q
       on q.school_id=r.school_id and q.payload_sha256=r.payload_sha256
       where coalesce(q.quality_status,'NOT_SCANNED')<>'AUTO_PASS'),
   'full_technical_pass',(select count(*) from public.beagu_2026_results_snapshot r
      join beagu_private.beagu_2026_auto_review_status t
       on t.school_id=r.school_id and t.survey_year=2026
       and t.source_spreadsheet_id='1T_rEz1LqX97pC9gOv33SRmspK2IizTU3wFtxA8P1pC4'
       and t.technical_status='TECHNICAL_CHECK_PASSED'
       and t.checked_at>=r.source_snapshot_at),
   'snapshot_at',(select max(source_snapshot_at)
      from public.beagu_2026_results_snapshot),
   'basic_checked_at',(select max(checked_at)
      from beagu_private.beagu_2026_quality_reviews)
  ),
  'publication_eligibility',jsonb_build_object(
   'basis_verified',(select count(*) from public.beagu_2026_results_snapshot r
      join beagu_private.beagu_2026_publication_basis_review b
       on b.school_id=r.school_id and b.payload_sha256=r.payload_sha256
       and b.review_status='VERIFIED'),
   'approved',(select count(*) from public.beagu_2026_results_snapshot r
      where r.approval_status='APPROVED'
        and r.approved_payload_sha256=r.payload_sha256),
   'single_response_schools',(select count(*)
      from public.beagu_2026_results_snapshot where school_response_rows=1),
   'under_five_schools',(select count(*)
      from public.beagu_2026_results_snapshot where school_response_rows<5),
   'scope','SNAPSHOT_BOUND_PRIVATE_REVIEW'
  ),
  'note','AUTO_PASS_IS_AGGREGATE_INTEGRITY_NOT_INDIVIDUAL_TRUST_OR_RELEASE_AUTHORIZATION'
 )
$fn$;
revoke all on function public.beagu_2026_admin_pipeline_status()
 from public,anon,authenticated;
grant execute on function public.beagu_2026_admin_pipeline_status()
 to service_role;
