-- Private reviewer sees read-only automatic decision; no school aggregate payload.
CREATE OR REPLACE FUNCTION public.beagu_2026_admin_review_queue(p_filter text DEFAULT 'all'::text, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb;
begin
 if p_filter not in ('all','technical','question','school','prelaunch','approved','held')
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
       'approved',count(*) filter(where r.approval_status='APPROVED'))
     from public.beagu_2026_results_snapshot r
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
         coalesce(b.review_status,'NOT_REVIEWED') AS basis_review_status,
         coalesce(pr.decision,'PRECHECK_PENDING') AS automatic_decision,
         b.reviewed_at AS basis_reviewed_at,
         (select a.action from beagu_private.beagu_2026_results_approval_audit a
           where a.school_id=r.school_id order by a.recorded_at desc,a.id desc limit 1)
           as last_decision
       from public.beagu_2026_results_snapshot r
       join public.schools s on s.school_id=r.school_id
       left join beagu_private.beagu_2026_auto_review_status q on
         q.school_id=r.school_id and q.survey_year=2026
         and q.source_spreadsheet_id='1T_rEz1LqX97pC9gOv33SRmspK2IizTU3wFtxA8P1pC4'
       left join beagu_private.beagu_2026_publication_basis_review b
         on b.school_id=r.school_id and b.payload_sha256=r.payload_sha256
       left join beagu_private.beagu_2026_auto_release_preflight pr
         on pr.school_id=r.school_id and pr.payload_sha256=r.payload_sha256
       where p_filter='all'
          or (p_filter='technical' and q.technical_status='TECHNICAL_CHECK_PASSED')
          or (p_filter='question' and q.technical_status='NEEDS_QUESTION_CHECK')
          or (p_filter='school' and q.technical_status='NEEDS_SCHOOL_CHECK')
          or (p_filter='prelaunch' and q.technical_status='PRELAUNCH_EXCLUDED')
          or (p_filter='approved' and r.approval_status='APPROVED')
          or (p_filter='held' and r.approval_status='WITHHELD')
       order by r.school_id
       limit p_limit offset p_offset
     ) v
   ),'[]'::jsonb),
   'notice','PRIVATE_REVIEW_ONLY_NO_CONSENT_OR_RELEASE_AUTHORIZATION')
 into result;
 return result;
end $function$;

