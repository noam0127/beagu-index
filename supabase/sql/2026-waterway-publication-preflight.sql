-- Private, read-only publication preflight. Counts only; no raw answers,
-- school IDs, respondent counts per school, or public approval changes.
-- This is a diagnostic, NOT authorization to publish.
with assessed as (
 select r.school_id,
   case
     when exists (select 1 from beagu_private.beagu_2026_civic_publication_hold h
       where h.school_id=r.school_id and h.active) then 'PUBLICATION_RESTRICTED'
     when r.school_response_rows<1 or r.school_match_status is distinct from 'EXACT_REGION_OFFICE_NAME'
       or exists (select 1 from jsonb_array_elements(r.questions) q
         where coalesce((q->>'invalid')::integer,1)>0)
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
       and r.approved_by=b.reviewer_user_id::text
       and r.approved_at>=r.source_snapshot_at and r.approved_at>=r.updated_at then 'APPROVAL_RECORDED_CURRENT'
     else 'BASIS_VERIFIED_AWAITING_APPROVAL'
   end as preflight_status
 from public.beagu_2026_results_snapshot r
 left join beagu_private.beagu_2026_publication_basis_review b on b.school_id=r.school_id
)
select preflight_status,count(*) as schools from assessed group by preflight_status order by preflight_status;
