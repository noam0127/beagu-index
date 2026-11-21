-- 2026 single-response school records: include n>=1 in the PRIVATE review workflow.
-- An arbitrary 5-response minimum is not imposed by the existing school-question
-- release gate. n=1 is eligible for technical and publication-basis *review*.
-- n=1 is NEVER evidence of consent, safe identifiability, or an approval to publish.
-- This migration is read-only and does not change public projection, release
-- authority, 24h delay, school-level responses, or official survey records.
-- No 2026 approval or VERIFIED basis row is created or modified.

CREATE OR REPLACE FUNCTION public.beagu_2026_admin_review_queue(p_filter text DEFAULT 'all'::text, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb;
begin
 if p_filter not in ('all','technical','question','school','prelaunch','approved','held','quality','single','single_technical','awaiting_basis')
    or p_limit<1 or p_limit>40 or p_offset<0 or p_offset>10000 then
   raise exception 'invalid review filters';
 end if;
 select jsonb_build_object(
   'summary', (select jsonb_build_object(
       'total',count(*),
       'technical',count(*) filter(where q.technical_status='TECHNICAL_CHECK_PASSED'),
       'question',count(*) filter(where q.technical_status='NEEDS_QUESTION_CHECK'),
       'school',count(*) filter(where q.technical_status='NEEDS_SCHOOL_CHECK'),
       'prelaunch',count(*) filter(where q.technical_status='PRELAUNCH_EXCLUDED'),
       'approved',count(*) filter(where r.approval_status='APPROVED'),
       'quality_auto',count(*) filter(where quality.quality_status='AUTO_PASS'),
       'single',count(*) filter(where r.school_response_rows=1),
       'single_technical',count(*) filter(where r.school_response_rows=1 AND q.technical_status='TECHNICAL_CHECK_PASSED'))
     from public.beagu_2026_results_snapshot r
     left join beagu_private.beagu_2026_quality_reviews quality on quality.school_id=r.school_id and quality.payload_sha256=r.payload_sha256
     left join beagu_private.beagu_2026_auto_review_status q on
       q.school_id=r.school_id and q.survey_year=2026
       and q.source_spreadsheet_id='1T_rEz1LqX97pC9gOv33SRmspK2IizTU3wFtxA8P1pC4'),
   'items',coalesce((
     select jsonb_agg(to_jsonb(v) order by v.school_id) from (
       select r.school_id,s.school_name,s.sido_standard AS region,
         s.support_office AS office,r.payload_sha256,
         r.school_response_rows AS private_response_rows,
         r.approval_status,r.approved_at,r.updated_at,
         coalesce(q.technical_status,'NOT_CHECKED') AS technical_status,
         coalesce(q.reasons,array['QA_NOT_AVAILABLE']::text[]) AS review_reasons,
         coalesce(quality.quality_status,'NOT_SCANNED') AS quality_status,
         coalesce(quality.reasons,array['QUALITY_SCAN_PENDING']::text[]) AS quality_reasons,
         coalesce(b.review_status,'NOT_REVIEWED') AS basis_review_status,
         b.reviewed_at AS basis_reviewed_at,
         (select a.action from beagu_private.beagu_2026_results_approval_audit a
           where a.school_id=r.school_id order by a.recorded_at desc,a.id desc limit 1)
           as last_decision
       from public.beagu_2026_results_snapshot r
       join public.schools s on s.school_id=r.school_id
       left join beagu_private.beagu_2026_auto_review_status q on
         q.school_id=r.school_id and q.survey_year=2026
         and q.source_spreadsheet_id='1T_rEz1LqX97pC9gOv33SRmspK2IizTU3wFtxA8P1pC4'
       left join beagu_private.beagu_2026_quality_reviews quality
         on quality.school_id=r.school_id and quality.payload_sha256=r.payload_sha256
       left join beagu_private.beagu_2026_publication_basis_review b
         on b.school_id=r.school_id and b.payload_sha256=r.payload_sha256
       where p_filter='all'
          or (p_filter='technical' and q.technical_status='TECHNICAL_CHECK_PASSED')
          or (p_filter='question' and q.technical_status='NEEDS_QUESTION_CHECK')
          or (p_filter='school' and q.technical_status='NEEDS_SCHOOL_CHECK')
          or (p_filter='prelaunch' and q.technical_status='PRELAUNCH_EXCLUDED')
          or (p_filter='approved' and r.approval_status='APPROVED')
          or (p_filter='held' and r.approval_status='WITHHELD')
          or (p_filter='quality' and coalesce(quality.quality_status,'NOT_SCANNED')<>'AUTO_PASS')
          or (p_filter='single' and r.school_response_rows=1)
          or (p_filter='single_technical' and r.school_response_rows=1
              and q.technical_status='TECHNICAL_CHECK_PASSED')
          or (p_filter='awaiting_basis' and r.school_response_rows>=1
              and q.technical_status='TECHNICAL_CHECK_PASSED'
              and not exists (
                 select 1 from beagu_private.beagu_2026_publication_basis_review verified
                 where verified.school_id=r.school_id
                   and verified.payload_sha256=r.payload_sha256
                   and verified.review_status='VERIFIED'))
       order by r.school_id
       limit p_limit offset p_offset
     ) v
   ),'[]'::jsonb),
   'notice','PRIVATE_REVIEW_ONLY_NO_CONSENT_OR_RELEASE_AUTHORIZATION')
 into result;
 return result;
end $function$
;

CREATE OR REPLACE FUNCTION public.beagu_2026_admin_pipeline_status()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
   'single_technical_pass',(select count(*)
      from public.beagu_2026_results_snapshot r
      join beagu_private.beagu_2026_auto_review_status t
        on t.school_id=r.school_id and t.survey_year=2026
        and t.source_spreadsheet_id='1T_rEz1LqX97pC9gOv33SRmspK2IizTU3wFtxA8P1pC4'
      where r.school_response_rows=1
        and t.technical_status='TECHNICAL_CHECK_PASSED'
        and t.checked_at>=r.source_snapshot_at),
   'single_technical_review_needed',(select count(*)
      from public.beagu_2026_results_snapshot r
      left join beagu_private.beagu_2026_auto_review_status t
        on t.school_id=r.school_id and t.survey_year=2026
        and t.source_spreadsheet_id='1T_rEz1LqX97pC9gOv33SRmspK2IizTU3wFtxA8P1pC4'
      where r.school_response_rows=1 and
         (t.technical_status IS DISTINCT FROM 'TECHNICAL_CHECK_PASSED'
          or t.checked_at<r.source_snapshot_at)),
   'single_verified_basis',(select count(*)
      from public.beagu_2026_results_snapshot r
      join beagu_private.beagu_2026_publication_basis_review b
        on b.school_id=r.school_id
       and b.payload_sha256=r.payload_sha256
       and b.review_status='VERIFIED'
      where r.school_response_rows=1),
   'one_response_review_policy','ONE_OR_MORE_NO_AUTOMATIC_N5_REJECTION',
   'single_school_release_rule','VERIFIED_BASIS_AND_SNAPSHOT_APPROVAL_REQUIRED',
   'under_five_schools',(select count(*)
      from public.beagu_2026_results_snapshot where school_response_rows<5),
   'scope','SNAPSHOT_BOUND_PRIVATE_REVIEW'
  ),
  'note','AUTO_PASS_IS_AGGREGATE_INTEGRITY_NOT_INDIVIDUAL_TRUST_OR_RELEASE_AUTHORIZATION'
 )
$function$
;

REVOKE ALL ON FUNCTION public.beagu_2026_admin_review_queue(text,integer,integer) FROM public,anon,authenticated;
REVOKE ALL ON FUNCTION public.beagu_2026_admin_pipeline_status() FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.beagu_2026_admin_review_queue(text,integer,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.beagu_2026_admin_pipeline_status() TO service_role;
