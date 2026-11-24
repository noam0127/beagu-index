-- v1.11.4 Waterway: service-only diagnostic, no approval or data mutation.
-- Deploy only via the approved backend release process; never execute as a live development step.
begin;
create or replace function public.beagu_2026_waterway_status_v1()
returns jsonb language sql stable security invoker set search_path='' as $waterway$
with assessed as (
 select r.school_id,
   case
     when exists (select 1 from beagu_private.beagu_2026_civic_publication_hold h
       where h.school_id=r.school_id and h.active) then 'PUBLICATION_RESTRICTED'
     when r.school_response_rows<1 or r.school_match_status is distinct from 'EXACT_REGION_OFFICE_NAME'
       or not exists (select 1 from beagu_private.beagu_2026_quality_reviews q
         where q.school_id=r.school_id and q.payload_sha256=r.payload_sha256 and q.quality_status='AUTO_PASS')
       or not exists (select 1 from beagu_private.beagu_2026_auto_review_status t
         where t.school_id=r.school_id and t.survey_year=2026
         and t.source_spreadsheet_id='1T_rEz1LqX97pC9gOv33SRmspK2IizTU3wFtxA8P1pC4'
         and t.technical_status='TECHNICAL_CHECK_PASSED'
         and t.source_response_rows=r.school_response_rows
         and t.matching_core_questions=13 and t.verified_catalog_questions=13
         and t.checked_at>=r.source_snapshot_at)
       then 'TECHNICAL_REVIEW_REQUIRED'
     when b.school_id is null then 'BASIS_MISSING'
     when b.payload_sha256 is distinct from r.payload_sha256 then 'BASIS_STALE'
     when b.review_status='REJECTED' then 'PUBLICATION_RESTRICTED'
     when not coalesce(b.review_status='VERIFIED'
       and b.basis_type in ('EXPLICIT_RESPONDENT_CONSENT','OTHER_DOCUMENTED_LEGAL_BASIS')
       and length(trim(coalesce(b.notice_source_ref,'')))>=12
       and b.notice_digest_sha256 ~ '^[a-f0-9]{64}$'
       and b.notice_effective_at<=r.source_snapshot_at
       and length(trim(coalesce(b.publication_scope,'')))>=20
       and b.reviewer_user_id is not null and b.reviewed_at>=r.source_snapshot_at
       and b.distinct_respondents_reviewed and b.personal_data_reviewed
       and b.small_sample_reviewed and b.reidentification_reviewed
       and b.prior_data_combination_reviewed,false) then 'BASIS_REVIEW_REQUIRED'
     when r.approval_status='APPROVED' and r.approved_payload_sha256=r.payload_sha256
       and r.approved_by=b.reviewer_user_id::text then 'APPROVAL_RECORDED_CURRENT'
     else 'BASIS_VERIFIED_AWAITING_APPROVAL'
   end as preflight_status
 from public.beagu_2026_results_snapshot r
 left join beagu_private.beagu_2026_publication_basis_review b on b.school_id=r.school_id
),
 counts as (
 select preflight_status,count(*) as schools from assessed group by preflight_status
 ), snap as (
 select count(*) as schools,coalesce(sum(school_response_rows),0) as rows,
 min(source_snapshot_at) as first_at,max(source_snapshot_at) as last_at
 from public.beagu_2026_results_snapshot
 ), sync as (
 select snapshot_at,totals from beagu_private.beagu_2026_results_sync where singleton
 ), progress as (
 select official_submission_rows,refreshed_at from public.beagu_2026_public_progress where id=1
 )
 select jsonb_build_object(
 'version',1,'checked_at',now(),
 'source',jsonb_build_object(
   'live_raw_rows',null,'live_raw_status','SOURCE_NOT_CONNECTED',
   'last_observed_official_rows',(select official_submission_rows from progress),
   'last_observed_at',(select refreshed_at from progress)),
 'sync',jsonb_build_object(
   'snapshot_at',(select snapshot_at from sync),
   'source_rows',(select totals->'source_rows' from sync),
   'official_rows',(select totals->'official_rows' from sync),
   'prelaunch_rows',(select totals->'prelaunch_rows' from sync),
   'undated_rows',(select totals->'undated_rows' from sync),
   'unmatched_rows',(select totals->'unmatched_rows' from sync),
   'matched_rows',(select case when totals->>'official_rows' ~ '^[0-9]+$' and totals->>'unmatched_rows' ~ '^[0-9]+$' and (totals->>'official_rows')::integer >= (totals->>'unmatched_rows')::integer then (totals->>'official_rows')::integer-(totals->>'unmatched_rows')::integer end from sync),
   'last_failure_at',null,'last_failure_reason',null,
   'status',case when not exists(select 1 from sync) then 'NO_SNAPSHOT'
    when (select refreshed_at from progress)>(select snapshot_at from sync)
     and (select official_submission_rows from progress) is distinct from (select (totals->>'official_rows')::integer from sync)
     then 'NEWER_COUNT_DIFFERS'
    when (select snapshot_at from sync)<now()-interval '26 hours' then 'SNAPSHOT_STALE'
    else 'SNAPSHOT_RECORDED' end),
 'aggregate',jsonb_build_object('schools',snap.schools,'rows',snap.rows,'snapshot_at',snap.last_at,
   'same_snapshot',coalesce(snap.first_at=snap.last_at and snap.last_at=(select snapshot_at from sync),false),
   'individual_valid_rows',null,'individual_review_rows',null,
   'distinct_respondents',null),
 'preflight',coalesce((select jsonb_object_agg(preflight_status,schools) from counts),'{}'::jsonb),
 'preflight_total',snap.schools,
 'release',public.beagu_2026_level_release_status()
 ) from snap;
$waterway$;
revoke all on function public.beagu_2026_waterway_status_v1() from public,anon,authenticated;
grant execute on function public.beagu_2026_waterway_status_v1() to service_role;
commit;
